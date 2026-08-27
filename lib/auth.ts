// lib/auth.ts
import { jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import { checkIsRhUser, FULL_ACCESS_USERS } from '@/lib/constants';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-totvs-12345'
);

export interface AuthUser {
  usuario: string;
  nome: string;
  cpf: string;
  isRh: boolean;
  hasFullAccess: boolean;
  codPessoa: string;
}

/**
 * Extrai e valida o usuário autenticado a partir do cookie da requisição.
 * Retorna null se não houver token ou se ele for inválido/expirado.
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get('auth_token')?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    const usuario = (payload.usuario as string) || '';
    const nome = (payload.nome as string) || '';
    const cpf = (payload.cpf as string) || '';
    const currentUsername = usuario.trim().toUpperCase();
    const codPessoa = (payload.codPessoa as string) || '';

    console.log(payload);

    return {
      usuario,
      nome,
      cpf,
      isRh: checkIsRhUser(usuario),
      hasFullAccess: FULL_ACCESS_USERS.some((u) => u.toUpperCase() === currentUsername),
      codPessoa: codPessoa,
    };
  } catch {
    return null;
  }
}

/**
 * Confirma se o usuário autenticado pode acessar os dados do CPF informado:
 * é o dono do CPF, ou tem acesso Full, ou é RH.
 */
export function canAccessCpf(user: AuthUser, targetCpf: string): boolean {
  const cleanTarget = targetCpf.replace(/\D/g, '');
  const cleanOwn = user.cpf.replace(/\D/g, '');
  return user.hasFullAccess || user.isRh || cleanOwn === cleanTarget;
}