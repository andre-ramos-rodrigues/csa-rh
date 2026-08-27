import { NextRequest, NextResponse } from 'next/server';
import { totvsPool, getTotvsConnection } from '@/lib/db-totvs';

export async function GET(request: NextRequest) {
  const start = Date.now();
  const result: {
    success: boolean;
    employee: any | null;
    resultDependentes: any[];
    resultFormacaoAcademica: any[];
    latency_ms?: number;
    error?: string;
  } = {
    success: false,
    employee: null,
    resultDependentes: [],
    resultFormacaoAcademica: [],
  };

  try {
    const { searchParams } = new URL(request.url);
    const cleanCpf = searchParams.get('cpf');

    if (!cleanCpf) {
      result.latency_ms = Date.now() - start;
      return NextResponse.json(
        { success: false, error: 'Parâmetro "cpf" é obrigatório.' },
        { status: 400 }
      );
    }

    await getTotvsConnection();
    const req = totvsPool.request();

    // Versão formatada do CPF para comparação
    const formattedCpf = cleanCpf.length === 11 
      ? cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') 
      : cleanCpf;

    req.input('cleanCpf', cleanCpf);
    req.input('formattedCpf', formattedCpf);

    // 1. Query do Funcionário (Original)
    const queryResult = await req.query(`
      SELECT TOP 1 
        E.DESCRICAO, 
        F.CODEQUIPE, 
        P.NOME, 
        P.CPF, 
        P.EMAIL,
        P.CODIGO, 
        CI.DESCRICAO AS GRAUINSTRUCAO, 
        P.RUA, 
        P.BAIRRO, 
        P.NUMERO, 
        P.COMPLEMENTO, 
        P.ESTADO,
        P.CIDADE, 
        P.CEP, 
        P.PAIS, 
        P.TELEFONE1, 
        P.TELEFONE2,
        EC.DESCRICAO AS ESTADOCIVIL
      FROM PPESSOA P
      JOIN PFUNC F 
        ON F.CODPESSOA = P.CODIGO
      LEFT JOIN PEQUIPE E 
        ON CAST(E.CODCLIENTE AS VARCHAR(50)) = CAST(F.CODEQUIPE AS VARCHAR(50))
      LEFT JOIN PCODINSTRUCAO CI ON CI.CODCLIENTE = P.GRAUINSTRUCAO
      LEFT JOIN PCODESTCIVIL EC ON EC.CODCLIENTE = P.ESTADOCIVIL
      WHERE P.FUNCIONARIO = 1 
        AND F.CODFILIAL = 1
        AND F.CODSITUACAO <> 'D'
        AND (P.CPF = @cleanCpf OR P.CPF = @formattedCpf)
    `);

    result.employee = queryResult.recordset[0] || null;

    if (!result.employee) {
      result.latency_ms = Date.now() - start;
      return NextResponse.json(
        { ...result, error: 'Funcionário não encontrado no TOTVS.' },
        { status: 404 }
      );
    }

    // 2. Query dos Dependentes
    const queryDependentes = await req.query(`
      SELECT PE.NOME AS FUNCIONÁRIO, D.*, PAR.DESCRICAO AS GRAUPARENTESCODESC
      FROM PFDEPEND D
      JOIN PFUNC P ON D.CHAPA = P.CHAPA
      JOIN PPESSOA PE ON PE.CODIGO = P.CODPESSOA
      LEFT JOIN PCODPARENT PAR ON PAR.CODCLIENTE = D.GRAUPARENTESCO
      WHERE (PE.CPF = @cleanCpf OR PE.CPF = @formattedCpf)
    `);

    // 3. Query da Formação Acadêmica (Nova)
    const queryFormacao = await req.query(`
      SELECT 
        P.NOME AS NOME_PESSOA, 
        E.NOMEFANTASIA AS ENTIDADE_NOMEFANTASIA, 
        G.DESCRICAO AS GRAUINSTRUCAO_DESC, 
        A.NOME AS CURSO_NOME, 
        V.*
      FROM VFORMACAOACAD V
      JOIN PPESSOA P ON V.CODPESSOA = P.CODIGO
      LEFT JOIN VENTIDADES E ON E.CODENTIDADE = V.CODENTIDADE
      LEFT JOIN VGRAUINSTRUCAO G ON G.CODGRAU = V.CODGRAU
      LEFT JOIN VCURSOACAD A ON A.CODCURSO = V.CODCURSO
      WHERE (P.CPF = @cleanCpf OR P.CPF = @formattedCpf)
    `);

    result.success = true;
    result.resultDependentes = queryDependentes.recordset || [];
    result.resultFormacaoAcademica = queryFormacao.recordset || [];
    result.latency_ms = Date.now() - start;

    console.log('Formação Acadêmica:', result.resultFormacaoAcademica);

    return NextResponse.json(result, { status: 200 });

  } catch (error: any) {
    console.error('Failed to fetch employee from TOTVS by CPF:', error);
    result.success = false;
    result.error = error.message || String(error);
    result.latency_ms = Date.now() - start;

    return NextResponse.json(result, { status: 500 });
  }
}