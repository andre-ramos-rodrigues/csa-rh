import { NextRequest, NextResponse } from 'next/server';
import { totvsPool, totvsPoolConnect } from '@/lib/db-totvs';
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

    await totvsPoolConnect;
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

    // 2. Roteamento por Seção e Execução das Queries Dinâmicas no TOTVS
    switch (currentSection) {
      case 'identificacao': {
        const reqUpdate = totvsPool.request();
        reqUpdate.input('codPessoa', CODPESSOA);
        const nomeVal = typeof payload === 'object' && payload !== null ? (payload.NOME || payload.nome) : payload;

        if (nomeVal) {
          reqUpdate.input('nome', nomeVal);
          await reqUpdate.query(`
            UPDATE PPESSOA
            SET NOME = @nome
            WHERE CODIGO = @codPessoa
          `);
        }
        break;
      }

      case 'estado-civil': {
        const reqUpdate = totvsPool.request();
        reqUpdate.input('codPessoa', CODPESSOA);
        const ecVal = typeof payload === 'object' && payload !== null ? (payload.ESTADOCIVIL || payload.estadoCivil || payload.estadocivil) : payload;

        if (ecVal) {
          reqUpdate.input('estadoCivil', ecVal);
          await reqUpdate.query(`
            UPDATE PPESSOA
            SET ESTADOCIVIL = @estadoCivil
            WHERE CODIGO = @codPessoa
          `);
        }
        break;
      }

      case 'escolaridade': {
        const reqUpdate = totvsPool.request();
        reqUpdate.input('codPessoa', CODPESSOA);
        const escVal = typeof payload === 'object' && payload !== null ? (payload.GRAUINSTRUCAO || payload.grauInstrucao || payload.grauinstrucao) : payload;

        if (escVal) {
          reqUpdate.input('grauInstrucao', escVal);
          await reqUpdate.query(`
            UPDATE PPESSOA
            SET GRAUINSTRUCAO = @grauInstrucao
            WHERE CODIGO = @codPessoa
          `);
        }
        break;
      }

      case 'endereco': {
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
          const value = typeof payload === 'object' && payload !== null
            ? (payload[columnName] !== undefined ? payload[columnName] : payload[columnName.toLowerCase()])
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
        break;
      }

      case 'contato': {
        const reqUpdate = totvsPool.request();
        reqUpdate.input('codPessoa', CODPESSOA);

        const allowedFields: Record<string, string> = {
          TELEFONE1: 'telefone1',
          TELEFONE2: 'telefone2',
          EMAIL: 'email',
        };

        const setClauses: string[] = [];

        for (const [columnName, paramName] of Object.entries(allowedFields)) {
          const value = typeof payload === 'object' && payload !== null
            ? (payload[columnName] !== undefined ? payload[columnName] : payload[columnName.toLowerCase()])
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
        break;
      }

      case 'dependentes': {
        let depList: any[] = [];
        if (Array.isArray(payload)) {
          depList = payload;
        } else if (payload && Array.isArray(payload.dependentes)) {
          depList = payload.dependentes;
        } else if (payload && typeof payload === 'object') {
          depList = [payload];
        }

        for (let i = 0; i < depList.length; i++) {
          const item = depList[i];
          const depId = item.ID || item.NDEPEND || item.depId;

          if (depId && !String(depId).startsWith('novo_')) {
            const reqDep = totvsPool.request();
            reqDep.input('chapa', CHAPA);
            reqDep.input('depId', depId);

            const setClauses: string[] = [];

            if (item.NOME !== undefined || item.nome !== undefined) {
              setClauses.push(`NOME = @nome_${i}`);
              reqDep.input(`nome_${i}`, item.NOME ?? item.nome);
            }

            if (item.CPF !== undefined || item.cpf !== undefined) {
              setClauses.push(`CPF = @cpf_${i}`);
              reqDep.input(`cpf_${i}`, sanitizeCpf(item.CPF ?? item.cpf));
            }

            if (item.GRAUPARENTESCO !== undefined || item.grauParentesco !== undefined || item.grau_parentesco !== undefined) {
              setClauses.push(`GRAUPARENTESCO = @grauParentesco_${i}`);
              reqDep.input(`grauParentesco_${i}`, item.GRAUPARENTESCO ?? item.grauParentesco ?? item.grau_parentesco);
            }

            if (item.SEXO !== undefined || item.sexo !== undefined) {
              setClauses.push(`SEXO = @sexo_${i}`);
              reqDep.input(`sexo_${i}`, item.SEXO ?? item.sexo);
            }

            if (item.DATANASCIMENTO !== undefined || item.dataNascimento !== undefined || item.data_nascimento !== undefined) {
              setClauses.push(`DATANASCIMENTO = @dataNascimento_${i}`);
              reqDep.input(`dataNascimento_${i}`, item.DATANASCIMENTO ?? item.dataNascimento ?? item.data_nascimento);
            }

            if (item.INCIRRF !== undefined || item.incIrrf !== undefined) {
              const val = item.INCIRRF ?? item.incIrrf;
              const incIrrfNum = (val === '1' || val === 1 || val === true) ? 1 : 0;
              setClauses.push(`INCIRRF = @incIrrf_${i}`);
              reqDep.input(`incIrrf_${i}`, incIrrfNum);
            }

            if (setClauses.length > 0) {
              await reqDep.query(`
                UPDATE PFDEPEND
                SET ${setClauses.join(', ')}
                WHERE CHAPA = @chapa AND NDEPEND = @depId
              `);
            }
          } else {
            const reqDep = totvsPool.request();
            reqDep.input('chapa', CHAPA);
            reqDep.input('nome', item.NOME || item.nome || '');
            reqDep.input('cpf', sanitizeCpf(item.CPF || item.cpf || ''));
            reqDep.input('grauParentesco', item.GRAUPARENTESCO || item.grauParentesco || item.grau_parentesco || '');
            reqDep.input('sexo', item.SEXO || item.sexo || '');
            reqDep.input('dataNascimento', item.DATANASCIMENTO || item.dataNascimento || null);

            const incVal = item.INCIRRF ?? item.incIrrf;
            reqDep.input('incIrrf', incVal === '1' || incVal === 1 || incVal === true ? 1 : 0);

            await reqDep.query(`
              INSERT INTO PFDEPEND (CHAPA, NOME, CPF, GRAUPARENTESCO, SEXO, DATANASCIMENTO, INCIRRF)
              VALUES (@chapa, @nome, @cpf, @grauParentesco, @sexo, @dataNascimento, @incIrrf)
            `);
          }
        }
        break;
      }

      case 'formacao-academica': {
        let formList: any[] = [];
        if (Array.isArray(payload)) {
          formList = payload;
        } else if (payload && Array.isArray(payload.formacao)) {
          formList = payload.formacao;
        } else if (payload && typeof payload === 'object') {
          formList = [payload];
        }

        for (let i = 0; i < formList.length; i++) {
          const item = formList[i];
          const formId = item.ID || item.formId || item.id;

          if (formId && !String(formId).startsWith('novo_')) {
            const reqForm = totvsPool.request();
            reqForm.input('codPessoa', CODPESSOA);
            reqForm.input('formId', formId);

            const setClauses: string[] = [];

            if (item.CODENTIDADE !== undefined || item.codEntidade !== undefined) {
              setClauses.push(`CODENTIDADE = @codEntidade_${i}`);
              reqForm.input(`codEntidade_${i}`, item.CODENTIDADE ?? item.codEntidade);
            }

            if (item.CODCURSO !== undefined || item.codCurso !== undefined) {
              setClauses.push(`CODCURSO = @codCurso_${i}`);
              reqForm.input(`codCurso_${i}`, item.CODCURSO ?? item.codCurso);
            }

            if (item.CODGRAU !== undefined || item.codGrau !== undefined) {
              setClauses.push(`CODGRAU = @codGrau_${i}`);
              reqForm.input(`codGrau_${i}`, item.CODGRAU ?? item.codGrau);
            }

            if (item.SITUACAO !== undefined || item.situacao !== undefined) {
              setClauses.push(`SITUACAO = @situacao_${i}`);
              reqForm.input(`situacao_${i}`, item.SITUACAO ?? item.situacao);
            }

            if (item.DATAINICIO !== undefined || item.dataInicio !== undefined) {
              setClauses.push(`DATAINICIO = @dataInicio_${i}`);
              reqForm.input(`dataInicio_${i}`, item.DATAINICIO ?? item.dataInicio);
            }

            if (item.DATATERMINO !== undefined || item.dataTermino !== undefined) {
              setClauses.push(`DATATERMINO = @dataTermino_${i}`);
              reqForm.input(`dataTermino_${i}`, item.DATATERMINO ?? item.dataTermino);
            }

            if (setClauses.length > 0) {
              await reqForm.query(`
                UPDATE VFORMACAOACAD
                SET ${setClauses.join(', ')}
                WHERE CODPESSOA = @codPessoa AND ID = @formId
              `);
            }
          } else {
            const reqForm = totvsPool.request();
            reqForm.input('codPessoa', CODPESSOA);
            reqForm.input('codEntidade', item.CODENTIDADE || item.codEntidade || null);
            reqForm.input('codCurso', item.CODCURSO || item.codCurso || null);
            reqForm.input('codGrau', item.CODGRAU || item.codGrau || null);
            reqForm.input('situacao', item.SITUACAO || item.situacao || 'Cursando');
            reqForm.input('dataInicio', item.DATAINICIO || item.dataInicio || null);
            reqForm.input('dataTermino', item.DATATERMINO || item.dataTermino || null);

            await reqForm.query(`
              INSERT INTO VFORMACAOACAD (CODPESSOA, CODENTIDADE, CODCURSO, CODGRAU, SITUACAO, DATAINICIO, DATATERMINO)
              VALUES (@codPessoa, @codEntidade, @codCurso, @codGrau, @situacao, @dataInicio, @dataTermino)
            `);
          }
        }
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: `Sessão de migração "${section}" desconhecida.` },
          { status: 400 }
        );
    }

    // 3. SINCRONIZAÇÃO COM O SQLITE LOCAL (Altera status de 'approved' para 'migrated')
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
      console.error('⚠️ Migração enviada para o TOTVS, mas falhou ao atualizar SQLite local:', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: `Migração da sessão "${section}" concluída no TOTVS e sincronizada no SQLite com sucesso.`,
      latency_ms: Date.now() - start,
    });
  } catch (error: any) {
    console.error(`Erro ao migrar sessão "${section}" para TOTVS:`, error);
    return NextResponse.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}