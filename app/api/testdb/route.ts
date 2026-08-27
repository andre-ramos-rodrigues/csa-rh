import { NextResponse } from 'next/server';
import { sqliteDb } from '@/lib/db-app';

export async function GET() {
  try {
    // 1. Limpa registros anteriores para evitar duplicatas nos testes
    sqliteDb.prepare('DELETE FROM change_request_attachments').run();
    sqliteDb.prepare('DELETE FROM change_request_field_history').run();
    sqliteDb.prepare('DELETE FROM change_request_fields').run();
    sqliteDb.prepare('DELETE FROM change_requests').run();

    const cpfAndre = '14182829794';
    const nomeAndre = 'Andre Rodrigues';

    // 2. Cria a solicitação principal incluindo employee_name
    const insertReq = sqliteDb.prepare(`
      INSERT INTO change_requests (employee_cpf, employee_name, status, submitted_at)
      VALUES (?, ?, ?, DATETIME('now'))
    `).run(cpfAndre, nomeAndre, 'pending');

    const requestId = insertReq.lastInsertRowid;

    // 3. Insere a alteração de endereço (Rua)
    sqliteDb.prepare(`
      INSERT INTO change_request_fields (request_id, field_name, old_value, new_value)
      VALUES (?, ?, ?, ?)
    `).run(requestId, 'RUA', 'Rua Voluntários da Pátria, 100', 'Praia de Botafogo');

    // 4. Insere a alteração de escolaridade
    sqliteDb.prepare(`
      INSERT INTO change_request_fields (request_id, field_name, old_value, new_value)
      VALUES (?, ?, ?, ?)
    `).run(requestId, 'ESCOLARIDADE', 'Ensino Superior Incompleto', 'Graduação Completa');

    // 5. Insere o documento fake em PDF anexado (Diploma / Comprovante)
    sqliteDb.prepare(`
      INSERT INTO change_request_attachments (request_id, file_name, file_path)
      VALUES (?, ?, ?)
    `).run(
      requestId,
      'diploma_graduacao_andre_rodrigues.pdf',
      '/uploads/14182829794/diploma_graduacao_andre_rodrigues.pdf'
    );

    return NextResponse.json({
      success: true,
      message: `Solicitação para ${nomeAndre} (CPF: ${cpfAndre}) inserida com sucesso!`,
      requestId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}