import { NextResponse } from 'next/server';
import { sqliteDb, initAppDb } from '@/lib/db-app';

interface EmployeeSummaryRow {
  employee_cpf: string;
  latest_request_id: number;
  latest_submitted_at: string;
  total_fields: number;
  pending_fields: number;
  approved_fields: number;
  rejected_fields: number;
  migrated_fields: number;
}

// Lógica de consolidação centralizada por CPF:
function deriveConsolidatedStatus(row: EmployeeSummaryRow): string {
  // Regra 1: Se existir qualquer campo pendente -> 'pending'
  if (row.pending_fields > 0) {
    return 'pending';
  }
  // Regra 2: Se não houver pendentes e existir algum aprovado aguardando migração -> 'approved'
  if (row.approved_fields > 0) {
    return 'approved';
  }
  // Regra 3: Se não houver pendentes/aprovados e existir campos já migrados -> 'migrated'
  if (row.migrated_fields > 0) {
    return 'migrated';
  }
  // Regra 4: Se só existirem campos rejeitados -> 'rejected'
  if (row.rejected_fields > 0) {
    return 'rejected';
  }
  return 'pending';
}

export async function GET() {
  try {
    initAppDb();

    // 1. Agrupa e soma os status dos campos por CPF (incluindo 'migrated')
    const rows = sqliteDb
      .prepare(
        `
      SELECT
        cr.employee_cpf,
        MAX(cr.id) AS latest_request_id,
        MAX(cr.submitted_at) AS latest_submitted_at,
        COUNT(crf.id) AS total_fields,
        SUM(CASE WHEN crf.status = 'pending' THEN 1 ELSE 0 END) AS pending_fields,
        SUM(CASE WHEN crf.status = 'approved' THEN 1 ELSE 0 END) AS approved_fields,
        SUM(CASE WHEN crf.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_fields,
        SUM(CASE WHEN crf.status = 'migrated' THEN 1 ELSE 0 END) AS migrated_fields
      FROM change_requests cr
      LEFT JOIN change_request_fields crf ON crf.change_request_id = cr.id
      GROUP BY cr.employee_cpf
    `
      )
      .all() as EmployeeSummaryRow[];

    // 2. Soma todos os anexos pertencentes ao mesmo CPF
    const attachmentRows = sqliteDb
      .prepare(
        `
      SELECT cr.employee_cpf, COUNT(cra.id) AS count
      FROM change_requests cr
      JOIN change_request_attachments cra ON cra.change_request_id = cr.id
      GROUP BY cr.employee_cpf
    `
      )
      .all() as { employee_cpf: string; count: number }[];

    const attachmentMap = new Map<string, number>();
    attachmentRows.forEach((a) => {
      const cleanCpf = String(a.employee_cpf || '').replace(/\D/g, '');
      attachmentMap.set(cleanCpf, a.count);
    });

    // 3. Monta a lista consolidada (1 item por CPF com contadores detalhados)
    const summaries = rows.map((row) => {
      const cleanCpf = String(row.employee_cpf || '').replace(/\D/g, '');

      return {
        employee_cpf: row.employee_cpf,
        request_id: row.latest_request_id,
        submitted_at: row.latest_submitted_at,
        status: deriveConsolidatedStatus(row),
        pending_count: row.pending_fields || 0,
        approved_count: row.approved_fields || 0,
        rejected_count: row.rejected_fields || 0,
        migrated_count: row.migrated_fields || 0,
        total_fields: row.total_fields || 0,
        attachments_count: attachmentMap.get(cleanCpf) || 0,
      };
    });

    return NextResponse.json({ success: true, summaries });
  } catch (error: any) {
    console.error('Failed to fetch change request summary:', error);
    return NextResponse.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}