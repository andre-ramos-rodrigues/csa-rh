import { NextRequest, NextResponse } from 'next/server';
import { totvsPool, getTotvsConnection } from '@/lib/db-totvs';

import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);

  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Não autorizado' },
      { status: 401 }
    );
  }

  if (!user.isRh && !user.hasFullAccess) {
    return NextResponse.json(
      { success: false, error: 'Acesso negado. Apenas RH pode listar todos os funcionários.', message: 'Acesso negado. Apenas RH pode listar todos os funcionários.' },
      { status: 403 }
    );
  }

  const result: {
    success: boolean;
    total: number;
    employees: any[];
    latency_ms?: number;
    error?: string;
  } = {
    success: false,
    total: 0,
    employees: [],
  };

  const start = Date.now();
  try {
    await getTotvsConnection();
    const dbRequest = totvsPool.request();
    const queryResult = await dbRequest.query(`
        SELECT DISTINCT E.DESCRICAO, F.CODEQUIPE, P.NOME, P.CPF, P.EMAIL, P.CODIGO
        FROM PPESSOA P
        JOIN PFUNC F ON F.CODPESSOA = P.CODIGO
        JOIN PEQUIPE E ON E.CODCLIENTE = F.CODEQUIPE
        WHERE P.FUNCIONARIO = 1 
          AND F.CODFILIAL = 1
          AND F.CODSITUACAO <> 'D'
        ORDER BY P.NOME
    `);

    result.success = true;
    result.total = queryResult.recordset.length;
    result.employees = queryResult.recordset;
    result.latency_ms = Date.now() - start;
  } catch (error: any) {
    console.error('Failed to fetch employees from TOTVS:', error);
    result.success = false;
    result.error = error.message || String(error);
    result.latency_ms = Date.now() - start;
  }

  return NextResponse.json(result, {
    status: result.success ? 200 : 500,
  });
}