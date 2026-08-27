import { NextRequest, NextResponse } from 'next/server';
import { sqliteDb, initAppDb } from '@/lib/db-app';
import { getAuthUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  // 1. Verificação de Autenticação
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
  }

  try {
    initAppDb();

    const body = await request.json();
    const { fieldId, reviewNotes } = body;

    if (!fieldId) {
      return NextResponse.json(
        { success: false, error: 'O parâmetro fieldId é obrigatório.' },
        { status: 400 }
      );
    }

    // 2. Busca o campo no SQLite para validar sua existência
    const field = sqliteDb
      .prepare(
        `SELECT id, change_request_id, new_value, status 
         FROM change_request_fields 
         WHERE id = ?`
      )
      .get(fieldId) as { id: number; change_request_id: number; new_value: string; status: string } | undefined;

    if (!field) {
      return NextResponse.json(
        { success: false, error: 'Campo de solicitação não encontrado.' },
        { status: 404 }
      );
    }

    const reviewerIdentifier = user.nome || user.cpf || 'RH Admin';

    // 3. Processamento Atômico da Transação de Rejeição via SQLite
    const denyTransaction = sqliteDb.transaction(() => {
      // A. Atualiza o status do campo individual para 'rejected'
      sqliteDb
        .prepare(
          `UPDATE change_request_fields
           SET status = 'rejected',
               review_notes = ?
           WHERE id = ?`
        )
        .run(reviewNotes || null, fieldId);

      // B. Grava o histórico do campo com status 'rejected'
      sqliteDb
        .prepare(
          `INSERT INTO change_request_field_history (field_id, new_value, status, review_notes, reviewed_by, reviewed_at)
           VALUES (?, ?, 'rejected', ?, ?, datetime('now'))`
        )
        .run(fieldId, field.new_value, reviewNotes || null, reviewerIdentifier);

      // C. Verifica se ainda existem outros campos 'pending' nesta mesma solicitação
      const pendingResult = sqliteDb
        .prepare(
          `SELECT COUNT(*) as count 
           FROM change_request_fields 
           WHERE change_request_id = ? AND status = 'pending'`
        )
        .get(field.change_request_id) as { count: number };

      // D. Se não houver mais campos pendentes, define o status final da solicitação pai
      if (pendingResult.count === 0) {
        // Verifica se ao menos um campo da solicitação foi aprovado anteriormente
        const approvedResult = sqliteDb
          .prepare(
            `SELECT COUNT(*) as count 
             FROM change_request_fields 
             WHERE change_request_id = ? AND status = 'approved'`
          )
          .get(field.change_request_id) as { count: number };

        // Se pelo menos 1 campo foi aprovado, a solicitação encerra como 'approved'.
        // Se todos foram rejeitados, encerra como 'rejected'.
        const finalParentStatus = approvedResult.count > 0 ? 'approved' : 'rejected';

        try {
          sqliteDb
            .prepare(
              `UPDATE change_requests
               SET status = ?,
                   reviewed_by = ?,
                   reviewed_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ?`
            )
            .run(finalParentStatus, reviewerIdentifier, field.change_request_id);
        } catch {
          // Fallback seguro caso a coluna updated_at não exista na tabela principal
          sqliteDb
            .prepare(
              `UPDATE change_requests
               SET status = ?,
                   reviewed_by = ?,
                   reviewed_at = datetime('now')
               WHERE id = ?`
            )
            .run(finalParentStatus, reviewerIdentifier, field.change_request_id);
        }
      }

      return pendingResult.count;
    });

    const remainingPendingCount = denyTransaction();

    return NextResponse.json({
      success: true,
      message: 'Campo rejeitado com sucesso!',
      updatedFieldId: fieldId,
      changeRequestId: field.change_request_id,
      parentRequestClosed: remainingPendingCount === 0,
    });
  } catch (error: any) {
    console.error('❌ Erro ao processar rejeição:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao processar rejeição no banco de dados.' },
      { status: 500 }
    );
  }
}