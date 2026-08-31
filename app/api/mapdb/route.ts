import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { sqliteDb } from '@/lib/db-app';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);

    // 1. Valida se há usuário autenticado na sessão
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Sessão não encontrada / não autenticado' },
        { status: 401 }
      );
    }

    // 2. Garante acesso exclusivo ao masteruser
    const currentUsername = String(user.usuario || '').toLowerCase();
    if (currentUsername !== 'masteruser') {
      return NextResponse.json(
        { success: false, error: 'Acesso negado. Recurso restrito ao administrador principal.' },
        { status: 403 }
      );
    }

    // 3. Consulta de dados das tabelas SQLite
    const tables = [
      'change_requests',
      'change_request_fields',
      'change_request_field_history',
      'change_request_attachments',
    ];

    const tableData: Record<string, any> = {};

    tables.forEach((table) => {
      tableData[table] = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
    });

    return NextResponse.json({
      success: true,
      data: tableData,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}