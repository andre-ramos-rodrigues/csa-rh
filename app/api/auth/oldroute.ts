import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { totvsPool, totvsPoolConnect } from '@/lib/db-totvs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-totvs-12345'
);

export type FormatoSenhaPortal = 'envelope' | 'legado' | 'vazio' | 'outro';

/** Detecta o formato da senha armazenada em GUSUARIO.SENHA. */
export function formatoSenhaPortal(
  armazenado: string | null | undefined
): FormatoSenhaPortal {
  if (!armazenado) return 'vazio';
  const str = armazenado.trim();
  if (str.startsWith('#P=') || str.includes('#H=$2')) return 'envelope';
  if (/^[A-Za-z]{8}$/.test(str)) return 'legado';
  return 'outro';
}

/** Pré-hash exigido pelo RM antes do bcrypt: base64(sha256(utf8(senha))). */
function preHashSha256Base64(senha: string): string {
  const preHash = createHash('sha256').update(senha, 'utf8').digest('base64');
  ////console.log('[AUTH DEBUG] 🔑 Senha recebida (plain text):', `"${senha}"`);
  ////console.log('[AUTH DEBUG] ⚡ Pre-hash gerado (SHA256 Base64):', `"${preHash}"`);
  return preHash;
}

/** Valida `senha` contra o envelope Bcrypt do RM incluindo hipóteses com o valor de CONTROLE */
function validarEnvelope(senha: string, armazenado: string, controle?: number | string | null): boolean {
  //console.log('\n------------------- INÍCIO DA VALIDAÇÃO DO ENVELOPE -------------------');
  const str = (armazenado || '').trim();
  //console.log('[AUTH DEBUG] 📦 Senha vinda do Banco (Bruta):', `"${str}"`);
  //console.log('[AUTH DEBUG] 🔢 Valor do CONTROLE:', controle);

  const i = str.indexOf('#H=');
  const hash = i >= 0 ? str.slice(i + 3).trim() : str;
  //console.log('[AUTH DEBUG] 🎯 Hash Bcrypt extraído:', `"${hash}"`);

  if (!hash.startsWith('$2') || hash.length !== 60) {
    //console.log('[AUTH DEBUG] ❌ FALHA: Hash inválido.');
    return false;
  }

  const ctrlStr = controle !== null && controle !== undefined ? String(controle).trim() : '';
  const sUpper = senha.toUpperCase();

  const hipoteses: { label: string; valor: string }[] = [
    { label: 'Standard (senha)', valor: createHash('sha256').update(senha, 'utf8').digest('base64') },
    { label: 'Standard UPPER (SENHA)', valor: createHash('sha256').update(sUpper, 'utf8').digest('base64') },
  ];

  if (ctrlStr) {
    hipoteses.push(
      { label: 'Senha + Controle (Base64)', valor: createHash('sha256').update(senha + ctrlStr, 'utf8').digest('base64') },
      { label: 'SENHA.UPPER + Controle (Base64)', valor: createHash('sha256').update(sUpper + ctrlStr, 'utf8').digest('base64') },
      { label: 'Controle + Senha (Base64)', valor: createHash('sha256').update(ctrlStr + senha, 'utf8').digest('base64') },
      { label: 'Controle + SENHA.UPPER (Base64)', valor: createHash('sha256').update(ctrlStr + sUpper, 'utf8').digest('base64') },
      { label: 'Senha + Controle (Hex)', valor: createHash('sha256').update(senha + ctrlStr, 'utf8').digest('hex') },
      { label: 'SENHA.UPPER + Controle (Hex Upper)', valor: createHash('sha256').update(sUpper + ctrlStr, 'utf8').digest('hex').toUpperCase() }
    );
  }

  //console.log('[AUTH DEBUG] ⏳ Testando hipóteses de pré-hash...');

  for (const item of hipoteses) {
    try {
      const ok = bcrypt.compareSync(item.valor, hash);
      //console.log(`[AUTH DEBUG] 🧪 ${item.label} => ${ok ? '✅ BATEU!' : '❌'}`);
      if (ok) {
        //console.log(`\n===============================================================`);
        //console.log(`🎉 ENCONTRADO! O pré-hash correto do TOTVS usa: ${item.label}`);
        //console.log(`===============================================================\n`);
        return true;
      }
    } catch {
      // ignora exceção de comparação
    }
  }

  //console.log('------------------- FIM DA VALIDAÇÃO DO ENVELOPE -------------------\n');
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

    //console.log('\n=================== NOVA REQUISIÇÃO DE AUTH ===================');
    //console.log('[AUTH DEBUG] 👤 Usuário recebido no payload:', usuario);

    if (!usuario || !senha) {
      //console.log('[AUTH DEBUG] ❌ Campos obrigatórios ausentes.');
      result.latency_ms = Date.now() - start;
      return NextResponse.json(
        { success: false, error: 'Os campos "usuario" e "senha" são obrigatórios.' },
        { status: 400 }
      );
    }

    const cleanUser = String(usuario).trim();

    // =========================================================================
    // 🛡️ BYPASS PARA DESENVOLVIMENTO: MASTER USER
    // =========================================================================
    if (cleanUser.toLowerCase() === 'masteruser') {
      const masterEnvPassword = process.env.PASSWORD;

      if (masterEnvPassword && senha === masterEnvPassword) {
        //console.log('[AUTH DEBUG] 🚀 AUTENTICADO VIA MASTERUSER (BYPASS DEV)!');

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
        //console.log('[AUTH DEBUG] ❌ MASTERUSER: Senha informada não confere com PASSWORD do .env.');
        result.latency_ms = Date.now() - start;
        return NextResponse.json(
          { success: false, error: 'Usuário ou senha inválidos.' },
          { status: 401 }
        );
      }
    }
    // =========================================================================

    await totvsPoolConnect;
    const req = totvsPool.request();
    req.input('usuario', cleanUser);

    //console.log('[AUTH DEBUG] 🔍 Executando busca SQL para:', cleanUser);

    const queryResult = await req.query(`
      SELECT TOP 1 
        GU.CODUSUARIO, 
        GU.SENHA, 
        GU.CONTROLE, 
        E.DESCRICAO, 
        F.CODEQUIPE, 
        P.NOME, 
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
        AND UPPER(GU.CODUSUARIO) = UPPER(@usuario)
    `);

    const dbUser = queryResult.recordset?.[0];

    // 1. Verifica se o usuário existe
    if (!dbUser) {
      //console.log('[AUTH DEBUG] ❌ Usuário não encontrado no banco TOTVS.');
      result.latency_ms = Date.now() - start;
      return NextResponse.json(
        { success: false, error: 'Usuário não encontrado. Contactar o RH.' },
        { status: 401 }
      );
    }

    //console.log('[AUTH DEBUG] 👤 Usuário retornado do banco:', dbUser.CODUSUARIO);

    // 2. Avalia o formato da senha
    const formato = formatoSenhaPortal(dbUser.SENHA);
    //console.log('[AUTH DEBUG] 🏷️ Formato de senha detectado:', formato);

    if (formato === 'vazio') {
      //console.log('[AUTH DEBUG] ❌ Recusado: Campo SENHA está nulo ou vazio no banco.');
      result.latency_ms = Date.now() - start;
      return NextResponse.json(
        { success: false, error: 'Usuário sem senha cadastrada no sistema.' },
        { status: 401 }
      );
    }

    if (formato === 'legado' || formato === 'outro') {
      //console.log(`[AUTH DEBUG] ❌ Recusado: Senha em formato não suportado ("${formato}").`);
      result.latency_ms = Date.now() - start;
      return NextResponse.json(
        { 
          success: false, 
          error: 'Formato de senha não suportado via API local. Redefina a senha no Portal.' 
        },
        { status: 422 }
      );
    }

    // 3. Validação do envelope
    const ok = validarEnvelope(senha, dbUser.SENHA, dbUser.CONTROLE);

    if (!ok) {
      //console.log('[AUTH DEBUG] ❌ AUTENTICAÇÃO FALHOU: A senha não bateu com o hash do banco.');
      result.latency_ms = Date.now() - start;
      return NextResponse.json(
        { success: false, error: 'Usuário ou senha inválidos.' },
        { status: 401 }
      );
    }

    //console.log('[AUTH DEBUG] 🎉 SUCESSO! Usuário autenticado com sucesso.');

    // 4. Token JWT
    const token = await new SignJWT({
      usuario: dbUser.CODUSUARIO,
      nome: dbUser.NOME,
      cpf: dbUser.CPF,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('8h')
      .sign(JWT_SECRET);

    const { SENHA, ...userWithoutPassword } = dbUser;

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
    //console.error('[AUTH DEBUG] 💥 ERRO CRÍTICO NA API DE AUTH:', error);
    result.success = false;
    result.error = error.message || String(error);
    result.latency_ms = Date.now() - start;

    return NextResponse.json(result, { status: 500 });
  }
}