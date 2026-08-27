import { NextRequest, NextResponse } from 'next/server';
import { sqliteDb, initAppDb } from '@/lib/db-app';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cpf: string }> }
) {
  try {
    initAppDb();

    const { cpf } = await params;

    if (!cpf) {
      return NextResponse.json(
        { success: false, error: 'CPF não fornecido.' },
        { status: 400 }
      );
    }

    const cleanCpf = cpf.replace(/\D/g, '');

    // Busca TODAS as solicitações do funcionário, sem filtrar por status,
    // da mais recente para a mais antiga.
    const changeRequests = sqliteDb
      .prepare(
        `SELECT * FROM change_requests WHERE employee_cpf = ? ORDER BY id DESC`
      )
      .all(cleanCpf) as any[];

    if (changeRequests.length === 0) {
      return NextResponse.json({ success: true, history: [] });
    }

    const fieldsStmt = sqliteDb.prepare(
      `SELECT * FROM change_request_fields WHERE change_request_id = ? ORDER BY id ASC`
    );
    const attachmentsStmt = sqliteDb.prepare(
      `SELECT * FROM change_request_attachments WHERE change_request_id = ? ORDER BY id ASC`
    );
    const fieldHistoryStmt = sqliteDb.prepare(
      `SELECT * FROM change_request_field_history WHERE field_id = ? ORDER BY reviewed_at ASC`
    );

    const history = changeRequests.map((cr) => {
      const fields = fieldsStmt.all(cr.id) as any[];

      // Para cada campo, anexa seu histórico de revisões (reenvios, aprovações, rejeições)
      const fieldsWithHistory = fields.map((field) => ({
        ...field,
        history: fieldHistoryStmt.all(field.id),
      }));

      const attachments = attachmentsStmt.all(cr.id);

      return {
        ...cr,
        fields: fieldsWithHistory,
        attachments,
      };
    });

    return NextResponse.json({ success: true, history });
  } catch (error: any) {
    console.error('Erro ao buscar histórico de solicitações do funcionário:', error);
    return NextResponse.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}