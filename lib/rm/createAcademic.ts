import { totvsPool, getTotvsConnection } from '@/lib/db-totvs';

/**
 * Cadastra um novo Curso na tabela VCURSOACAD e retorna o CODCURSO gerado.
 */
export async function createCursoCatalogo(nome: string, username: string): Promise<number> {
  await getTotvsConnection();
  const req = totvsPool.request();

  req.input('nome', nome);
  req.input('username', username);

  const sql = `
    DECLARE @OutputTable TABLE (CODCURSO INT);

    INSERT INTO VCURSOACAD (
      CODCURSO,
      NOME,
      RECCREATEDBY,
      RECCREATEDON,
      RECMODIFIEDBY,
      RECMODIFIEDON
    )
    OUTPUT INSERTED.CODCURSO INTO @OutputTable
    SELECT
      (SELECT ISNULL(MAX(TRY_CAST(Z.CODCURSO AS INT)), 0) + 1 FROM VCURSOACAD Z),
      @nome,
      @username,
      GETDATE(),
      @username,
      GETDATE();

    SELECT CODCURSO FROM @OutputTable;
  `;

  const result = await req.query(sql);
  const novoCodigo = result.recordset?.[0]?.CODCURSO;

  if (!novoCodigo) {
    throw new Error('Não foi possível obter o código do curso recém-criado.');
  }

  return Number(novoCodigo);
}

/**
 * Cadastra uma nova Entidade na tabela VENTIDADES e retorna o CODENTIDADE gerado.
 */
export async function createEntidadeCatalogo(nome: string, username: string): Promise<string> {
  await getTotvsConnection();
  const req = totvsPool.request();

  req.input('nome', nome);
  req.input('username', username);

  const sql = `
    DECLARE @OutputTable TABLE (CODENTIDADE VARCHAR(20));

    INSERT INTO VENTIDADES (
      CODENTIDADE,
      NOMEFANTASIA,
      RAZAOSOCIAL,
      RECCREATEDBY,
      RECCREATEDON,
      RECMODIFIEDBY,
      RECMODIFIEDON
    )
    OUTPUT INSERTED.CODENTIDADE INTO @OutputTable
    SELECT
      CAST((SELECT ISNULL(MAX(TRY_CAST(Z.CODENTIDADE AS INT)), 0) + 1 FROM VENTIDADES Z) AS VARCHAR(20)),
      @nome,
      @nome,
      @username,
      GETDATE(),
      @username,
      GETDATE();

    SELECT CODENTIDADE FROM @OutputTable;
  `;

  const result = await req.query(sql);
  const novoCodigo = result.recordset?.[0]?.CODENTIDADE;

  if (!novoCodigo) {
    throw new Error('Não foi possível obter o código da entidade recém-criada.');
  }

  return String(novoCodigo);
}