import { totvsPool, totvsPoolConnect } from '@/lib/db-totvs';

export interface InsertCursoParams {
  codPessoa: number;
  codCurso?: number | null;
  codGrau?: number | string | null;
  outroCurso?: string | null;
  nomeEntidade?: string | null;
  codEntidade?: number | null;
  dtInicio?: string | Date | null;
  dtTermino?: string | Date | null;
  mesInicio?: number | null;
  anoInicio?: number | null;
  mesTermino?: number | null;
  anoTermino?: number | null;
  andamento?: number | string | null;
  podeComprovar?: number | string | null;
  infAdic?: string | null;
  username: string;
}

export async function insertCurso(params: InsertCursoParams): Promise<number> {
  await totvsPoolConnect;
  const req = totvsPool.request();

  req.input('codPessoa', params.codPessoa);
  req.input('codCurso', params.codCurso ?? null);
  req.input('codGrau', params.codGrau ?? null);
  req.input('outroCurso', params.outroCurso ?? null);
  req.input('nomeEntidade', params.nomeEntidade ?? null);
  req.input('codEntidade', params.codEntidade ?? null);
  req.input('dtInicio', params.dtInicio ?? null);
  req.input('dtTermino', params.dtTermino ?? null);
  req.input('mesInicio', params.mesInicio ?? null);
  req.input('anoInicio', params.anoInicio ?? null);
  req.input('mesTermino', params.mesTermino ?? null);
  req.input('anoTermino', params.anoTermino ?? null);
  req.input('andamento', params.andamento ?? null);
  req.input('podeComprovar', params.podeComprovar ?? null);
  req.input('infAdic', params.infAdic ?? null);
  req.input('username', params.username);

  const sql = `
    INSERT INTO VFORMACAOACAD (
      CODPESSOA,
      CODFORMACAD,
      CODCURSO,
      CODGRAU,
      OUTROCURSO,
      NOMEENTIDADE,
      CODENTIDADE,
      DTINICIO,
      DTTERMINO,
      MESINICIO,
      ANOINICIO,
      MESTERMINO,
      ANOTERMINO,
      ANDAMENTO,
      PODECOMPROVAR,
      INFADIC,
      RECCREATEDBY,
      RECCREATEDON,
      RECMODIFIEDBY,
      RECMODIFIEDON
    )
    SELECT 
      @codPessoa,
      (
        SELECT ISNULL(MAX(Z.CODFORMACAD), 0) + 1
        FROM VFORMACAOACAD Z
        WHERE Z.CODPESSOA = @codPessoa
      ),
      @codCurso,
      @codGrau,
      @outroCurso,
      @nomeEntidade,
      @codEntidade,
      @dtInicio,
      @dtTermino,
      @mesInicio,
      @anoInicio,
      @mesTermino,
      @anoTermino,
      @andamento,
      @podeComprovar,
      @infAdic,
      @username,
      GETDATE(),
      @username,
      GETDATE();
  `;

  const result = await req.query(sql);
  return result.rowsAffected[0] || 0;
}