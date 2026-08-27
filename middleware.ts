import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { RH_USERS, FULL_ACCESS_USERS, checkIsRhUser } from '@/lib/constants';

// Mesma chave secreta usada no app/api/auth/route.ts
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-totvs-12345'
);

export { RH_USERS, FULL_ACCESS_USERS, checkIsRhUser };

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // 1. Obtém o token do cookie de autenticação
  const tokenCookie = request.cookies.get('auth_token')?.value;

  let userPayload: { usuario?: string; nome?: string; cpf?: string; codPessoa?: string | number } | null = null;

  // 2. Se o cookie existir, valida e decodifica o JWT
  if (tokenCookie) {
    try {
      const { payload } = await jwtVerify(tokenCookie, JWT_SECRET);
      userPayload = payload as { usuario?: string; nome?: string; cpf?: string; codPessoa?: string | number };
    } catch (err) {
      console.warn('JWT inválido ou expirado no Middleware');
    }
  }

  const isAuthenticated = Boolean(userPayload);

  // Extrai codPessoa e CPF do token do usuário logado
  const codPessoaStr = userPayload?.codPessoa ? String(userPayload.codPessoa).trim() : '';
  const userCpfClean = userPayload?.cpf ? String(userPayload.cpf).replace(/\D/g, '') : '';

  // Mapeamento de rotas
  const isRootPath = pathname === '/';
  const isAuthPath = pathname.startsWith('/login');
  const isDashboardPage = pathname.startsWith('/dashboard');
  const isMigrationPage = pathname.startsWith('/rhmigration');
  const isEmployeePage = pathname.startsWith('/employee');
  const isEmployeeApi = pathname.startsWith('/api/') && pathname.includes('employee');

  const isProtectedPath = isDashboardPage || isEmployeePage || isEmployeeApi || isMigrationPage || isRootPath;

  // ---------------------------------------------------------------------------
  // REGRA 1: Usuário NÃO autenticado tentando acessar páginas protegidas
  // ---------------------------------------------------------------------------
  if (isProtectedPath && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ---------------------------------------------------------------------------
  // REGRA 2: Verificação de Permissões para Usuário Autenticado
  // ---------------------------------------------------------------------------
  if (isAuthenticated && userPayload?.usuario) {
    const currentUsername = userPayload.usuario.trim().toUpperCase();

    // Verifica se possui acesso Full Access ou perfil RH
    const isFullAccess = FULL_ACCESS_USERS.some(
      (user) => user.toUpperCase() === currentUsername
    );
    const isRhUser =
      RH_USERS?.some((user) => user.toUpperCase() === currentUsername) ||
      (typeof checkIsRhUser === 'function' && checkIsRhUser(currentUsername));

    const hasRhOrFullAccess = isFullAccess || isRhUser;

    // A) Se for acesso à raiz '/' ou tela de '/login' quando já está logado
    if (pathname === '/' || isAuthPath) {
      const defaultTarget = hasRhOrFullAccess
        ? '/dashboard'
        : codPessoaStr
        ? `/employee/${codPessoaStr}`
        : userCpfClean
        ? `/employee/${userCpfClean}`
        : '/login';

      return NextResponse.redirect(new URL(defaultTarget, request.url));
    }

    // B) Se NÃO for usuário RH/Full Access, aplica restrições de acesso
    if (!hasRhOrFullAccess) {
      // B.1) Tenta acessar /dashboard ou /rhmigration -> Redireciona para /employee/codPessoa
      if (isDashboardPage || isMigrationPage) {
        const myTarget = codPessoaStr || userCpfClean;
        if (myTarget) {
          return NextResponse.redirect(new URL(`/employee/${myTarget}`, request.url));
        }
      }

      // Função auxiliar para verificar se o ID fornecido pertence ao usuário logado (por codPessoa ou por CPF)
      const isAllowedIdentifier = (idParam: string | null | undefined) => {
        if (!idParam) return true; // Se nenhum ID foi especificado, permite passar
        const cleanVal = idParam.trim();
        const cleanDigits = cleanVal.replace(/\D/g, '');

        const matchesCodPessoa = Boolean(codPessoaStr && cleanVal === codPessoaStr);
        const matchesCpf = Boolean(userCpfClean && cleanDigits && cleanDigits === userCpfClean);

        return matchesCodPessoa || matchesCpf;
      };

      // Extrai dinamicamente o último segmento da rota (evitando palavras reservadas)
      const pathSegments = pathname.split('/').filter(Boolean);
      const lastSegment = pathSegments[pathSegments.length - 1];
      const reservedKeywords = ['employee', 'totvs', 'change-request', 'api'];
      const requestedPathId = lastSegment && !reservedKeywords.includes(lastSegment.toLowerCase()) 
        ? lastSegment 
        : null;

      // B.2) Tenta acessar página de outro funcionário (/employee/outro_id)
      if (isEmployeePage) {
        const queryCpf = searchParams.get('cpf');
        const queryCodPessoa = searchParams.get('codPessoa');

        const isPathValid = isAllowedIdentifier(requestedPathId);
        const isCpfValid = isAllowedIdentifier(queryCpf);
        const isCodPessoaValid = isAllowedIdentifier(queryCodPessoa);

        if (!isPathValid || !isCpfValid || !isCodPessoaValid) {
          const myTarget = codPessoaStr || userCpfClean;
          if (myTarget) {
            return NextResponse.redirect(new URL(`/employee/${myTarget}`, request.url));
          }
        }
      }

      // B.3) Chamada na API enviando CPF ou codPessoa de outro usuário
      if (isEmployeeApi) {
        const queryCpf = searchParams.get('cpf');
        const queryCodPessoa = searchParams.get('codPessoa') || searchParams.get('employeeId');

        const isPathValid = isAllowedIdentifier(requestedPathId);
        const isCpfValid = isAllowedIdentifier(queryCpf);
        const isCodPessoaValid = isAllowedIdentifier(queryCodPessoa);

        if (!isPathValid || !isCpfValid || !isCodPessoaValid) {
          return NextResponse.json(
            { success: false, error: 'Acesso negado. Você só pode visualizar seus próprios dados.' },
            { status: 403 }
          );
        }
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/login',
    '/employee/:path*',
    '/api/employee/:path*',
    '/api/totvs/employee/:path*',
    '/api/change-request/employee/:path*',
    '/rhmigration/:path*',
  ],
};