import { NextRequest, NextResponse } from 'next/server';
import { sqliteDb, initAppDb } from '@/lib/db-app';
import { getAuthUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
  }

  try {
    initAppDb();

    const body = await request.json();
    const {
      fieldId,
      field_id,
      fieldName,
      field_name,
      fieldVariations,
      requestId,
      request_id,
      employeeCpf,
      employee_cpf,
      cpf,
      reviewNotes,
    } = body;

    const targetFieldId = fieldId || field_id;
    const targetRequestId = requestId || request_id;
    const targetFieldName = fieldName || field_name;
    const cleanCpf = String(employeeCpf || employee_cpf || cpf || '').replace(/\D/g, '');

    console.log('🔄 [returntopending] Requisição recebida:', {
      targetFieldId,
      targetRequestId,
      targetFieldName,
      cleanCpf,
    });

    if (!targetFieldId && !targetRequestId && !cleanCpf) {
      return NextResponse.json(
        { success: false, error: 'É necessário informar fieldId, requestId ou employeeCpf.' },
        { status: 400 }
      );
    }

    const reviewerIdentifier = user.nome || user.cpf || user.usuario || 'RH Admin';

    const returnToPendingTransaction = sqliteDb.transaction(() => {
      let updatedFieldsCount = 0;
      let updatedRequestsCount = 0;
      const affectedRequestIds = new Set<number>();
      const fieldsToUpdate: { id: number; change_request_id: number; new_value: string; field_name: string }[] = [];

      // 1. Cancelamento por ID direto do campo (fieldId)
      if (targetFieldId) {
        const field = sqliteDb
          .prepare(`SELECT id, change_request_id, field_name, new_value FROM change_request_fields WHERE id = ?`)
          .get(targetFieldId) as { id: number; change_request_id: number; field_name: string; new_value: string } | undefined;

        if (field) {
          fieldsToUpdate.push(field);
        }
      } 
      // 2. Busca abrangente por CPF / requestId
      else {
        let sql = `
          SELECT crf.id, crf.change_request_id, crf.field_name, crf.new_value, crf.status
          FROM change_request_fields crf
          JOIN change_requests cr ON cr.id = crf.change_request_id
          WHERE 1=1
        `;
        const params: any[] = [];

        if (cleanCpf) {
          sql += ` AND REPLACE(REPLACE(REPLACE(cr.employee_cpf, '.', ''), '-', ''), ' ', '') = ?`;
          params.push(cleanCpf);
        } else if (targetRequestId) {
          sql += ` AND crf.change_request_id = ?`;
          params.push(targetRequestId);
        }

        const candidateFields = sqliteDb.prepare(sql).all(...params) as {
          id: number;
          change_request_id: number;
          field_name: string;
          new_value: string;
          status: string;
        }[];

        // Se informou o nome do campo (ex: "FORMACAO_ACADEMICA")
        if (targetFieldName) {
          const normalize = (str: string) =>
            String(str || '')
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]/g, '');

          const searchTokens = new Set<string>();
          searchTokens.add(normalize(targetFieldName));

          if (Array.isArray(fieldVariations)) {
            fieldVariations.forEach((v) => v && searchTokens.add(normalize(String(v))));
          }

          let matched = candidateFields.filter((f) => {
            const fNorm = normalize(f.field_name);
            for (const tNorm of searchTokens) {
              if (fNorm === tNorm || fNorm.includes(tNorm) || tNorm.includes(fNorm)) return true;

              if (
                (tNorm.includes('formacao') || tNorm.includes('academica') || tNorm.includes('curso')) &&
                (fNorm.includes('formacao') || fNorm.includes('academica') || fNorm.includes('curso'))
              ) {
                return true;
              }
            }
            return false;
          });

          // Prioriza APENAS campos que estejam atualmente como 'approved' ou 'migrated' para desfazer a aprovação
          const activeApproved = matched.filter((f) =>
            ['approved', 'migrated'].includes(String(f.status).toLowerCase())
          );

          if (activeApproved.length > 0) {
            matched = activeApproved;
          }

          // Fallback por requestId se nada for encontrado
          if (matched.length === 0 && targetRequestId) {
            matched = candidateFields.filter((f) => f.change_request_id === targetRequestId);
          }

          fieldsToUpdate.push(...matched);
        } else {
          let allToCancel = candidateFields;
          if (targetRequestId) {
            const reqSpecific = candidateFields.filter((f) => f.change_request_id === targetRequestId);
            if (reqSpecific.length > 0) {
              allToCancel = reqSpecific;
            }
          }
          fieldsToUpdate.push(...allToCancel);
        }
      }

      console.log(`🎯 [returntopending] Campos selecionados para alteração:`, fieldsToUpdate);

      // Atualiza os campos individuais no SQLite
      fieldsToUpdate.forEach((f) => {
        affectedRequestIds.add(f.change_request_id);

        sqliteDb
          .prepare(
            `UPDATE change_request_fields 
             SET status = 'pending', applied_at = NULL, review_notes = ? 
             WHERE id = ?`
          )
          .run(reviewNotes || 'Aprovação cancelada pelo RH', f.id);

        try {
          sqliteDb
            .prepare(
              `INSERT INTO change_request_field_history (field_id, new_value, status, review_notes, reviewed_by, reviewed_at)
               VALUES (?, ?, 'pending', ?, ?, datetime('now'))`
            )
            .run(f.id, f.new_value, reviewNotes || 'Aprovação cancelada pelo RH', reviewerIdentifier);
        } catch (e) {
          // Ignora caso a tabela de histórico não exista
        }
      });

      // Atualiza a tabela pai (change_requests) usando UPDATE OR IGNORE para prevenir UNIQUE constraint errors
      affectedRequestIds.forEach((reqId) => {
        sqliteDb
          .prepare(
            `UPDATE OR IGNORE change_requests 
             SET status = 'pending', applied_at = NULL, reviewed_by = ?, reviewed_at = datetime('now') 
             WHERE id = ?`
          )
          .run(reviewerIdentifier, reqId);
      });

      updatedFieldsCount = fieldsToUpdate.length;
      updatedRequestsCount = affectedRequestIds.size;

      return { updatedFieldsCount, updatedRequestsCount };
    });

    const result = returnToPendingTransaction();

    console.log('✅ [returntopending] Resultado final:', result);

    if (result.updatedFieldsCount === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Nenhum campo correspondente foi encontrado para alterar o status.`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Status retornado de aprovado para pendente com sucesso!',
      updatedFields: result.updatedFieldsCount,
      updatedRequests: result.updatedRequestsCount,
    });
  } catch (error: any) {
    console.error('❌ Erro ao retornar para pendente:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno ao processar alteração no banco.' },
      { status: 500 }
    );
  }
}