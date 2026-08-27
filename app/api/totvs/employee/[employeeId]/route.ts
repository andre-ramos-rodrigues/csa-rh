import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { totvsPool, totvsPoolConnect } from '@/lib/db-totvs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-totvs-12345'
);

const RAW_RM_API_BASE = process.env.RM_API_BASE || 'http://portal.csa.com.br:8051/api';

/** Normaliza a URL para o endpoint de pessoa/perfil da TOTVS */
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

/** Mapeamento de fallback para Estado Civil caso a consulta SQL complementar falhe */
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
    // Permite obter o ID tanto de dynamic route /employee/[employeeId] quanto de query string ?cpf=...
    const resolvedParams = params ? await params : {};
    const searchParams = request.nextUrl.searchParams;
    const employeeId = resolvedParams.employeeId || searchParams.get('cpf') || searchParams.get('employeeId');

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'O parâmetro employeeId ou cpf é obrigatório.' },
        { status: 400 }
      );
    }

    // 1. Obtém e valida a sessão JWT
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
        { success: false, error: 'Sessão inválida ou expirada. Faça login novamente.' },
        { status: 401 }
      );
    }

    // 2. Monta os cabeçalhos de autorização da TOTVS
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    // Prioridade 1: Credenciais gravadas na sessão do usuário
    if (jwtPayload.totvsBasic) {
      headers['Authorization'] = `Basic ${jwtPayload.totvsBasic}`;
    } else if (jwtPayload.totvsToken) {
      headers['Authorization'] = `Bearer ${jwtPayload.totvsToken}`;
    } else {
      // Prioridade 2 (FALLBACK): Usa credenciais de integração fixas do arquivo .env
      const envUser = process.env.TOTVS_USER || process.env.RM_USER || '';
      const envPass = process.env.TOTVS_PASS || process.env.TOTVS_PASSWORD || process.env.RM_PASS || '';
      
      if (envUser && envPass) {
        const basicAuth = Buffer.from(`${envUser}:${envPass}`).toString('base64');
        headers['Authorization'] = `Basic ${basicAuth}`;
      }
    }

    // 3. Consulta os dados do empregado via API REST da TOTVS
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

    // 4. Trata o CPF retornado da API para vincular com as tabelas relacionais do SQL
    const rawCpf = personData.cpf || '';
    const cleanCpf = sanitizeCpf(rawCpf);
    const formattedCpf = formatCpf(cleanCpf);

    // 5. Consultas complementares no SQL (Dependentes, Formação Acadêmica e Informações de Equipe)
    await totvsPoolConnect;
    const req = totvsPool.request();
    req.input('cleanCpf', cleanCpf);
    req.input('formattedCpf', formattedCpf);
    req.input('codPessoa', employeeId);

    // Execução paralela para manter a latência baixa
    const [empExtraRes, dependentesRes, formacaoRes] = await Promise.all([
      req.query(`
        SELECT TOP 1 
          E.DESCRICAO, 
          F.CODEQUIPE, 
          CI.DESCRICAO AS GRAUINSTRUCAO_DESC, 
          EC.DESCRICAO AS ESTADOCIVIL_DESC
        FROM PPESSOA P
        JOIN PFUNC F ON F.CODPESSOA = P.CODIGO
        LEFT JOIN PEQUIPE E ON CAST(E.CODCLIENTE AS VARCHAR(50)) = CAST(F.CODEQUIPE AS VARCHAR(50))
        LEFT JOIN PCODINSTRUCAO CI ON CI.CODCLIENTE = P.GRAUINSTRUCAO
        LEFT JOIN PCODESTCIVIL EC ON EC.CODCLIENTE = P.ESTADOCIVIL
        WHERE P.CODIGO = @codPessoa 
           OR (P.CPF = @cleanCpf OR P.CPF = @formattedCpf)
      `),

      req.query(`
        SELECT PE.NOME AS FUNCIONÁRIO, D.*, PAR.DESCRICAO AS GRAUPARENTESCODESC
        FROM PFDEPEND D
        JOIN PFUNC P ON D.CHAPA = P.CHAPA
        JOIN PPESSOA PE ON PE.CODIGO = P.CODPESSOA
        JOIN PCODPARENT PAR ON PAR.CODCLIENTE = D.GRAUPARENTESCO
        WHERE (PE.CPF = @cleanCpf OR PE.CPF = @formattedCpf)
      `),

      req.query(`
        SELECT 
          P.NOME AS NOME_PESSOA, 
          E.NOMEFANTASIA AS ENTIDADE_NOMEFANTASIA, 
          G.DESCRICAO AS GRAUINSTRUCAO_DESC, 
          A.NOME AS CURSO_NOME, 
          V.*
        FROM VFORMACAOACAD V
        JOIN PPESSOA P ON V.CODPESSOA = P.CODIGO
        JOIN VENTIDADES E ON E.CODENTIDADE = V.CODENTIDADE
        JOIN VGRAUINSTRUCAO G ON G.CODGRAU = V.CODGRAU
        JOIN VCURSOACAD A ON A.CODCURSO = V.CODCURSO
        WHERE (P.CPF = @cleanCpf OR P.CPF = @formattedCpf)
      `),
    ]);

    const extraInfo = empExtraRes.recordset[0] || {};

    // 6. Unifica os dados no objeto `employee`
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