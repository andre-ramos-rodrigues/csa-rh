import { NextResponse } from 'next/server';
import { sqliteDb } from '@/lib/db-app';

// Helper para formatar a data/hora no padrão do SQLite ("YYYY-MM-DD HH:MM:SS")
function getSqliteTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Aceita tanto 'employeeCpf' (string) quanto 'employeeCpfs' ou 'cpfs' (array)
    const rawCpfs = body.employeeCpfs || body.cpfs || (body.employeeCpf ? [body.employeeCpf] : []);

    // Normaliza e limpa todos os CPFs recebidos
    const cleanCpfs: string[] = Array.isArray(rawCpfs)
      ? rawCpfs.map((cpf) => String(cpf).replace(/\D/g, '')).filter(Boolean)
      : [];

    if (cleanCpfs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhum CPF válido informado para migração.' },
        { status: 400 }
      );
    }

    const nowFormatted = getSqliteTimestamp();

    // =========================================================================
    // 🚀 LOGS E SIMULAÇÃO DE MIGRAÇÃO PARA O TOTVS
    // =========================================================================
    console.log('\n==================================================');
    console.log('🚀 [EXECUÇÃO E SIMULAÇÃO DE MIGRAÇÃO TOTVS]');
    console.log(`👤 Quantidade de CPFs: ${cleanCpfs.length}`);
    console.log(`📄 CPFs Processados: ${cleanCpfs.join(', ')}`);
    console.log(`📅 Data/Hora: ${nowFormatted}`);
    console.log('==================================================');

    cleanCpfs.forEach((cpf) => {
      console.log(`🔄 [SIMULAÇÃO TOTVS - CPF: ${cpf}] > UPDATE PPFESS SET ...`);
    });

    // =========================================================================
    // 💾 ATUALIZAÇÃO NO BANCO DE DADOS (SQLite - better-sqlite3)
    // =========================================================================
    const placeholders = cleanCpfs.map(() => '?').join(',');

    const updateRequestsStmt = sqliteDb.prepare(`
      UPDATE change_requests
      SET status = 'migrated',
          applied_at = ?,
          updated_at = ?
      WHERE employee_cpf IN (${placeholders}) AND LOWER(status) = 'approved'
    `);

    const updateFieldsStmt = sqliteDb.prepare(`
      UPDATE change_request_fields
      SET status = 'migrated',
          applied_at = ?
      WHERE change_request_id IN (
        SELECT id FROM change_requests WHERE employee_cpf IN (${placeholders})
      ) AND LOWER(status) = 'approved'
    `);

    const reqResult = updateRequestsStmt.run(nowFormatted, nowFormatted, ...cleanCpfs);
    const fieldResult = updateFieldsStmt.run(nowFormatted, ...cleanCpfs);

    const updatedRequestsCount = reqResult.changes;
    const updatedFieldsCount = fieldResult.changes;

    console.log('✅ [BANCO ATUALIZADO NO SQLITE]');
    console.log(`   Solicitações para 'migrated': ${updatedRequestsCount}`);
    console.log(`   Campos alterados para 'migrated': ${updatedFieldsCount}`);
    console.log('==================================================\n');

    return NextResponse.json({
      success: true,
      message: `Migração concluída com sucesso para ${cleanCpfs.length} funcionário(s).`,
      migratedAt: nowFormatted,
      processedCpfs: cleanCpfs,
      updatedRequests: updatedRequestsCount,
      updatedFields: updatedFieldsCount,
    });
  } catch (error: any) {
    console.error('❌ Erro na rota de migração TOTVS:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Erro interno ao processar migração.' },
      { status: 500 }
    );
  }
}