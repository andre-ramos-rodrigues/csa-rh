import { NextResponse } from 'next/server';
import { sqliteDb, initAppDb } from '@/lib/db-app';

export async function GET() {
  try {
    initAppDb();

    // 1. Limpa registros anteriores para evitar duplicatas durante os testes
    sqliteDb.exec(`
      DELETE FROM change_request_attachments;
      DELETE FROM change_request_field_history;
      DELETE FROM change_request_fields;
      DELETE FROM change_requests;
    `);

    const cpfAndre = '14182829794';
    const nomeAndre = 'ANDRÉ AUGUSTO RAMOS RODRIGUES';

    // 2. Cria a solicitação principal para o Andre
    const insertReq = sqliteDb.prepare(`
      INSERT INTO change_requests (employee_cpf, employee_name, status)
      VALUES (?, ?, 'pending')
    `).run(cpfAndre, nomeAndre);

    const requestId = insertReq.lastInsertRowid;

    // 3. Insere a alteração de endereço (Rua)
    sqliteDb.prepare(`
      INSERT INTO change_request_fields (change_request_id, field_name, old_value, new_value, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(requestId, 'RUA', 'Rua Voluntários da Pátria, 100', 'Praia de Botafogo');

    // 4. Insere a alteração de escolaridade
    sqliteDb.prepare(`
      INSERT INTO change_request_fields (change_request_id, field_name, old_value, new_value, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(requestId, 'ESCOLARIDADE', 'Ensino Superior Incompleto', 'Graduação Completa');

    // 5. Insere o documento fake em PDF anexado (Diploma / Comprovante)
    sqliteDb.prepare(`
      INSERT INTO change_request_attachments (
        change_request_id,
        original_filename,
        stored_filename,
        mime_type,
        size_bytes
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      requestId,
      'diploma_graduacao_andre.pdf',
      'diploma_graduacao_andre_14182829794_fake.pdf',
      'application/pdf',
      1024500 // 1MB aprox.
    );

    return NextResponse.json({
      success: true,
      message: `Dados de teste gerados com sucesso para ${nomeAndre} (CPF: ${cpfAndre})!`,
      requestId,
    });
  } catch (error: any) {
    console.error('Erro ao popular banco de teste:', error);
    return NextResponse.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}