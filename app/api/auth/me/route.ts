import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);

  if (!user) {
    
    return NextResponse.json(
      { success: false, error: 'Sessão não encontrada / não autenticado' },
      { status: 401 }
    );
  }

  return NextResponse.json({ success: true, user }, { status: 200 });
}