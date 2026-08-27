// scripts/migrate-add-field-name.ts
import { sqliteDb, initAppDb } from '@/lib/db-app';

initAppDb();

try {
  sqliteDb.exec(`ALTER TABLE change_request_attachments ADD COLUMN field_name TEXT;`);
  console.log('✅ Coluna field_name adicionada com sucesso.');
} catch (err: any) {
  if (err.message.includes('duplicate column name')) {
    console.log('ℹ️ Coluna field_name já existe, nada a fazer.');
  } else {
    throw err;
  }
}