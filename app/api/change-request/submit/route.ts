import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import { sqliteDb, initAppDb } from '@/lib/db-app';
import { getAuthUser } from '@/lib/auth';
import { ALL_ALLOWED_FIELDS, VALID_SECTION_KEYS, getSectionForField } from '@/lib/change-request-section';

const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || path.join(process.cwd(), 'data', 'attachments');

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface IncomingChange {
  field: string;
  label?: string;
  oldVal?: string;
  newVal: string;
}

/**
 * Extrai uma chave de identificação única do objeto (ID, CPF, Nome).
 */
function getItemKey(obj: any): string {
  if (!obj || typeof obj !== 'object') return '';
  const id = obj.ID ?? obj.id;
  const cpf = obj.CPF ?? obj.cpf;
  const nome = obj.NOME ?? obj.nome ?? obj.CURSO_NOME ?? obj.curso_nome;
  return String(id || (cpf && String(cpf).replace(/\D/g, '')) || nome || '').trim().toLowerCase();
}

/**
 * Compara dois objetos para verificar se houve alteração real nos valores dos campos.
 */
function hasObjectChanged(oldObj: any, newObj: any): boolean {
  if (typeof oldObj !== typeof newObj) return true;
  if (!oldObj || !newObj) return oldObj !== newObj;
  if (typeof oldObj !== 'object') return oldObj !== newObj;

  const keys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of keys) {
    if (key.startsWith('_') || key === 'isEditing' || key === 'isNew') continue;

    const valOld = oldObj[key];
    const valNew = newObj[key];

    const normOld = valOld === null || valOld === undefined ? '' : String(valOld).trim();
    const normNew = valNew === null || valNew === undefined ? '' : String(valNew).trim();

    if (normOld !== normNew) {
      return true;
    }
  }

  return false;
}

/**
 * Helper para gerar uma chave composta única para o campo/item no Map.
 */
function getFieldKey(fieldName: string, newVal: string): string {
  const isArrayField =
    fieldName === 'DEPENDENTES' ||
    fieldName === 'FORMACAO_ACADEMICA' ||
    fieldName.startsWith('DEPENDENTE') ||
    fieldName.startsWith('FORMACAO_ACADEMICA');

  if (!isArrayField) {
    return fieldName;
  }

  try {
    const item = typeof newVal === 'string' ? JSON.parse(newVal) : newVal;
    const obj = Array.isArray(item) ? item[0] : item;
    const keyPart = getItemKey(obj);
    if (keyPart) return `${fieldName}::${keyPart}`;
  } catch {
    // Fallback para string bruta
  }

  return `${fieldName}::${newVal}`;
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: 'Não autorizado' }, { status: 401 });
  }

  try {
    initAppDb();
    await mkdir(ATTACHMENTS_DIR, { recursive: true });

    const formData = await request.formData();

    // --- CPF: fonte da verdade é o token ---
    const employeeCpfRaw = String(formData.get('employeeCpf') || '');
    const cleanCpfSubmitted = employeeCpfRaw.replace(/\D/g, '');
    const cleanCpfSession = user.cpf.replace(/\D/g, '');

    if (!cleanCpfSession) {
      return NextResponse.json(
        { success: false, error: 'Sessão sem CPF associado. Contate o suporte.' },
        { status: 403 }
      );
    }
    if (cleanCpfSubmitted !== cleanCpfSession) {
      return NextResponse.json(
        { success: false, error: 'Você só pode solicitar alteração dos seus próprios dados.' },
        { status: 403 }
      );
    }

    // --- Campos alterados ---
    const changesRaw = String(formData.get('changes') || '[]');
    let changes: IncomingChange[];
    try {
      changes = JSON.parse(changesRaw);
    } catch {
      return NextResponse.json({ success: false, error: 'Formato inválido para as alterações.' }, { status: 400 });
    }
    if (!Array.isArray(changes)) {
      return NextResponse.json({ success: false, error: 'Formato inválido para as alterações.' }, { status: 400 });
    }

    // 💥 DESACOPLAMENTO E FILTRAGEM DE DELTA:
    // Expande os arrays e descarta registros que NÃO sofreram alterações reais.
    const expandedChanges: IncomingChange[] = [];

    for (const change of changes) {
      const isArrayField =
        change.field === 'DEPENDENTES' ||
        change.field === 'FORMACAO_ACADEMICA' ||
        change.field.startsWith('DEPENDENTE') ||
        change.field.startsWith('FORMACAO_ACADEMICA');

      if (isArrayField && change.newVal) {
        try {
          const parsedNew = JSON.parse(change.newVal);

          if (Array.isArray(parsedNew)) {
            let parsedOld: any[] = [];
            if (change.oldVal) {
              try {
                const pOld = JSON.parse(change.oldVal);
                parsedOld = Array.isArray(pOld) ? pOld : [pOld];
              } catch {
                parsedOld = [];
              }
            }

            // Mapeia os registros antigos por chave (ID/CPF/Nome)
            const oldMap = new Map<string, any>();
            for (const oldItem of parsedOld) {
              const k = getItemKey(oldItem);
              if (k) oldMap.set(k, oldItem);
            }

            for (const newItem of parsedNew) {
              const key = getItemKey(newItem);
              const oldItem = key ? oldMap.get(key) : null;

              if (oldItem) {
                // Registro existente: só inclui se HOUVER alteração em algum atributo
                if (hasObjectChanged(oldItem, newItem)) {
                  expandedChanges.push({
                    field: change.field,
                    label: change.label,
                    oldVal: JSON.stringify(oldItem),
                    newVal: typeof newItem === 'string' ? newItem : JSON.stringify(newItem),
                  });
                }
              } else {
                // Registro novo (Inclusão de dependente/curso)
                expandedChanges.push({
                  field: change.field,
                  label: change.label,
                  oldVal: undefined,
                  newVal: typeof newItem === 'string' ? newItem : JSON.stringify(newItem),
                });
              }
            }
            continue; // Finalizou o tratamento da coleção
          }
        } catch {
          // Em caso de falha de parsing, mantém o comportamento padrão
        }
      }

      expandedChanges.push(change);
    }

    changes = expandedChanges;

    const invalidField = changes.find((c) => !ALL_ALLOWED_FIELDS.includes(c.field));
    if (invalidField) {
      return NextResponse.json(
        { success: false, error: `Campo não permitido: ${invalidField.field}` },
        { status: 400 }
      );
    }

    // --- Anexos ---
    const files = formData.getAll('attachments') as File[];
    const categoriesRaw = String(formData.get('attachmentCategories') || '[]');
    let categories: string[];
    try {
      categories = JSON.parse(categoriesRaw);
    } catch {
      return NextResponse.json({ success: false, error: 'Formato inválido para categorias de anexos.' }, { status: 400 });
    }

    if (files.length !== categories.length) {
      return NextResponse.json(
        { success: false, error: 'Número de anexos e categorias não corresponde.' },
        { status: 400 }
      );
    }

    const invalidCategory = categories.find((c) => {
      if (VALID_SECTION_KEYS.includes(c)) return false;
      if (c.startsWith('dependentes') || c.startsWith('dependente')) return false;
      if (c.startsWith('formacao_academica') || c.startsWith('formacaoAcademica')) return false;
      return true;
    });

    if (invalidCategory) {
      return NextResponse.json(
        { success: false, error: `Categoria de anexo não reconhecida: ${invalidCategory}` },
        { status: 400 }
      );
    }

    if (changes.length === 0 && files.length === 0) {
      return NextResponse.json({ success: false, error: 'Nenhuma alteração real ou anexo foi enviado.' }, { status: 400 });
    }

    for (const file of files) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          { success: false, error: `Tipo de arquivo não permitido: ${file.name} (${file.type})` },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { success: false, error: `Arquivo muito grande: ${file.name} (máx. 10MB)` },
          { status: 400 }
        );
      }
    }

    // --- AGRUPAR CAMPOS E ANEXOS POR SEÇÃO/ASSUNTO ---
    const sectionGroups = new Map<
      string,
      { changes: IncomingChange[]; files: { file: File; category: string; index: number }[] }
    >();

    for (const change of changes) {
      const secKey = getSectionForField(change.field);
      if (!secKey) continue;

      if (!sectionGroups.has(secKey)) {
        sectionGroups.set(secKey, { changes: [], files: [] });
      }
      sectionGroups.get(secKey)!.changes.push(change);
    }

    const formacaoSectionKey = getSectionForField('FORMACAO_ACADEMICA') || 'formacaoAcademica';

    files.forEach((file, idx) => {
      const rawCat = categories[idx];
      let secKey = rawCat;

      if (rawCat.startsWith('dependentes') || rawCat.startsWith('dependente')) {
        secKey = 'dependentes';
      } else if (rawCat.startsWith('formacao_academica') || rawCat.startsWith('formacaoAcademica')) {
        secKey = formacaoSectionKey;
      }

      if (!sectionGroups.has(secKey)) {
        sectionGroups.set(secKey, { changes: [], files: [] });
      }
      sectionGroups.get(secKey)!.files.push({ file, category: rawCat, index: idx });
    });

    // --- Grava arquivos em disco ---
    const savedFiles: { storedFilename: string; fullPath: string; fileIndex: number }[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = path.extname(file.name) || '';
        const storedFilename = `${randomUUID()}${ext}`;
        const fullPath = path.join(ATTACHMENTS_DIR, storedFilename);
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(fullPath, buffer);
        savedFiles.push({ storedFilename, fullPath, fileIndex: i });
      }
    } catch (fileErr) {
      await Promise.allSettled(savedFiles.map((f) => unlink(f.fullPath)));
      throw fileErr;
    }

    // --- Processamento da Transação ---
    const employeeName = user.nome || 'Desconhecido';
    const processedRequestIds: number[] = [];

    const insertTransaction = sqliteDb.transaction(() => {
      const getPreviousCountStmt = sqliteDb.prepare(`
        SELECT MAX(crf.resubmission_count) as max_count
        FROM change_request_fields crf
        JOIN change_requests cr ON cr.id = crf.change_request_id
        WHERE cr.employee_cpf = ? AND crf.field_name = ?
      `);

      const insertFieldStmt = sqliteDb.prepare(
        `INSERT INTO change_request_fields (change_request_id, field_name, old_value, new_value, status, resubmission_count)
         VALUES (?, ?, ?, ?, 'pending', ?)`
      );

      const updateFieldStmt = sqliteDb.prepare(
        `UPDATE change_request_fields
         SET new_value = ?, resubmission_count = resubmission_count + 1
         WHERE id = ?`
      );

      const historyStmt = sqliteDb.prepare(
        `INSERT INTO change_request_field_history (field_id, new_value, status)
         VALUES (?, ?, 'pending')`
      );

      for (const [sectionKey, group] of sectionGroups.entries()) {
        const existingReq = sqliteDb
          .prepare(
            `SELECT id FROM change_requests
             WHERE employee_cpf = ? AND section_key = ? AND status = 'pending'`
          )
          .get(cleanCpfSession, sectionKey) as { id: number } | undefined;

        let changeRequestId: number;

        if (existingReq) {
          changeRequestId = existingReq.id;
          try {
            sqliteDb.prepare(`UPDATE change_requests SET updated_at = datetime('now') WHERE id = ?`).run(changeRequestId);
          } catch {
            // Ignora se a coluna não existir
          }
        } else {
          const requestInsert = sqliteDb
            .prepare(
              `INSERT INTO change_requests (employee_cpf, employee_name, section_key, status)
               VALUES (?, ?, ?, 'pending')`
            )
            .run(cleanCpfSession, employeeName, sectionKey);

          changeRequestId = requestInsert.lastInsertRowid as number;
        }

        if (!processedRequestIds.includes(changeRequestId)) {
          processedRequestIds.push(changeRequestId);
        }

        const existingPendingFields = sqliteDb
          .prepare(
            `SELECT id, field_name, new_value
             FROM change_request_fields
             WHERE change_request_id = ? AND status = 'pending'`
          )
          .all(changeRequestId) as { id: number; field_name: string; new_value: string }[];

        const pendingFieldMap = new Map(
          existingPendingFields.map((f) => [getFieldKey(f.field_name, f.new_value), f])
        );

        for (const change of group.changes) {
          const key = getFieldKey(change.field, change.newVal);
          const existingField = pendingFieldMap.get(key);

          if (!existingField) {
            const prevResult = getPreviousCountStmt.get(cleanCpfSession, change.field) as
              | { max_count: number | null }
              | undefined;

            const nextResubmissionCount =
              prevResult?.max_count !== null && prevResult?.max_count !== undefined
                ? prevResult.max_count + 1
                : 0;

            const fieldResult = insertFieldStmt.run(
              changeRequestId,
              change.field,
              change.oldVal ?? null,
              change.newVal,
              nextResubmissionCount
            );
            historyStmt.run(fieldResult.lastInsertRowid as number, change.newVal);
          } else if (existingField.new_value !== change.newVal) {
            updateFieldStmt.run(change.newVal, existingField.id);
            historyStmt.run(existingField.id, change.newVal);
          }
        }

        const attachmentStmt = sqliteDb.prepare(
          `INSERT INTO change_request_attachments
             (change_request_id, field_name, original_filename, stored_filename, mime_type, size_bytes)
           VALUES (?, ?, ?, ?, ?, ?)`
        );

        for (const fItem of group.files) {
          const saved = savedFiles.find((s) => s.fileIndex === fItem.index);
          if (saved) {
            attachmentStmt.run(
              changeRequestId,
              fItem.category,
              fItem.file.name,
              saved.storedFilename,
              fItem.file.type,
              fItem.file.size
            );
          }
        }
      }

      return processedRequestIds;
    });

    try {
      insertTransaction();
    } catch (dbErr: any) {
      await Promise.allSettled(savedFiles.map((f) => unlink(f.fullPath)));
      throw dbErr;
    }

    return NextResponse.json(
      {
        success: true,
        changeRequestId: processedRequestIds[0],
        changeRequestIds: processedRequestIds,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Erro ao processar solicitação de alteração:', error);
    return NextResponse.json({ success: false, error: 'Erro ao processar solicitação.' }, { status: 500 });
  }
}