import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { sqliteDb, initAppDb } from '@/lib/db-app';

// Mesmo diretório definido na rota de submit
const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || path.join(process.cwd(), 'data', 'attachments');

interface AttachmentRecord {
  id: number;
  change_request_id: number;
  field_name: string | null;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  size_bytes: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initAppDb();

    // 1. Resolver params no Next.js 15+
    const { id } = await params;
    const attachmentId = parseInt(id, 10);

    if (isNaN(attachmentId)) {
      return NextResponse.json(
        { error: 'ID do anexo inválido.' },
        { status: 400 }
      );
    }

    // 2. Consulta no banco de dados
    const attachment = sqliteDb
      .prepare(
        `SELECT id, original_filename, stored_filename, mime_type, size_bytes 
         FROM change_request_attachments 
         WHERE id = ?`
      )
      .get(attachmentId) as AttachmentRecord | undefined;

    if (!attachment) {
      return NextResponse.json(
        { error: 'Anexo não encontrado no banco de dados.' },
        { status: 404 }
      );
    }

    // 3. Montar o caminho exato do arquivo no disco
    const filePath = path.join(ATTACHMENTS_DIR, attachment.stored_filename);

    if (!fs.existsSync(filePath)) {
      console.error(`[Anexos] Arquivo não encontrado no caminho: ${filePath}`);
      return NextResponse.json(
        { error: 'Arquivo físico não encontrado no servidor.' },
        { status: 404 }
      );
    }

    // 4. Ler e responder o arquivo
    const fileBuffer = fs.readFileSync(filePath);

    const headers = new Headers();
    headers.set('Content-Type', attachment.mime_type || 'application/octet-stream');
    headers.set('Content-Length', fileBuffer.length.toString());
    headers.set(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.original_filename)}"`
    );

    return new NextResponse(fileBuffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Erro ao buscar anexo no SQLite:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar o anexo.' },
      { status: 500 }
    );
  }
}