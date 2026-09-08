import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { jwtVerify } from 'jose';
import { sqliteDb, initAppDb } from '@/lib/db-app';
import { RH_USERS, FULL_ACCESS_USERS, checkIsRhUser } from '@/lib/constants';
import { createCursoCatalogo, createEntidadeCatalogo } from '@/lib/rm/createAcademic';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-totvs-12345'
);

export async function POST(request: NextRequest) {
  try {
    // -------------------------------------------------------------------------
    // AUTENTICAÇÃO E PERMISSÃO
    // -------------------------------------------------------------------------
    const authToken = request.cookies.get('auth_token')?.value;
    if (!authToken) {
      return NextResponse.json({ success: false, error: 'Não autenticado.' }, { status: 401 });
    }

    let userPayload: any;
    try {
      const { payload } = await jwtVerify(authToken, JWT_SECRET);
      userPayload = payload;
    } catch {
      return NextResponse.json({ success: false, error: 'Sessão inválida ou expirada.' }, { status: 401 });
    }

    const currentUsername = userPayload?.usuario ? String(userPayload.usuario).trim().toUpperCase() : '';
    const isFullAccess = FULL_ACCESS_USERS.some((u) => u.toUpperCase() === currentUsername);
    const isRhUser =
      RH_USERS?.some((u) => u.toUpperCase() === currentUsername) ||
      (typeof checkIsRhUser === 'function' && checkIsRhUser(currentUsername)) ||
      Boolean(userPayload?.isRh);

    if (!isFullAccess && !isRhUser) {
      return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 });
    }

    // -------------------------------------------------------------------------
    // PAYLOAD
    // -------------------------------------------------------------------------
    const body = await request.json();
    const { type, nome, fieldId } = body as { type: 'curso' | 'entidade'; nome: string; fieldId: number | string };

    if (type !== 'curso' && type !== 'entidade') {
      return NextResponse.json({ success: false, error: 'Tipo inválido.' }, { status: 400 });
    }

    const cleanNome = String(nome || '').trim();
    if (!cleanNome || !fieldId) {
      return NextResponse.json({ success: false, error: 'Dados incompletos.' }, { status: 400 });
    }

    // -------------------------------------------------------------------------
    // 1. ESCRITA REAL NO TOTVS
    // -------------------------------------------------------------------------
    const novoCodigo =
      type === 'curso'
        ? await createCursoCatalogo(cleanNome, currentUsername)
        : await createEntidadeCatalogo(cleanNome, currentUsername);

    // -------------------------------------------------------------------------
    // 2. ESCRITA REAL NO SQLITE
    // -------------------------------------------------------------------------
    initAppDb();

    const fieldRow = sqliteDb
      .prepare(`SELECT id, new_value FROM change_request_fields WHERE id = ?`)
      .get(fieldId) as { id: number; new_value: string } | undefined;

    if (!fieldRow) {
      return NextResponse.json(
        { success: false, error: 'Campo de solicitação não encontrado no SQLite.' },
        { status: 404 }
      );
    }

    let parsedValue: any;
    try {
      parsedValue = JSON.parse(fieldRow.new_value);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Não foi possível interpretar o JSON do SQLite.' },
        { status: 500 }
      );
    }

    // Comparação insensível a maiúsculas/minúsculas
    const isSameName = (str1?: string, str2?: string) =>
      String(str1 || '').trim().toUpperCase() === String(str2 || '').trim().toUpperCase();

    // Injeta o novo código no item correspondente do JSON
    if (Array.isArray(parsedValue)) {
      parsedValue = parsedValue.map((item: any) => {
        if (type === 'curso' && (!item.CODCURSO || isSameName(item.CURSO_NOME, cleanNome))) {
          return { ...item, CODCURSO: Number(novoCodigo) };
        }
        if (type === 'entidade' && (!item.CODENTIDADE || isSameName(item.ENTIDADE_NOMEFANTASIA, cleanNome))) {
          return { ...item, CODENTIDADE: String(novoCodigo) };
        }
        return item;
      });
    } else if (typeof parsedValue === 'object' && parsedValue !== null) {
      if (type === 'curso') {
        parsedValue.CODCURSO = Number(novoCodigo);
      } else {
        parsedValue.CODENTIDADE = String(novoCodigo);
      }
    }

    const updatedJsonString = JSON.stringify(parsedValue);

    // Atualiza o JSON do campo no banco SQLite local
    sqliteDb
      .prepare(`UPDATE change_request_fields SET new_value = ? WHERE id = ?`)
      .run(updatedJsonString, fieldId);

    // -------------------------------------------------------------------------
    // 3. INVALIDAÇÃO DE CACHE DO NEXT.JS (Obrigatório para o router.refresh())
    // -------------------------------------------------------------------------
    revalidatePath('/', 'layout');

    // -------------------------------------------------------------------------
    // LOG DE AUDITORIA
    // -------------------------------------------------------------------------
    console.log('==================================================');
    console.log(`🚀 [GRAVAÇÃO REAL CONCLUÍDA]`);
    console.log(`📌 Tipo: ${type.toUpperCase()}`);
    console.log(`📌 Nome Cadastrado: "${cleanNome}"`);
    console.log(`📌 Novo Código Gerado no TOTVS: ${novoCodigo}`);
    console.log(`📌 Field ID (SQLite): ${fieldId}`);
    console.log(`📌 JSON Atualizado: ${updatedJsonString}`);
    console.log('==================================================');

    return NextResponse.json({
      success: true,
      newCode: novoCodigo,
      type,
    });
  } catch (error: any) {
    console.error('💥 Erro ao gravar item no catálogo acadêmico:', error);
    return NextResponse.json({ success: false, error: error.message || String(error) }, { status: 500 });
  }
}