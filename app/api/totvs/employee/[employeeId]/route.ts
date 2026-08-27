import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { totvsPool, getTotvsConnection } from '@/lib/db-totvs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-totvs-12345'
);

const RAW_RM_API_BASE = process.env.RM_API_BASE || 'http://portal.csa.com.br:8051/api';

function getProfileUrl(employeeId: string): string {
  let base = RAW_RM_API_BASE.trim().replace(/\/+$/, '');
  if (!base.endsWith('/api') && !base.includes('/api/')) {
    base = `${base}/api`;
  }
  return `${base}/rh/v1/persons/${encodeURIComponent(employeeId)}`;
}

function sanitizeCpf(cpf: string) {
  if (!cpf) return '';
  return String(cpf).replace(/\D/g, '');
}

function formatCpf(cpf: string) {
  const clean = sanitizeCpf(cpf);
  if (!clean || clean.length !== 11) return cpf || '';
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

const MARITAL_STATE_MAP: Record<string, string> = {
  S: 'Solteiro(a)',
  C: 'Casado(a)',
  V: 'Viúvo(a)',
  D: 'Divorciado(a)',
  E: 'União Estável',
  I: 'Separado(a)',
};

export async function GET(
  request: NextRequest,
  { params }: { params?: Promise<{ employeeId?: string }> }
) {
  const start = Date.now();

  try {
    const resolvedParams = params ? await params : {};
    const searchParams = request.nextUrl.searchParams;
    const employeeId = resolvedParams.employeeId || searchParams.get('cpf') || searchParams.get('employeeId');

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'O parâmetro employeeId ou cpf é obrigatório.' },
        { status: 400 }
      );
    }

    // 1. Validação JWT
    const authToken = request.cookies.get('auth_token')?.value;
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: 'Sessão não encontrada. Faça login novamente.' },
        { status: 401 }
      );
    }

    let jwtPayload: any;
    try {
      const { payload: decodedPayload } = await jwtVerify(authToken, JWT_SECRET);
      jwtPayload = decodedPayload;
    } catch {
      return NextResponse.json(
        { success: false, error: 'Sessão inválida ou expirada.' },
        { status: 401 }
      );
    }

    // 2. Monta Headers da REST API
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (jwtPayload.totvsBasic) {
      headers['Authorization'] = `Basic ${jwtPayload.totvsBasic}`;
    } else if (jwtPayload.totvsToken) {
      headers['Authorization'] = `Bearer ${jwtPayload.totvsToken}`;
    } else {
      const envUser = process.env.TOTVS_USER || process.env.RM_USER || '';
      const envPass = process.env.TOTVS_PASS || process.env.TOTVS_PASSWORD || process.env.RM_PASS || '';
      if (envUser && envPass) {
        headers['Authorization'] = `Basic ${Buffer.from(`${envUser}:${envPass}`).toString('base64')}`;
      }
    }

    // 3. Chamada REST API
    const totvsUrl = getProfileUrl(employeeId);
    const apiResponse = await fetch(totvsUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json().catch(() => null);
      return NextResponse.json(
        {
          success: false,
          employee: null,
          resultDependentes: [],
          resultFormacaoAcademica: [],
          error: errorData?.message || `Erro ao consultar perfil no TOTVS (HTTP ${apiResponse.status}).`,
          latency_ms: Date.now() - start,
        },
        { status: apiResponse.status }
      );
    }

    const rawData = await apiResponse.json();
    const personData = rawData.data || rawData;

    const rawCpf = personData.cpf || '';
    const cleanCpf = sanitizeCpf(rawCpf);
    const formattedCpf = formatCpf(cleanCpf);

    // Conexão SQL
    await getTotvsConnection();

    // 4. Criação de REQUESTS INDEPENDENTES para execução no Promise.all
    const reqExtra = totvsPool.request();
    reqExtra.input('codPessoa', employeeId);
    reqExtra.input('cleanCpf', cleanCpf);
    reqExtra.input('formattedCpf', formattedCpf);

    const reqDep = totvsPool.request();
    reqDep.input('codPessoa', employeeId);
    reqDep.input('cleanCpf', cleanCpf);
    reqDep.input('formattedCpf', formattedCpf);

    const reqForm = totvsPool.request();
    reqForm.input('codPessoa', employeeId);
    reqForm.input('cleanCpf', cleanCpf);
    reqForm.input('formattedCpf', formattedCpf);

    // Execução paralela sem conflito de Sockets
    const [empExtraRes, dependentesRes, formacaoRes] = await Promise.all([
      reqExtra.query(`
        SELECT TOP 1 
          E.DESCRICAO, 
          F.CODEQUIPE, 
          CI.DESCRICAO AS GRAUINSTRUCAO_DESC, 
          EC.DESCRICAO AS ESTADOCIVIL_DESC
        FROM PPESSOA P
        JOIN PFUNC F ON F.CODPESSOA = P.CODIGO
        LEFT JOIN PEQUIPE E ON E.CODCLIENTE = F.CODEQUIPE
        LEFT JOIN PCODINSTRUCAO CI ON CI.CODCLIENTE = P.GRAUINSTRUCAO
        LEFT JOIN PCODESTCIVIL EC ON EC.CODCLIENTE = P.ESTADOCIVIL
        WHERE P.CODIGO = @codPessoa 
           OR (P.CPF = @cleanCpf OR P.CPF = @formattedCpf)
      `),

      reqDep.query(`
        SELECT PE.NOME AS FUNCIONÁRIO, D.*, PAR.DESCRICAO AS GRAUPARENTESCODESC
        FROM PFDEPEND D
        JOIN PFUNC P ON D.CHAPA = P.CHAPA
        JOIN PPESSOA PE ON PE.CODIGO = P.CODPESSOA
        LEFT JOIN PCODPARENT PAR ON PAR.CODCLIENTE = D.GRAUPARENTESCO
        WHERE PE.CODIGO = @codPessoa 
           OR (PE.CPF = @cleanCpf OR PE.CPF = @formattedCpf)
      `),

      reqForm.query(`
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
        WHERE V.CODPESSOA = @codPessoa 
           OR (P.CPF = @cleanCpf OR P.CPF = @formattedCpf)
      `),
    ]);

    const extraInfo = empExtraRes.recordset[0] || {};

    const mappedEmployee = {
      NOME: personData.name || '',
      CPF: personData.cpf || '',
      EMAIL: personData.email || '',
      RUA: personData.street || '',
      BAIRRO: personData.district || '',
      NUMERO: personData.number || '',
      COMPLEMENTO: personData.complement || '',
      ESTADO: personData.state || '',
      CIDADE: personData.city || '',
      CEP: personData.cep || '',
      PAIS: personData.country || '',
      TELEFONE1: personData.phoneNumber1 || '',
      TELEFONE2: personData.phoneNumber2 || '',
      ESTADOCIVIL: extraInfo.ESTADOCIVIL_DESC || MARITAL_STATE_MAP[personData.maritalState] || personData.maritalState || '',
      GRAUINSTRUCAO: extraInfo.GRAUINSTRUCAO_DESC || personData.educationalLevel || '',
      DESCRICAO: extraInfo.DESCRICAO || '',
      CODEQUIPE: extraInfo.CODEQUIPE || null,

      ...personData,
    };

    return NextResponse.json({
      success: true,
      employee: mappedEmployee,
      resultDependentes: dependentesRes.recordset || [],
      resultFormacaoAcademica: formacaoRes.recordset || [],
      latency_ms: Date.now() - start,
    }, { status: 200 });

  } catch (error: any) {
    console.error('💥 Erro ao consultar perfil do empregado (TOTVS REST / SQL):', error);
    return NextResponse.json(
      {
        success: false,
        employee: null,
        resultDependentes: [],
        resultFormacaoAcademica: [],
        error: error.message || String(error),
        latency_ms: Date.now() - start,
      },
      { status: 500 }
    );
  }
}