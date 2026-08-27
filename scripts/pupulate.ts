import { sqliteDb, initAppDb } from '../lib/db-app';

initAppDb();

// Limpa dados de teste anteriores (só para rodar o script repetidamente)
sqliteDb.exec(`
  DELETE FROM change_request_attachments;
  DELETE FROM change_request_field_history;
  DELETE FROM change_request_fields;
  DELETE FROM change_requests;
`);

// 1. Cria uma solicitação
const insertRequest = sqliteDb.prepare(`
  INSERT INTO change_requests (employee_cpf, employee_name)
  VALUES (?, ?)
`);
const requestInfo = insertRequest.run('14182829794', 'ANDRE AUGUSTO RAMOS RODRIGUES');
const requestId = requestInfo.lastInsertRowid;

// 2. Adiciona dois campos alterados
const insertField = sqliteDb.prepare(`
  INSERT INTO change_request_fields (change_request_id, field_name, old_value, new_value)
  VALUES (?, ?, ?, ?)
`);
const emailFieldInfo = insertField.run(requestId, 'EMAIL', 'andreaugusto@old.com', 'andreaugusto@gmail.com');
insertField.run(requestId, 'TELEFONE', '21999990000', '21988887777');

// 3. Simula o RH rejeitando o campo de e-mail
const emailFieldId = emailFieldInfo.lastInsertRowid;

sqliteDb.prepare(`
  INSERT INTO change_request_field_history (field_id, new_value, status, review_notes, reviewed_by)
  VALUES (?, ?, 'rejected', ?, ?)
`).run(emailFieldId, 'andreaugusto@gmail.com', 'Anexo ilegível, envie novo comprovante', 'rh_maria');

sqliteDb.prepare(`
  UPDATE change_request_fields
  SET status = 'rejected', review_notes = ?
  WHERE id = ?
`).run('Anexo ilegível, envie novo comprovante', emailFieldId);

// 4. Consulta tudo de volta, como o RH veria na tela
const requests = sqliteDb.prepare(`SELECT * FROM change_requests`).all();
const fields = sqliteDb.prepare(`SELECT * FROM change_request_fields`).all();
const history = sqliteDb.prepare(`SELECT * FROM change_request_field_history`).all();

console.log('--- change_requests ---');
console.log(requests);
console.log('--- change_request_fields ---');
console.log(fields);
console.log('--- change_request_field_history ---');
console.log(history);