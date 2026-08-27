import { NextResponse } from 'next/server';
import { sqliteDb } from '@/lib/db-app';

export async function GET() {
  try {
    const tables = [
      'change_requests',
      'change_request_fields',
      'change_request_field_history',
      'change_request_attachments',
    ];

    const columnsInfo: Record<string, any> = {};
    const tableData: Record<string, any> = {};

    tables.forEach((table) => {
      // Obtém a estrutura das colunas
      //columnsInfo[table] = sqliteDb.prepare(`PRAGMA table_info(${table})`).all();
      
      // Obtém todos os dados da tabela (SELECT *)
      tableData[table] = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
    });

    return NextResponse.json({
      success: true,
      //columns: columnsInfo,
      data: tableData,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}