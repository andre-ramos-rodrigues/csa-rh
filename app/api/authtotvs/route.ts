import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import https from 'node:https';
import { URL } from 'node:url';
import { totvsPool, totvsPoolConnect } from '@/lib/db-totvs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-totvs-12345'
);

// Endpoint capturado no DevTools do PortalMeuRH.
const RM_MEURH_LOGIN_URL =
  process.env.RM_MEURH_LOGIN_URL || 'https://portal.csa.com.br/FrameHTML/rm/api/rest/auth/login';

// Header observado na requisição real — parece identificar qual app está chamando.
// Se autenticações de outros módulos usarem outro valor, ajuste aqui.
const RM_TOTVS_APP_HEADER = process.env.RM_TOTVS_APP_HEADER || '0533';

const RM_ALIAS = process.env.TOTVS_DB_NAME || 'CorporeRM';

/**
 * Confirmado via DevTools: o corpo é apenas {"user": "...", "password": "..."},
 * sem campo de alias — o alias é resolvido pelo cookie DefaultAlias enviado
 * no header Cookie da requisição.
 */
function montarCorpoLogin(usuario: string, senha: string): Record<string, string> {
  return {
    user: usuario,
    password: senha,
  };
}

interface RmLoginResult {
  success: boolean;
  rmCookies?: Record<string, string>; // ex: { aspxauth: '...', defaultalias: '...', corporeprincipal: '...' }
  status: number;
  rawBody?: string;
}

/**
 * Extrai os cookies relevantes do RM como um mapa { nome: valor }, prontos para
 * serem repassados como cookies PRÓPRIOS e SEPARADOS na resposta ao navegador.
 * Importante: não concatenamos tudo numa única string/claim — cada cookie tem
 * um limite de ~4096 bytes, e o CorporePrincipal sozinho já é grande.
 */
function extrairCookiesDoRM(setCookieHeaders: string[] | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!setCookieHeaders) return cookies;
  for (const header of setCookieHeaders) {
    const match = header.match(/^([^=]+)=([^;]*)/);
    if (match) {
      const nome = match[1].trim().replace(/^\./, ''); // ".ASPXAUTH" -> "ASPXAUTH"
      cookies[nome] = match[2];
    }
  }
  return cookies;
}

function extrairValorCookie(setCookieHeaders: string[] | undefined, nome: string): string {
  if (!setCookieHeaders) return '';
  for (const header of setCookieHeaders) {
    const match = header.match(new RegExp(`^${nome}=([^;]*)`));
    if (match) return match[1];
  }
  return '';
}

/**
 * Realiza o login via API REST do PortalMeuRH.
 *
 * Critério de sucesso (baseado na captura real fornecida):
 *  - 200 OK + Set-Cookie ".ASPXAUTH=<valor não vazio>"
 * Critério de falha: AINDA NÃO CONFIRMADO. Provável: 200/401 com .ASPXAUTH
 * ausente ou vazio, e/ou uma mensagem de erro no corpo JSON. O log abaixo
 * imprime o corpo bruto da resposta quando falha, para você me mandar e
 * travarmos esse critério com precisão (igual fizemos com o RMAuthForm).
 */
async function loginPortalMeuRH(usuario: string, senha: string): Promise<RmLoginResult> {
  return new Promise((resolve) => {
    const target = new URL(RM_MEURH_LOGIN_URL);
    const postData = JSON.stringify(montarCorpoLogin(usuario, senha));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData).toString(),
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (compatible; PortalMeuRHBackend/1.0)',
      Referer: 'https://portal.csa.com.br/FrameHTML/Web/App/RH/PortalMeuRH/',
      Origin: 'https://portal.csa.com.br',
      'x-totvs-app': RM_TOTVS_APP_HEADER,
      // Observado na requisição real: cookie de alias já setado, e um token de
      // autenticação do módulo EDU vazio (provavelmente só reflete o estado do
      // navegador de onde a captura foi feita, não é obrigatório enviar).
      Cookie: `DefaultAlias=${RM_ALIAS}`,
    };

    const req = https.request(target, { method: 'POST', headers }, (res) => {
      const setCookie = res.headers['set-cookie'];
      const aspxAuth = extrairValorCookie(setCookie, '.ASPXAUTH');
      const status = res.statusCode || 0;

      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const success = status === 200 && !!aspxAuth;
        resolve({
          success,
          rmCookies: success ? extrairCookiesDoRM(setCookie) : undefined,
          status,
          rawBody: body,
        });
      });
    });

    req.on('error', (err) => {
      console.warn('[AUTH DEBUG] Erro de rede ao chamar PortalMeuRH login:', err);
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
          secure: request.nextUrl.protocol === 'https:',
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
    // 🔐 VALIDAÇÃO DA SENHA — via login real na API do PortalMeuRH.
    // Cobre qualquer funcionário com usuário no RM, não só quem tem perfil
    // de aluno/dependente.
    // =========================================================================
    const loginResult = await loginPortalMeuRH(cleanUser, senha);

    if (!loginResult.success) {
      console.warn(
        `[AUTH] Falha de autenticação para "${cleanUser}" (status HTTP: ${loginResult.status}). Corpo da resposta: ${loginResult.rawBody?.slice(0, 500)}`
      );
      result.latency_ms = Date.now() - start;
      return NextResponse.json({ success: false, error: 'Usuário ou senha inválidos.' }, { status: 401 });
    }

    // =========================================================================
    // 🔍 ENRIQUECIMENTO DO PERFIL — busca dados no banco só para exibição,
    // NÃO para decidir autenticação (isso já foi decidido pelo RM acima).
    // =========================================================================
    await totvsPoolConnect;

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

    // Mesmo sem achar o perfil completo no banco (ex: funcionário sem os JOINs
    // batendo), o login no RM já foi validado — não bloqueamos por causa disso.
    const perfilBase = dbUser ?? { CODUSUARIO: cleanUser };

    // =========================================================================
    // 🎟️ EMISSÃO DO JWT E SESSÃO
    // O JWT carrega só os dados de identidade — enxuto de propósito.
    // =========================================================================
    const token = await new SignJWT({
      usuario: perfilBase.CODUSUARIO,
      nome: perfilBase.NOME,
      cpf: perfilBase.CPF,
      codPessoa: perfilBase.CODPESSOA,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(JWT_SECRET);

    result.success = true;
    result.user = perfilBase;
    result.latency_ms = Date.now() - start;

    const response = NextResponse.json(result, { status: 200 });
    // Usamos o protocolo real da requisição, não NODE_ENV — isso evita que o
    // cookie saia marcado como "Secure" em ambientes HTTP (ex: localhost),
    // o que faria o navegador descartá-lo silenciosamente mesmo com o login
    // retornando sucesso.
    const isHttps = request.nextUrl.protocol === 'https:';
    response.cookies.set({
      name: 'auth_token',
      value: token,
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    });

    // Repassamos os cookies de sessão do RM como cookies PRÓPRIOS e
    // SEPARADOS (não dentro do JWT!). Foi justamente concatenar tudo numa
    // única claim que estourava o limite de ~4096 bytes por cookie e fazia
    // o navegador descartar o auth_token inteiro, silenciosamente.
    if (loginResult.rmCookies) {
      for (const [nome, valor] of Object.entries(loginResult.rmCookies)) {
        response.cookies.set({
          name: `rm_${nome.toLowerCase()}`,
          value: valor,
          httpOnly: true,
          secure: isHttps,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 8,
        });
      }
    }

    return response;
  } catch (error: any) {
    console.error('💥 ERRO CRÍTICO NA API DE AUTH:', error);
    result.success = false;
    result.error = error.message || String(error);
    result.latency_ms = Date.now() - start;
    return NextResponse.json(result, { status: 500 });
  }
}