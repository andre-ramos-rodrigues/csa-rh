import { NextRequest, NextResponse } from 'next/server';
import { totvsPool, getTotvsConnection } from '@/lib/db-totvs';
import { sqliteDb, initAppDb } from '@/lib/db-app';

function sanitizeCpf(cpf: string) {
  if (!cpf) return '';
  return String(cpf).replace(/\D/g, '');
}

function formatCpf(cpf: string) {
  const clean = sanitizeCpf(cpf);
  if (!clean || clean.length !== 11) return cpf || '';
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;
  const start = Date.now();

  try {
    const body = await request.json();
    const { employeeCpf, payload, requestId, request_id } = body;

    const cleanCpf = sanitizeCpf(employeeCpf);
    const formattedCpf = formatCpf(cleanCpf);
    const targetRequestId = requestId || request_id;

    if (!cleanCpf) {
      return NextResponse.json(
        { success: false, error: 'CPF do funcionário é obrigatório.' },
        { status: 400 }
      );
    }

    console.log('Iniciando migração de: ', formattedCpf, 'payload: ', payload);

    await getTotvsConnection();
    const req = totvsPool.request();

    req.input('cleanCpf', cleanCpf);
    req.input('formattedCpf', formattedCpf);

    // 1. Busca os IDs do Funcionário (CODPESSOA e CHAPA) no TOTVS
    const empQueryResult = await req.query(`
      SELECT TOP 1 P.CODIGO AS CODPESSOA, F.CHAPA
      FROM PPESSOA P
      JOIN PFUNC F ON F.CODPESSOA = P.CODIGO
      WHERE P.FUNCIONARIO = 1 
        AND F.CODFILIAL = 1
        AND F.CODSITUACAO <> 'D'
        AND (P.CPF = @cleanCpf OR P.CPF = @formattedCpf)
    `);

    const employee = empQueryResult.recordset[0];
    if (!employee) {
      return NextResponse.json(
        { success: false, error: 'Funcionário não encontrado no TOTVS.' },
        { status: 404 }
      );
    }

    const { CODPESSOA, CHAPA } = employee;
    const currentSection = section.toLowerCase();
    let isSimulated = true;

    // 2. Processamento: Execução real apenas para "endereco"
    if (currentSection === 'endereco') {
      isSimulated = false;
      const reqUpdate = totvsPool.request();
      reqUpdate.input('codPessoa', CODPESSOA);

      const allowedFields: Record<string, string> = {
        RUA: 'rua',
        NUMERO: 'numero',
        COMPLEMENTO: 'complemento',
        BAIRRO: 'bairro',
        CIDADE: 'cidade',
        ESTADO: 'estado',
        CEP: 'cep',
        PAIS: 'pais',
      };

      const setClauses: string[] = [];

      for (const [columnName, paramName] of Object.entries(allowedFields)) {
        const value =
          payload && payload[columnName] !== undefined
            ? payload[columnName]
            : payload
            ? payload[columnName.toLowerCase()]
            : undefined;

        if (value !== undefined && value !== null) {
          setClauses.push(`${columnName} = @${paramName}`);
          reqUpdate.input(paramName, value);
        }
      }

      if (setClauses.length > 0) {
        await reqUpdate.query(`
          UPDATE PPESSOA
          SET ${setClauses.join(', ')}
          WHERE CODIGO = @codPessoa
        `);
      }

      console.log(`[TOTVS MIGRATE - REAL] Endereço atualizado no banco para CODPESSOA ${CODPESSOA}:`, payload);
    } else {
      console.log(`[TOTVS MIGRATE - SIMULAÇÃO] Seção "${currentSection}" recebida para CODPESSOA ${CODPESSOA} (CHAPA: ${CHAPA}):`, payload);
    }

    // 3. Atualização no SQLite local: Altera o status de 'approved' para 'migrated'
    try {
      initAppDb();

      if (targetRequestId) {
        sqliteDb
          .prepare(
            `UPDATE change_request_fields 
             SET status = 'migrated', applied_at = datetime('now') 
             WHERE change_request_id = ? AND status = 'approved'`
          )
          .run(targetRequestId);

        sqliteDb
          .prepare(
            `UPDATE change_requests 
             SET status = 'migrated', applied_at = datetime('now'), updated_at = datetime('now') 
             WHERE id = ?`
          )
          .run(targetRequestId);
      } else {
        const payloadKeys = typeof payload === 'object' && payload !== null ? Object.keys(payload) : [];

        if (payloadKeys.length > 0) {
          const placeholders = payloadKeys.map(() => '?').join(',');

          sqliteDb
            .prepare(
              `UPDATE change_request_fields 
               SET status = 'migrated', applied_at = datetime('now') 
               WHERE status = 'approved' 
                 AND change_request_id IN (
                   SELECT id FROM change_requests WHERE employee_cpf = ?
                 )
                 AND (
                   field_name IN (${placeholders})
                   OR LOWER(field_name) IN (${payloadKeys.map(() => '?').join(',')})
                 )`
            )
            .run(cleanCpf, ...payloadKeys, ...payloadKeys.map((k) => k.toLowerCase()));
        } else {
          sqliteDb
            .prepare(
              `UPDATE change_request_fields 
               SET status = 'migrated', applied_at = datetime('now') 
               WHERE status = 'approved' 
                 AND change_request_id IN (
                   SELECT id FROM change_requests WHERE employee_cpf = ?
                 )`
            )
            .run(cleanCpf);
        }

        // Finaliza solicitações pai que não têm mais campos pendentes/aprovados
        sqliteDb
          .prepare(
            `UPDATE change_requests 
             SET status = 'migrated', applied_at = datetime('now'), updated_at = datetime('now') 
             WHERE employee_cpf = ? 
               AND id NOT IN (
                 SELECT DISTINCT change_request_id 
                 FROM change_request_fields 
                 WHERE status IN ('approved', 'pending')
               )`
          )
          .run(cleanCpf);
      }
    } catch (dbErr) {
      console.error('⚠️ Sucesso na migração, mas falha ao atualizar SQLite local:', dbErr);
    }

    return NextResponse.json({
      success: true,
      isSimulated,
      message: isSimulated
        ? `[SIMULAÇÃO] Migração da seção "${currentSection}" concluída e sincronizada no SQLite como "migrated".`
        : `Endereço atualizado no TOTVS e status alterado para "migrated" no SQLite local com sucesso.`,
      latency_ms: Date.now() - start,
    });

  } catch (error: any) {
    console.error(`Erro ao processar migração para a seção "${section}":`, error);
    return NextResponse.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}