import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import https from 'node:https';
import { URL } from 'node:url';
import { totvsPool, getTotvsConnection } from '@/lib/db-totvs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-totvs-12345'
);

// URL exata capturada no DevTools do portal do aluno.
// O "&undefined" no final é estranho, mas é o que o front-end oficial envia —
// mantido por segurança, já que foi o que gerou o 302 de sucesso.
const RM_EDU_LOGIN_URL =
  process.env.RM_EDU_LOGIN_URL ||
  'https://portal.csa.com.br/Corpore.Net//Source/EDU-EDUCACIONAL/Public/EduPortalAlunoLogin.aspx?AutoLoginType=ExternalLogin&undefined';

// Valor fixo observado no FormData do login real.
const RM_ALIAS = process.env.TOTVS_DB_NAME || 'CorporeRM';

interface RmLoginResult {
  success: boolean;
  rmAuthCookie?: string;
  status: number;
}

/**
 * Extrai o valor de um cookie específico a partir do array de headers set-cookie.
 * Se houver múltiplas ocorrências (ex: um "limpando" e outro "setando"), usamos
 * a última ocorrência não vazia — que é sempre a definição final do RM.
 */
function extrairCookie(setCookieHeaders: string[] | undefined, nome: string): string {
  if (!setCookieHeaders) return '';
  let valorFinal = '';
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`^${nome}=([^;]*)`));
    if (match) {
      valorFinal = match[1]; // sobrescreve — a última ocorrência vale
    }
  }
  return valorFinal;
}

/**
 * Faz um GET inicial na página de login para capturar eventuais cookies de
 * sessão (ex: ASP.NET_SessionId) que o servidor espera receber de volta no POST.
 * Muitos apps ASP.NET clássicos exigem isso mesmo quando o formulário em si
 * não usa ViewState.
 */
function obterCookiesSessaoIniciais(loginUrl: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const target = new URL(loginUrl);
      const req = https.request(
        target,
        { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortalAlunoBackend/1.0)' } },
        (res) => {
          const setCookie = res.headers['set-cookie'] || [];
          const cookies = setCookie.map((c) => c.split(';')[0]).join('; ');
          res.resume(); // descarta o corpo, só precisamos dos headers
          resolve(cookies);
        }
      );
      req.on('error', () => resolve(''));
      req.end();
    } catch {
      resolve('');
    }
  });
}

/**
 * Realiza o login no portal do aluno TOTVS RM via POST no EduPortalAlunoLogin.aspx,
 * replicando exatamente o que o navegador oficial envia.
 *
 * Critério de sucesso confirmado via DevTools:
 *  - 302 Found + Set-Cookie "RMAuthForm=<valor não vazio>"
 * Critério de falha confirmado via DevTools:
 *  - 200 OK + Set-Cookie "RMAuthForm=;" (cookie sendo limpo)
 */
async function loginPortalAluno(usuario: string, senha: string): Promise<RmLoginResult> {
  const cookiesIniciais = await obterCookiesSessaoIniciais(RM_EDU_LOGIN_URL);

  return new Promise((resolve) => {
    const target = new URL(RM_EDU_LOGIN_URL);
    const postData = new URLSearchParams({
      User: usuario,
      Pass: senha,
      Alias: RM_ALIAS,
    }).toString();

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData).toString(),
      'User-Agent': 'Mozilla/5.0 (compatible; PortalAlunoBackend/1.0)',
      Referer: RM_EDU_LOGIN_URL,
      Accept: 'text/html,application/xhtml+xml',
    };
    if (cookiesIniciais) headers['Cookie'] = cookiesIniciais;

    const req = https.request(target, { method: 'POST', headers }, (res) => {
      const setCookie = res.headers['set-cookie'];
      const rmAuthCookie = extrairCookie(setCookie, 'RMAuthForm');
      const status = res.statusCode || 0;

      res.resume(); // não precisamos do corpo HTML da resposta

      const success = status === 302 && !!rmAuthCookie;
      resolve({ success, rmAuthCookie: success ? rmAuthCookie : undefined, status });
    });

    req.on('error', (err) => {
      console.warn('[AUTH DEBUG] Erro de rede ao chamar EduPortalAlunoLogin:', err);
      resolve({ success: false, status: 0 });
    });

    req.write(postData);
    req.end();
  });
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const result: { success: boolean; user: any | null; latency_ms?: number; error?: string } = {
    success: false,
    user: null,
  };

  try {
    const body = await request.json();
    const { usuario, senha } = body;

    if (!usuario || !senha) {
      result.latency_ms = Date.now() - start;
      return NextResponse.json(
        { success: false, error: 'Os campos "usuario" e "senha" são obrigatórios.' },
        { status: 400 }
      );
    }

    const cleanUser = String(usuario).trim();

    // Bypass de desenvolvimento
    if (cleanUser.toLowerCase() === 'masteruser') {
      const masterEnvPassword = process.env.PASSWORD;
      if (masterEnvPassword && senha === masterEnvPassword) {
        const masterUserData = {
          CODUSUARIO: 'masteruser',
          NOME: 'masteruser',
          CPF: '00000000000',
          EMAIL: 'master@dev.local',
          DESCRICAO: 'Desenvolvimento',
          CODEQUIPE: 'DEV',
          isRh: true,
        };
        const token = await new SignJWT({
          usuario: masterUserData.CODUSUARIO,
          nome: masterUserData.NOME,
          cpf: masterUserData.CPF,
          isRh: true,
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime('8h')
          .sign(JWT_SECRET);

        result.success = true;
        result.user = masterUserData;
        result.latency_ms = Date.now() - start;

        const response = NextResponse.json(result, { status: 200 });
        response.cookies.set({
          name: 'auth_token',
          value: token,
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 8,
        });
        return response;
      }
      result.latency_ms = Date.now() - start;
      return NextResponse.json({ success: false, error: 'Usuário ou senha inválidos.' }, { status: 401 });
    }

    // =========================================================================
    // 🔐 VALIDAÇÃO DA SENHA — via login real no portal (funciona para qualquer
    // formato de senha, novo ou antigo, pois é o próprio RM validando).
    // =========================================================================
    const loginResult = await loginPortalAluno(cleanUser, senha);

    if (!loginResult.success) {
      console.warn(
        `[AUTH] Falha de autenticação para "${cleanUser}" (status HTTP recebido do RM: ${loginResult.status}).`
      );
      result.latency_ms = Date.now() - start;
      return NextResponse.json({ success: false, error: 'Usuário ou senha inválidos.' }, { status: 401 });
    }

    // =========================================================================
    // 🔍 ENRIQUECIMENTO DO PERFIL — busca dados no banco só para exibição,
    // NÃO para decidir autenticação (isso já foi decidido pelo RM acima).
    // =========================================================================
    await getTotvsConnection();

    const tentativasUsuario = Array.from(new Set([cleanUser.toLowerCase(), cleanUser.toUpperCase()]));
    let dbUser: any = null;

    for (const candidatoUsuario of tentativasUsuario) {
      const req = totvsPool.request();
      req.input('usuario', candidatoUsuario);

      const queryResult = await req.query(`
        SELECT TOP 1 
          GU.CODUSUARIO, GU.CONTROLE, E.DESCRICAO, F.CODEQUIPE, 
          P.NOME, P.CODIGO AS CODPESSOA, P.CPF, P.EMAIL 
        FROM GUSUARIO GU
        JOIN PPESSOA P ON UPPER(P.CODUSUARIO) = UPPER(GU.CODUSUARIO) 
        JOIN PFUNC F ON F.CODPESSOA = P.CODIGO
        LEFT JOIN PEQUIPE E ON CAST(E.CODCLIENTE AS VARCHAR(50)) = CAST(F.CODEQUIPE AS VARCHAR(50))
        WHERE P.FUNCIONARIO = 1 
          AND F.CODFILIAL IN (1, 4)
          AND F.CODSITUACAO <> 'D'
          AND (GU.CODUSUARIO = @usuario OR UPPER(GU.CODUSUARIO) = UPPER(@usuario))
      `);

      if (queryResult.recordset?.[0]) {
        dbUser = queryResult.recordset[0];
        break;
      }
    }

    // Mesmo sem achar o perfil completo no banco, o login no RM já foi validado
    // com sucesso — não bloqueamos o acesso por causa disso, só empobrecemos o perfil.
    const perfilBase = dbUser ?? { CODUSUARIO: cleanUser };

    // =========================================================================
    // 🎟️ EMISSÃO DO JWT E SESSÃO
    // Guardamos o cookie RMAuthForm dentro do nosso próprio JWT para permitir
    // que chamadas futuras ao FrameHTML/RM sejam feitas em nome do usuário.
    // =========================================================================
    const token = await new SignJWT({
      usuario: perfilBase.CODUSUARIO,
      nome: perfilBase.NOME,
      cpf: perfilBase.CPF,
      codPessoa: perfilBase.CODPESSOA,
      rmAuthCookie: loginResult.rmAuthCookie,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(JWT_SECRET);

    result.success = true;
    result.user = perfilBase;
    result.latency_ms = Date.now() - start;

    const response = NextResponse.json(result, { status: 200 });
    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (error: any) {
    console.error('💥 ERRO CRÍTICO NA API DE AUTH:', error);
    result.success = false;
    result.error = error.message || String(error);
    result.latency_ms = Date.now() - start;
    return NextResponse.json(result, { status: 500 });
  }
}