import { totvsPool, totvsPoolConnect } from '@/lib/db-totvs';

export interface UpdateDependenteParams {
  codColigada: number;
  chapa: string;
  nroDepend: number;
  username?: string;
  INCIRRF: string;
}

export async function updateDependente(params: UpdateDependenteParams): Promise<number> {
  await totvsPoolConnect;
  const req = totvsPool.request();

  req.input('codColigada', params.codColigada);
  req.input('chapa', params.chapa);
  req.input('nroDepend', params.nroDepend);
  req.input('username', params.username);
  req.input('INCIRRF', params.INCIRRF);
/*
  const sql = `
    UPDATE PFDEPEND
    SET 
      NOME = @nome,
      CPF = @cpf,
      DTNASCIMENTO = @dtNascimento,
      SEXO = @sexo,
      ESTADOCIVIL = @estadoCivil,
      GRAUPARENTESCO = @grauParentesco,
      RECMODIFIEDBY = @username,
      RECMODIFIEDON = GETDATE()
    WHERE CODCOLIGADA = @codColigada
      AND CHAPA = @chapa
      AND NRODEPEND = @nroDepend
  `;
*/
  const sql = `
    UPDATE PFDEPEND
    SET 
      INCIRRF = @INCIRRF,
      RECMODIFIEDBY = @username,
      RECMODIFIEDON = GETDATE()
    WHERE CODCOLIGADA = @codColigada
      AND CHAPA = @chapa
      AND NRODEPEND = @nroDepend
  `;

  const result = await req.query(sql);
  return result.rowsAffected[0] || 0;
}