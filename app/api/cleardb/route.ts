// app/api/cleardb/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { sqliteDb } from '@/lib/db-app';
import { readdir, unlink } from 'fs/promises';
import path from 'path';

const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || path.join(process.cwd(), 'data', 'attachments');

export async function GET(request: NextRequest) {
  try {
    // 1. Valida se há usuário autenticado na sessão
    const user = await getAuthUser(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Sessão não encontrada / não autenticado' },
        { status: 401 }
      );
    }

    // 2. Garante acesso exclusivo ao masteruser
    const currentUsername = String(user.usuario  || '').toLowerCase();
    if (currentUsername !== 'masteruser') {
      return NextResponse.json(
        { success: false, error: 'Acesso negado. Recurso restrito ao administrador principal.' },
        { status: 403 }
      );
    }

    // 3. Executa a limpeza dentro de uma transação no banco de dados
    const clearTransaction = sqliteDb.transaction(() => {
      // Limpa todas as tabelas relativas a solicitações
      sqliteDb.prepare('DELETE FROM change_request_attachments').run();
      sqliteDb.prepare('DELETE FROM change_request_field_history').run();
      sqliteDb.prepare('DELETE FROM change_request_fields').run();
      sqliteDb.prepare('DELETE FROM change_requests').run();

      // Reseta o autoincrement dos IDs (se a tabela sqlite_sequence existir)
      sqliteDb.prepare(`
        DELETE FROM sqlite_sequence 
        WHERE name IN (
          'change_requests', 
          'change_request_fields', 
          'change_request_field_history', 
          'change_request_attachments'
        )
      `).run();
    });

    //clearTransaction();

    // 4. Remove os arquivos fisicamente salvos na pasta de anexos
    try {
      const files = await readdir(ATTACHMENTS_DIR);
      for (const file of files) {
        if (file !== '.gitkeep') {
          await unlink(path.join(ATTACHMENTS_DIR, file));
        }
      }
    } catch {
      // Ignora erro se a pasta não existir ainda
    }

    return NextResponse.json({
      success: true,
      message: 'Banco de dados e arquivos de anexos limpos com sucesso!',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}