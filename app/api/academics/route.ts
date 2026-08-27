import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { queryTotvs } from '@/lib/db-totvs';

export async function GET(request: NextRequest) {
  // 🔒 1. Validação de autenticação
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Não autorizado.' },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const searchTerm = searchParams.get('search') || '';

    const params = searchTerm ? { search: `%${searchTerm}%` } : {};

    // 🔍 2. Consultas usando a sua função queryTotvs
    const entidadesQuery = `
      SELECT 
        CODENTIDADE, 
        NOMEFANTASIA 
      FROM VENTIDADES 
      ${searchTerm ? 'WHERE NOMEFANTASIA LIKE @search' : ''}
      ORDER BY NOMEFANTASIA ASC
    `;

    const cursosQuery = `
      SELECT 
        CODCURSO, 
        NOME AS CURSO_NOME 
      FROM VCURSOACAD 
      ${searchTerm ? 'WHERE NOME LIKE @search' : ''}
      ORDER BY NOME ASC
    `;

    const grausQuery = `
      SELECT 
        CODGRAU, 
        DESCRICAO AS GRAUINSTRUCAO_DESC 
      FROM VGRAUINSTRUCAO 
      ORDER BY DESCRICAO ASC
    `;

    const [entidades, cursos, grausInstrucao] = await Promise.all([
      queryTotvs(entidadesQuery, params),
      queryTotvs(cursosQuery, params),
      queryTotvs(grausQuery),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        entidades: entidades || [],
        cursos: cursos || [],
        grausInstrucao: grausInstrucao || [],
      },
    });
  } catch (error: any) {
    console.error('Erro ao buscar opções de formação acadêmica:', error);
    return NextResponse.json(
      { success: false, error: 'Erro ao carregar opções de formação acadêmica.' },
      { status: 500 }
    );
  }
}