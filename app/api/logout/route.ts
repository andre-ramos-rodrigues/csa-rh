import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Redireciona o usuário para a tela de login
  const loginUrl = new URL('/login', request.url);
  const response = NextResponse.redirect(loginUrl);

  // Deleta o cookie de autenticação zerando o valor e expirando imediatamente
  response.cookies.set({
    name: 'auth_token',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0, // Expirado imediatamente
  });

  return response;
}

// Suporte para chamadas via POST (ex: ao clicar em um botão "Sair" via fetch ou form)
export async function POST(request: NextRequest) {
  const response = NextResponse.json(
    { success: true, message: 'Logout realizado com sucesso.' },
    { status: 200 }
  );

  response.cookies.set({
    name: 'auth_token',
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}