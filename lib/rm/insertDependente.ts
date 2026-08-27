import { totvsPool, totvsPoolConnect } from '@/lib/db-totvs';

export interface InsertDependenteParams {
  codColigada: number;
  chapa: string;
  nome: string;
  cpf?: string | null;
  dtNascimento?: string | Date | null;
  sexo?: string | null;
  estadoCivil?: string | null;
  grauParentesco: string | number;
  username: string;
  INCIRRF: string;
}

export async function insertDependente(params: InsertDependenteParams): Promise<number> {
  await totvsPoolConnect;
  const req = totvsPool.request();

  req.input('codColigada', params.codColigada);
  req.input('chapa', params.chapa);
  req.input('nome', params.nome);
  req.input('cpf', params.cpf ?? null);
  req.input('dtNascimento', params.dtNascimento ?? null);
  req.input('sexo', params.sexo ?? null);
  req.input('estadoCivil', params.estadoCivil ?? null);
  req.input('grauParentesco', params.grauParentesco);
  req.input('username', params.username);
  req.input('INCIRRF', params.INCIRRF);

  const sql = `
    INSERT INTO PFDEPEND (
      CODCOLIGADA,
      CHAPA,
      NRODEPEND,
      NOME,
      CPF,
      DTNASCIMENTO,
      SEXO,
      ESTADOCIVIL,
      GRAUPARENTESCO,
      INCIRRF,
      RECCREATEDBY,
      RECCREATEDON,
      RECMODIFIEDBY,
      RECMODIFIEDON
    )
    SELECT 
      @codColigada,
      @chapa,
      (
        SELECT ISNULL(MAX(Z.NRODEPEND), 0) + 1
        FROM PFDEPEND Z
        WHERE Z.CODCOLIGADA = @codColigada
          AND Z.CHAPA = @chapa
      ),
      @nome,
      @cpf,
      @dtNascimento,
      @sexo,
      @estadoCivil,
      @grauParentesco,
      @username,
      GETDATE(),
      @username,
      @INCIRRF,
      GETDATE();
  `;

  const result = await req.query(sql);
  return result.rowsAffected[0] || 0;
}