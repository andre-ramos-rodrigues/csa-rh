import { NextResponse } from 'next/server';
import { queryTotvs } from '@/lib/db-totvs'; // Ajuste o import para o caminho da sua função querytotvs

export async function GET() {
  try {
    const result = await queryTotvs(`
      SELECT 
        CODCLIENTE AS GRAUPARENTESCO, 
        DESCRICAO AS GRAUPARENTESCODESC 
      FROM PCODPARENT 
      ORDER BY DESCRICAO ASC
    `);

    return NextResponse.json({
      success: true,
      data: {
        grausParentesco: result,
      },
    });
  } catch (error: any) {
    console.error('Erro ao buscar opções de parentesco:', error);
    return NextResponse.json(
      { success: false, error: 'Falha ao carregar opções de parentesco' },
      { status: 500 }
    );
  }
}