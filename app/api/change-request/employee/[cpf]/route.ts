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

    const rows = sqliteDb
      .prepare(`SELECT * FROM change_requests WHERE employee_cpf = ? ORDER BY id DESC`)
      .all(cleanCpf) as any[];

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        success: true,
        changeRequests: [],
        changeRequest: null,
      });
    }

    const getFieldsStmt = sqliteDb.prepare(
      `SELECT * FROM change_request_fields WHERE change_request_id = ?`
    );
    const getAttachmentsStmt = sqliteDb.prepare(
      `SELECT * FROM change_request_attachments WHERE change_request_id = ?`
    );

    // 🔄 CORREÇÃO 3: Garante que cada campo herde o status do pedido pai se for nulo
    const changeRequests = rows.map((req) => {
      const rawFields = getFieldsStmt.all(req.id) as any[];
      const fields = rawFields.map((f) => ({
        ...f,
        status: f.status || req.status || 'pending',
      }));

      return {
        ...req,
        fields,
        attachments: getAttachmentsStmt.all(req.id),
      };
    });

    const activePending = changeRequests.find((r) => r.status === 'pending') || changeRequests[0];

    return NextResponse.json({
      success: true,
      changeRequests,
      changeRequest: activePending,
    });
  } catch (error: any) {
    console.error('Erro ao buscar solicitações do funcionário:', error);
    return NextResponse.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}