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
}

interface FieldRow {
  field_id: number;
  change_request_id: number;
  employee_cpf: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  status: string;
}

export async function GET() {
  try {
    initAppDb();

    // 1. Agrupa apenas campos ainda não migrados por CPF
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
        SUM(CASE WHEN crf.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_fields
      FROM change_requests cr
      LEFT JOIN change_request_fields crf ON crf.change_request_id = cr.id
      WHERE crf.status != 'migrated' OR crf.status IS NULL
      GROUP BY cr.employee_cpf
    `
      )
      .all() as EmployeeSummaryRow[];

    // 2. Busca os detalhes dos campos preservando os IDs dos chamados
    const fieldRows = sqliteDb
      .prepare(
        `
      SELECT
        crf.id AS field_id,
        crf.change_request_id,
        cr.employee_cpf,
        crf.field_name,
        crf.old_value,
        crf.new_value,
        crf.status
      FROM change_request_fields crf
      JOIN change_requests cr ON cr.id = crf.change_request_id
      WHERE crf.status != 'migrated'
    `
      )
      .all() as FieldRow[];

    const fieldsMap = new Map<
      string,
      {
        id: number;
        change_request_id: number;
        field_name: string;
        old_value: string | null;
        new_value: string | null;
        status: string;
      }[]
    >();

    fieldRows.forEach((f) => {
      const cleanCpf = String(f.employee_cpf || '').replace(/\D/g, '');
      if (!fieldsMap.has(cleanCpf)) {
        fieldsMap.set(cleanCpf, []);
      }
      fieldsMap.get(cleanCpf)!.push({
        id: f.field_id,
        change_request_id: f.change_request_id,
        field_name: f.field_name,
        old_value: f.old_value,
        new_value: f.new_value,
        status: f.status,
      });
    });

    // 3. Contagem de anexos por CPF
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

    // 4. Monta o resumo final vinculando os IDs aos campos aprovados
    const summaries = rows.map((row) => {
      const cleanCpf = String(row.employee_cpf || '').replace(/\D/g, '');
      const allFields = fieldsMap.get(cleanCpf) || [];
      const approvedFields = allFields.filter((f) => f.status === 'approved');

      return {
        employee_cpf: row.employee_cpf,
        request_id: row.latest_request_id,
        submitted_at: row.latest_submitted_at,
        status: row.approved_fields > 0 ? 'approved' : 'pending',
        approved_count: row.approved_fields || 0,
        pending_count: row.pending_fields || 0,
        rejected_count: row.rejected_fields || 0,
        attachments_count: attachmentMap.get(cleanCpf) || 0,
        fields: approvedFields,
        changed_fields: approvedFields.map((f) => f.field_name),
      };
    });

    return NextResponse.json({ success: true, summaries });
  } catch (error: any) {
    console.error('Failed to fetch migration summary:', error);
    return NextResponse.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}