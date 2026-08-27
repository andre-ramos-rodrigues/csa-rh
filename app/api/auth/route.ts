import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { totvsPool, totvsPoolConnect } from '@/lib/db-totvs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-totvs-12345'
);

const RM_API_BASE = process.env.RM_API_BASE ?? '';

/** URL do endpoint OAuth2 do TOTVS RM */
function getTotvsTokenUrl(): string {
  const override = process.env.RM_ALUNO_TOKEN_URL?.trim();
  if (override) return override;
  if (!RM_API_BASE) return '';
  return `${RM_API_BASE.replace(/\/$/, '')}/connect/token/`;
}
export type FormatoSenhaPortal = 'envelope' | 'legado' | 'vazio' | 'outro';

/** Detecta o formato da senha armazenada em GUSUARIO.SENHA */
export function formatoSenhaPortal(
  armazenado: string | null | undefined
): FormatoSenhaPortal {
  if (!armazenado) return 'vazio';
  const str = armazenado.trim();
  if (str.startsWith('#P=') || str.includes('#H=$2')) return 'envelope';
  if (/^[A-Za-z]{8}$/.test(str)) return 'legado';
  return 'outro';
}

/** 1️⃣ Validação Local do Envelope Bcrypt do TOTVS RM */
function validarEnvelopeLocal(
  senha: string,
  armazenado: string,
  controle?: number | string | null
): boolean {
  const str = (armazenado || '').trim();
  const i = str.indexOf('#H=');
  const hash = i >= 0 ? str.slice(i + 3).trim() : str;

  if (!hash.startsWith('$2') || hash.length !== 60) {
    return false;
  }

  const ctrlStr = controle !== null && controle !== undefined ? String(controle).trim() : '';
  const sUpper = senha.toUpperCase();

  // Testa hipóteses de pré-hash aceitas pelo TOTVS
  const hipoteses: string[] = [
    createHash('sha256').update(senha, 'utf8').digest('base64'), // Padrão RM
    createHash('sha256').update(sUpper, 'utf8').digest('base64'), // Caixa alta
  ];

  if (ctrlStr) {
    hipoteses.push(
      createHash('sha256').update(senha + ctrlStr, 'utf8').digest('base64'),
      createHash('sha256').update(sUpper + ctrlStr, 'utf8').digest('base64'),
      createHash('sha256').update(ctrlStr + senha, 'utf8').digest('base64'),
      createHash('sha256').update(ctrlStr + sUpper, 'utf8').digest('base64')
    );
  }

  for (const preHash of hipoteses) {
    try {
      if (bcrypt.compareSync(preHash, hash)) {
        return true;
      }
    } catch {
      // Ignora erro individual de comparação
    }
  }

  return false;
}

/** 2️⃣ Fallback: Validação via OAuth2 Password Flow do TOTVS RM (/connect/token) */
async function validarSenhaTotvsApi(login: string, cpf: string | null, senha: string): Promise<boolean> {
  const url = getTotvsTokenUrl();
  if (!url) return false;

  const loginsParaTestar = [login];
  if (cpf) {
    const cleanCpf = cpf.replace(/\D/g, '');
    if (cleanCpf && cleanCpf !== login) {
      loginsParaTestar.push(cleanCpf);
    }
  }

  for (const userLogin of loginsParaTestar) {
    try {
      const corpo = new URLSearchParams({
        grant_type: 'password',
        username: userLogin,
        password: senha,
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corpo.toString(),
        cache: 'no-store',
      });

      if (res.ok) {
        const data = (await res.json()) as { access_token?: string };
        if (typeof data.access_token === 'string' && data.access_token.length > 0) {
          return true;
        }
      }
    } catch (err) {
      console.warn(`[AUTH] Falha ao tentar conectar ao OAuth TOTVS para ${userLogin}:`, err);
    }
  }

  return false;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const result: {
    success: boolean;
    user: any | null;
    latency_ms?: number;
    error?: string;
  } = {
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

    // =========================================================================
    // 🛡️ BYPASS PARA DESENVOLVIMENTO: MASTERUSER
    // =========================================================================
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
      } else {
        result.latency_ms = Date.now() - start;
        return NextResponse.json(
          { success: false, error: 'Usuário ou senha inválidos.' },
          { status: 401 }
        );
      }
    }

    // =========================================================================
    // 🔍 BUSCA DE USUÁRIO NO BANCO TOTVS (MINÚSCULAS PRIMEIRO, DEPOIS MAIÚSCULAS)
    // =========================================================================
    await totvsPoolConnect;

    // Garante a ordem de tentativa: 1º minúsculas, 2º maiúsculas (remove duplicatas se for numérico)
    const tentativasUsuario = Array.from(
      new Set([cleanUser.toLowerCase(), cleanUser.toUpperCase()])
    );

    let dbUser: any = null;

    for (const candidatoUsuario of tentativasUsuario) {
      const req = totvsPool.request();
      req.input('usuario', candidatoUsuario);

      const queryResult = await req.query(`
        SELECT TOP 1 
          GU.CODUSUARIO, 
          GU.SENHA, 
          GU.CONTROLE, 
          E.DESCRICAO, 
          F.CODEQUIPE, 
          P.NOME,
          P.CODIGO AS CODPESSOA, 
          P.CPF, 
          P.EMAIL 
        FROM GUSUARIO GU
        JOIN PPESSOA P 
          ON UPPER(P.CODUSUARIO) = UPPER(GU.CODUSUARIO) 
        JOIN PFUNC F 
          ON F.CODPESSOA = P.CODIGO
        LEFT JOIN PEQUIPE E 
          ON CAST(E.CODCLIENTE AS VARCHAR(50)) = CAST(F.CODEQUIPE AS VARCHAR(50))
        WHERE P.FUNCIONARIO = 1 
          AND F.CODFILIAL IN (1, 4)
          AND F.CODSITUACAO <> 'D'
          AND (GU.CODUSUARIO = @usuario OR UPPER(GU.CODUSUARIO) = UPPER(@usuario))
      `);

      if (queryResult.recordset?.[0]) {
        dbUser = queryResult.recordset[0];
        break; // Encontrou o usuário, encerra o loop
      }
    }

    if (!dbUser) {
      result.latency_ms = Date.now() - start;
      return NextResponse.json(
        { success: false, error: 'Usuário não encontrado. Contactar o RH.' },
        { status: 401 }
      );
    }

    // =========================================================================
    // 🔐 PROCESSAMENTO E VALIDAÇÃO DA SENHA (ENVELOPE OU FALLBACK TOTVS API)
    // =========================================================================
    let isAuthenticated = false;
    const formato = formatoSenhaPortal(dbUser.SENHA);

    // Etapa 1: Se for Envelope, tenta validação local (muito rápida)
    if (formato === 'envelope') {
      isAuthenticated = validarEnvelopeLocal(senha, dbUser.SENHA, dbUser.CONTROLE);
    }

    // Etapa 2: Se a validação local falhou OU a senha for do formato Legado / Outro / Vazio,
    // tenta a autenticação via API TOTVS /connect/token
    if (!isAuthenticated) {
      isAuthenticated = await validarSenhaTotvsApi(dbUser.CODUSUARIO, dbUser.CPF, senha);
    }

    if (!isAuthenticated) {
      result.latency_ms = Date.now() - start;
      return NextResponse.json(
        { success: false, error: 'Usuário ou senha inválidos.' },
        { status: 401 }
      );
    }

    // Gera a chave Basic Auth (usuario:senha) em Base64
    const totvsBasic = Buffer.from(`${dbUser.CODUSUARIO}:${senha}`).toString('base64');

    // =========================================================================
    // 🎟️ EMISSÃO DO JWT E SESSÃO
    // =========================================================================
    const token = await new SignJWT({
      usuario: dbUser.CODUSUARIO,
      nome: dbUser.NOME,
      cpf: dbUser.CPF,
      totvsBasic: totvsBasic, // 👈 ADICIONE ESSA LINHA
      codpessoa: dbUser.CODPESSOA,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(JWT_SECRET);

    const { SENHA, ...userWithoutPassword } = dbUser;

    console.log(token)

    result.success = true;
    result.user = userWithoutPassword;
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