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

    // 3. Processamento Atômico da Transação via SQLite
    const approveTransaction = sqliteDb.transaction(() => {
      // A. Atualiza o status do campo individual para 'approved'
      sqliteDb
        .prepare(
          `UPDATE change_request_fields
           SET status = 'approved',
               applied_at = datetime('now'),
               review_notes = ?
           WHERE id = ?`
        )
        .run(reviewNotes || null, fieldId);

      // B. Grava o histórico do campo
      sqliteDb
        .prepare(
          `INSERT INTO change_request_field_history (field_id, new_value, status, review_notes, reviewed_by, reviewed_at)
           VALUES (?, ?, 'approved', ?, ?, datetime('now'))`
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

      // D. Se todos os campos foram analisados/aprovados, encerra a solicitação pai
      if (pendingResult.count === 0) {
        try {
          sqliteDb
            .prepare(
              `UPDATE change_requests
               SET status = 'approved',
                   reviewed_by = ?,
                   reviewed_at = datetime('now'),
                   applied_at = datetime('now'),
                   updated_at = datetime('now')
               WHERE id = ?`
            )
            .run(reviewerIdentifier, field.change_request_id);
        } catch {
          // Fallback seguro caso colunas opcionais (como updated_at) não existam na tabela principal
          sqliteDb
            .prepare(
              `UPDATE change_requests
               SET status = 'approved',
                   reviewed_by = ?,
                   reviewed_at = datetime('now')
               WHERE id = ?`
            )
            .run(reviewerIdentifier, field.change_request_id);
        }
      }

      return pendingResult.count;
    });

    const remainingPendingCount = approveTransaction();

    return NextResponse.json({
      success: true,
      message: 'Campo aprovado com sucesso!',
      updatedFieldId: fieldId,
      changeRequestId: field.change_request_id,
      parentRequestClosed: remainingPendingCount === 0,
    });
  } catch (error: any) {
    console.error('❌ Erro ao processar aprovação:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao processar aprovação no banco de dados.' },
      { status: 500 }
    );
  }
}