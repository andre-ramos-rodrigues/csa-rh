import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { totvsPool, getTotvsConnection } from '@/lib/db-totvs';
import { sqliteDb, initAppDb } from '@/lib/db-app';
import { RH_USERS, FULL_ACCESS_USERS, checkIsRhUser } from '@/lib/constants';
import { updateDependente } from '@/lib/rm/updateDependente';
import { insertCurso } from '@/lib/rm/insertCurso';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'sua-chave-secreta-super-segura-totvs-12345'
);

const RAW_RM_API_BASE = process.env.RM_API_BASE || 'http://portal.csa.com.br:8051/api';

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

/** Converte strings vazias ou apenas com espaços em NULL para evitar erros no SQL Server */
function cleanValue(val: any): string | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  return str === '' ? null : str;
}

/** Converte datas do formato brasileiro (DD/MM/YYYY) para ISO (YYYY-MM-DD) para aceitação no SQL Server */
function parseDateToIso(dateStr: any): string | null {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str) return null;

  // Se já estiver em formato ISO YYYY-MM-DD...
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // Se estiver no formato brasileiro DD/MM/YYYY...
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [day, month, year] = str.split('/');
    return `${year}-${month}-${day}`;
  }

  return str;
}

/** Função para inserção direta de novo dependente na PFDEPEND */
export async function insertDependente(params: InsertDependenteParams): Promise<number> {
  await getTotvsConnection();
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
      @INCIRRF,
      @username,
      GETDATE(),
      @username,
      GETDATE();
  `;

  const result = await req.query(sql);
  return result.rowsAffected[0] || 0;
}

function sanitizeCpf(cpf: string) {
  if (!cpf) return '';
  return String(cpf).replace(/\D/g, '');
}

function formatCpf(cpf: string) {
  const clean = sanitizeCpf(cpf);
  if (!clean || clean.length !== 11) return cpf || '';
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function getProfileUrl(employeeId: string | number): string {
  let base = RAW_RM_API_BASE.trim().replace(/\/+$/, '');
  if (!base.endsWith('/api') && !base.includes('/api/')) {
    base = `${base}/api`;
  }
  return `${base}/rh/v1/persons/${encodeURIComponent(employeeId)}`;
}

function normalizeMaritalState(value: any): string {
  if (!value) return 'S';
  const val = String(value).trim().toUpperCase();

  if (['C', 'D', 'E', 'I', 'O', 'P', 'S', 'V'].includes(val)) return val;

  if (val.includes('DIVORC')) return 'I';
  if (val.includes('DESQUIT')) return 'D';
  if (val.startsWith('C') || val.includes('CASAD')) return 'C';
  if (val.startsWith('S') || val.includes('SOLTEIR')) return 'S';
  if (val.startsWith('V') || val.includes('VIUV')) return 'V';
  if (val.includes('UNI') || val.includes('ESTAVEL') || val.includes('ESTÁVEL')) return 'E';
  if (val.includes('SEPARAD')) return 'P';
  if (val.includes('OUTRO')) return 'O';

  return 'S';
}

function mapPayloadToTotvsSchema(rawPayload: any): Record<string, any> {
  const patchBody: Record<string, any> = {};
  if (!rawPayload || typeof rawPayload !== 'object') return patchBody;

  const keyMap: Record<string, string> = {
    rua: 'street', RUA: 'street', street: 'street',
    numero: 'number', NUMERO: 'number', number: 'number',
    complemento: 'complement', COMPLEMENTO: 'complement', complement: 'complement',
    bairro: 'district', BAIRRO: 'district', district: 'district',
    cidade: 'city', CIDADE: 'city', city: 'city',
    estado: 'state', ESTADO: 'state', state: 'state',
    cep: 'cep', CEP: 'cep',
    pais: 'country', PAIS: 'country', country: 'country',

    email: 'email', EMAIL: 'email', emailpessoal: 'email',
    telefone: 'phoneNumber1', telefone1: 'phoneNumber1', TELEFONE1: 'phoneNumber1', phoneNumber1: 'phoneNumber1',
    telefone2: 'phoneNumber2', TELEFONE2: 'phoneNumber2', celular: 'phoneNumber2', phoneNumber2: 'phoneNumber2',

    nome: 'name', NOME: 'name', name: 'name',
    estadocivil: 'maritalState', ESTADOCIVIL: 'maritalState', estado_civil: 'maritalState', maritalstate: 'maritalState',
    grauinstrucao: 'educationalLevel', GRAUINSTRUCAO: 'educationalLevel', educationallevel: 'educationalLevel',
    dtnascimento: 'birth', birth: 'birth',
    sexo: 'sex', sex: 'sex',
    tiposanguineo: 'bloodType', bloodtype: 'bloodType',

    rg: 'identityNumber', cartidentidade: 'identityNumber', CARTIDENTIDADE: 'identityNumber', identitynumber: 'identityNumber',
    organoemissor: 'identityNumberEmitterAgency', organoide: 'identityNumberEmitterAgency', ORGANOIDE: 'identityNumberEmitterAgency',
    ufidentidade: 'identityNumberEmitterState',
    tituloeleitor: 'electoralCard', TITULOELEITOR: 'electoralCard', electoralcard: 'electoralCard',
    zonaeleitor: 'electoralWard', ZONAELEITORAL: 'electoralWard', electoralward: 'electoralWard',
    secaoeleitor: 'electoralSection', SECAOELEITORAL: 'electoralSection', electoralsection: 'electoralSection',
  };

  for (const [key, val] of Object.entries(rawPayload)) {
    if (val === undefined || val === null) continue;

    const lowerKey = key.toLowerCase();
    const mappedKey = keyMap[lowerKey] || keyMap[key];

    if (mappedKey) {
      if (mappedKey === 'maritalState') {
        patchBody[mappedKey] = normalizeMaritalState(val);
      } else if (mappedKey === 'cep') {
        patchBody[mappedKey] = String(val).replace(/\D/g, '');
      } else {
        patchBody[mappedKey] = val;
      }
    }
  }

  return patchBody;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ section: string }> }
) {
  const { section } = await params;
  const start = Date.now();

  try {
    // -------------------------------------------------------------------------
    // 0. AUTENTICAÇÃO E PERMISSÕES
    // -------------------------------------------------------------------------
    const authToken = request.cookies.get('auth_token')?.value;
    if (!authToken) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado. Token não encontrado.' },
        { status: 401 }
      );
    }

    let userPayload: any = null;
    try {
      const { payload: decodedPayload } = await jwtVerify(authToken, JWT_SECRET);
      userPayload = decodedPayload;
    } catch (err) {
      return NextResponse.json(
        { success: false, error: 'Sessão inválida ou expirada. Faça login novamente.' },
        { status: 401 }
      );
    }

    const currentUsername = userPayload?.usuario ? String(userPayload.usuario).trim().toUpperCase() : '';

    const isFullAccess = FULL_ACCESS_USERS.some(
      (user) => user.toUpperCase() === currentUsername
    );
    const isRhUser =
      RH_USERS?.some((user) => user.toUpperCase() === currentUsername) ||
      (typeof checkIsRhUser === 'function' && checkIsRhUser(currentUsername)) ||
      Boolean(userPayload?.isRh);

    if (!isFullAccess && !isRhUser) {
      console.warn(`⛔ [TOTVS MIGRATE] Acesso negado para o usuário "${currentUsername}".`);
      return NextResponse.json(
        { success: false, error: 'Acesso negado. Apenas o RH ou administradores podem executar esta migração.' },
        { status: 403 }
      );
    }

    // -------------------------------------------------------------------------
    // 1. RECEBIMENTO E SANITIZAÇÃO DO PAYLOAD
    // -------------------------------------------------------------------------
    const body = await request.json();
    const { employeeCpf, codPessoa: bodyCodPessoa, payload, requestId, request_id } = body;

    const cleanCpf = sanitizeCpf(employeeCpf);
    const formattedCpf = formatCpf(cleanCpf);
    const targetRequestId = requestId || request_id;

    if (!cleanCpf && !bodyCodPessoa) {
      return NextResponse.json(
        { success: false, error: 'CPF ou codPessoa do funcionário é obrigatório.' },
        { status: 400 }
      );
    }

    console.log(`\n==================================================`);
    console.log(`🚀 [TOTVS MIGRATE] Migração iniciada por: "${currentUsername}" | Seção: "${section}" | CPF/CodPessoa: ${formattedCpf || bodyCodPessoa}`);

    // -------------------------------------------------------------------------
    // 2. CONSULTA SQL PARA IDENTIFICAR CODPESSOA, CHAPA E CODCOLIGADA
    // -------------------------------------------------------------------------
    await getTotvsConnection();
    const req = totvsPool.request();
    req.input('cleanCpf', cleanCpf);
    req.input('formattedCpf', formattedCpf);
    req.input('codPessoaParam', bodyCodPessoa ? String(bodyCodPessoa).trim() : '');

    const empQueryResult = await req.query(`
      SELECT TOP 1 P.CODIGO AS CODPESSOA, F.CHAPA, F.CODCOLIGADA
      FROM PPESSOA P
      LEFT JOIN PFUNC F ON F.CODPESSOA = P.CODIGO AND F.CODFILIAL IN (1, 4) AND F.CODSITUACAO <> 'D'
      WHERE (P.CPF = @cleanCpf OR P.CPF = @formattedCpf OR P.CODIGO = @codPessoaParam)
    `);

    const employee = empQueryResult.recordset[0];
    if (!employee) {
      console.warn(`⚠️ [TOTVS MIGRATE] Funcionário não encontrado no TOTVS.`);
      return NextResponse.json(
        { success: false, error: 'Funcionário não encontrado no banco TOTVS.' },
        { status: 404 }
      );
    }

    const { CODPESSOA, CHAPA, CODCOLIGADA } = employee;
    let migrationMethod: 'REST_API' | 'DIRECT_SQL' = 'REST_API';
    let updateSuccess = false;
    let patchErrorMessage = '';

    const normalizedSection = String(section).toLowerCase();
    const isDependentesSection = normalizedSection === 'dependentes';
    const isFormacaoSection = ['formacaoacademica', 'formacao_academica', 'academics', 'formacao', 'formacaoAcademica', 'formacao-academica', 'escolaridade'].includes(normalizedSection);

    // -------------------------------------------------------------------------
    // REGRAS DE IDENTIFICAÇÃO DE DEPENDENTE: NOVO vs EXISTENTE
    // -------------------------------------------------------------------------
    const nroDependRaw = payload?.nroDepend ?? payload?.NRODEPEND ?? payload?.nrodepend;
    const nroDependNum = Number(nroDependRaw);

    const isExplicitlyNew =
      payload?.isExisting === false ||
      payload?.isNew === true ||
      payload?.type === 'NEW' ||
      payload?.isOld === false ||
      payload?.target_id === 'NEW';

    const isExplicitlyOld =
      payload?.isExisting === true ||
      payload?.isOld === true ||
      payload?.type === 'OLD' ||
      payload?.target_id === 'OLD';

    const isOldDependent = !isExplicitlyNew && (
      isExplicitlyOld ||
      (!isNaN(nroDependNum) && nroDependNum > 0)
    );

    // -------------------------------------------------------------------------
    // 3 e 4. EXECUÇÃO VIA REST API (PATCH) - APENAS SE NÃO FOR DEPENDENTE OU FORMAÇÃO ACADÊMICA
    // -------------------------------------------------------------------------
    if (!isDependentesSection && !isFormacaoSection) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (userPayload?.totvsBasic) {
        headers['Authorization'] = `Basic ${userPayload.totvsBasic}`;
      } else if (userPayload?.totvsToken) {
        headers['Authorization'] = `Bearer ${userPayload.totvsToken}`;
      } else {
        const envUser = process.env.TOTVS_USER || process.env.RM_USER || '';
        const envPass = process.env.TOTVS_PASS || process.env.TOTVS_PASSWORD || process.env.RM_PASS || '';

        if (envUser && envPass) {
          const basicAuth = Buffer.from(`${envUser}:${envPass}`).toString('base64');
          headers['Authorization'] = `Basic ${basicAuth}`;
        }
      }

      const patchBody = mapPayloadToTotvsSchema(payload);
      const hasRestFields = Object.keys(patchBody).length > 0;

      if (hasRestFields && headers['Authorization']) {
        try {
          const totvsUrl = getProfileUrl(CODPESSOA);
          console.log(`📡 [TOTVS MIGRATE] TENTANDO PATCH REST API: ${totvsUrl}`);

          const response = await fetch(totvsUrl, {
            method: 'PATCH',
            headers,
            body: JSON.stringify(patchBody),
            cache: 'no-store',
          });

          if (response.ok) {
            console.log(`✅ [TOTVS MIGRATE] Atualizado com sucesso via REST API.`);
            updateSuccess = true;
          } else {
            patchErrorMessage = await response.text();
            console.warn(`❌ [TOTVS MIGRATE] REST API rejeitou com HTTP ${response.status}: ${patchErrorMessage}`);
          }
        } catch (patchErr: any) {
          patchErrorMessage = patchErr.message || String(patchErr);
          console.warn(`⚠️ [TOTVS MIGRATE] Erro na requisição HTTP PATCH:`, patchErrorMessage);
        }
      } else {
        console.warn(`⚠️ [TOTVS MIGRATE] Cabeçalhos de Autorização ausentes ou sem campos para o PATCH.`);
      }
    }

    // -------------------------------------------------------------------------
    // 5. ESCRITA DIRETA VIA SQL SERVER - DEPENDENTES (NOVOS E ANTIGOS)
    // -------------------------------------------------------------------------
    if (isDependentesSection && !isOldDependent) { // NOVO DEPENDENTE
      migrationMethod = 'DIRECT_SQL';
      console.log('📡 [TOTVS MIGRATE] Processando NOVO dependente via DIRECT SQL...');

      if (!CODCOLIGADA || !CHAPA) {
        patchErrorMessage = 'Dados insuficientes para inserção direta de dependente (CODCOLIGADA ou CHAPA ausente).';
        console.warn(`❌ [TOTVS MIGRATE] ${patchErrorMessage}`);
      } else {
        try {
          const rawIrrf = payload?.INCIRRF ?? payload?.incIRRF ?? payload?.INCIRPF ?? payload?.incIRPF;
          const incIrrfValue = (rawIrrf === 1 || rawIrrf === '1' || rawIrrf === true || rawIrrf === 'true') ? '1' : '0';

          const rawCpf = sanitizeCpf(payload?.cpf ?? payload?.CPF ?? '');
          const cpfValue = rawCpf.length > 0 ? rawCpf : null;
          const sexoValue = cleanValue(payload?.sexo ?? payload?.SEXO ?? payload?.sex);
          const dtNascValue = parseDateToIso(payload?.dtNascimento ?? payload?.DTNASCIMENTO ?? payload?.DATANASCIMENTO ?? payload?.birth);

          const rowsAffected = await insertDependente({
            codColigada: Number(CODCOLIGADA) || 1,
            chapa: String(CHAPA),
            nome: String(payload?.nome ?? payload?.NOME ?? payload?.name ?? '').trim(),
            cpf: cpfValue,
            dtNascimento: dtNascValue,
            sexo: sexoValue,
            estadoCivil: normalizeMaritalState(payload?.estadoCivil ?? payload?.ESTADOCIVIL ?? payload?.maritalState ?? 'S'),
            grauParentesco: payload?.grauParentesco ?? payload?.GRAUPARENTESCO ?? payload?.relationship ?? '1',
            username: currentUsername,
            INCIRRF: incIrrfValue,
          });

          if (rowsAffected > 0) {
            console.log(`✅ [TOTVS MIGRATE] Novo dependente inserido com sucesso na PFDEPEND (${rowsAffected} linha(s) afetada(s)).`);
            updateSuccess = true;
          } else {
            patchErrorMessage = `Falha ao inserir novo dependente no banco TOTVS (0 linhas afetadas).`;
            console.warn(`❌ [TOTVS MIGRATE] ${patchErrorMessage}`);
          }
        } catch (sqlErr: any) {
          patchErrorMessage = sqlErr.message || String(sqlErr);
          console.error(`💥 [TOTVS MIGRATE] Erro ao executar insertDependente:`, sqlErr);
        }
      }
    }

    if (isDependentesSection && isOldDependent) { // DEPENDENTE EXISTENTE (UPDATE)
      migrationMethod = 'DIRECT_SQL';
      console.log('📡 [TOTVS MIGRATE] Processando dependente EXISTENTE via DIRECT SQL...');

      if (!CODCOLIGADA || !CHAPA || isNaN(nroDependNum)) {
        patchErrorMessage = 'Dados insuficientes para atualização direta de dependente (CODCOLIGADA, CHAPA ou NRODEPEND ausente).';
        console.warn(`❌ [TOTVS MIGRATE] ${patchErrorMessage}`);
      } else {
        try {
          const rawIrrf = payload?.INCIRRF ?? payload?.incIRRF ?? payload?.INCIRPF ?? payload?.incIRPF;
          const incIrrfValue = (rawIrrf === 1 || rawIrrf === '1' || rawIrrf === true || rawIrrf === 'true') ? '1' : '0';

          const rowsAffected = await updateDependente({
            codColigada: Number(CODCOLIGADA) || 1,
            chapa: String(CHAPA),
            nroDepend: nroDependNum,
            username: currentUsername,
            INCIRRF: incIrrfValue,
          });

          if (rowsAffected > 0) {
            console.log(`✅ [TOTVS MIGRATE] INCIRPF atualizado com sucesso no TOTVS (${rowsAffected} linha(s) afetada(s)).`);
            updateSuccess = true;
          } else {
            patchErrorMessage = `Nenhum registro encontrado na PFDEPEND para CODCOLIGADA=${CODCOLIGADA}, CHAPA=${CHAPA}, NRODEPEND=${nroDependNum}.`;
            console.warn(`❌ [TOTVS MIGRATE] ${patchErrorMessage}`);
          }
        } catch (sqlErr: any) {
          patchErrorMessage = sqlErr.message || String(sqlErr);
          console.error(`💥 [TOTVS MIGRATE] Erro ao executar updateDependente:`, sqlErr);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 5.1 ESCRITA DIRETA VIA SQL SERVER - FORMAÇÃO ACADÊMICA
    // -------------------------------------------------------------------------
    if (isFormacaoSection) {
      migrationMethod = 'DIRECT_SQL';
      console.log('📡 [TOTVS MIGRATE] Processando FORMAÇÃO ACADÊMICA via DIRECT SQL...');

      if (!CODPESSOA) {
        patchErrorMessage = 'Dados insuficientes para inserção direta de formação acadêmica (CODPESSOA ausente).';
        console.warn(`❌ [TOTVS MIGRATE] ${patchErrorMessage}`);
      } else {
        try {
          // Garante parse se o payload vier como String JSON
          const parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});

          // Extração segura dos códigos
          const codCurso = parsedPayload?.CODCURSO ? Number(parsedPayload.CODCURSO) : (parsedPayload?.codCurso ? Number(parsedPayload.codCurso) : null);
          const codEntidade = parsedPayload?.CODENTIDADE ? Number(parsedPayload.CODENTIDADE) : (parsedPayload?.codEntidade ? Number(parsedPayload.codEntidade) : null);
          const codGrau = parsedPayload?.CODGRAU ?? parsedPayload?.codGrau ?? parsedPayload?.grauInstrucao ?? null;

          // Se tiver código cadastrado, deixa o campo livre como NULL
          const outroCurso = codCurso ? null : cleanValue(parsedPayload?.OUTROCURSO ?? parsedPayload?.outroCurso ?? parsedPayload?.CURSO_NOME);
          const nomeEntidade = codEntidade ? null : cleanValue(parsedPayload?.NOMEENTIDADE ?? parsedPayload?.nomeEntidade ?? parsedPayload?.ENTIDADE_NOMEFANTASIA);

          // Tratamento de datas (evita 1900-01-01)
          const dtInicio = parseDateToIso(parsedPayload?.DATAINICIO ?? parsedPayload?.dtInicio ?? parsedPayload?.DTINICIO);
          const dtTermino = parseDateToIso(parsedPayload?.DATATERMINO ?? parsedPayload?.dtTermino ?? parsedPayload?.DTTERMINO);

          // De-Para do campo SITUACAO para ANDAMENTO
          let andamentoVal = parsedPayload?.ANDAMENTO ?? parsedPayload?.andamento;
          if (andamentoVal === undefined || andamentoVal === null || String(andamentoVal).trim() === '') {
          andamentoVal = 'C';
            }
          
          const rowsAffected = await insertCurso({
            codPessoa: Number(CODPESSOA),
            codCurso,
            codGrau,
            outroCurso,
            nomeEntidade,
            codEntidade,
            dtInicio,
            dtTermino,
            mesInicio: parsedPayload?.MESINICIO ? Number(parsedPayload.MESINICIO) : (parsedPayload?.mesInicio ? Number(parsedPayload.mesInicio) : null),
            anoInicio: parsedPayload?.ANOINICIO ? Number(parsedPayload.ANOINICIO) : (parsedPayload?.anoInicio ? Number(parsedPayload.anoInicio) : null),
            mesTermino: parsedPayload?.MESTERMINO ? Number(parsedPayload.MESTERMINO) : (parsedPayload?.mesTermino ? Number(parsedPayload.mesTermino) : null),
            anoTermino: parsedPayload?.ANOTERMINO ? Number(parsedPayload.ANOTERMINO) : (parsedPayload?.anoTermino ? Number(parsedPayload.anoTermino) : null),
            andamento: andamentoVal || 'C',
            podeComprovar: parsedPayload?.PODECOMPROVAR ?? parsedPayload?.podeComprovar ?? 1,
            infAdic: cleanValue(parsedPayload?.INFADIC ?? parsedPayload?.infAdic),
            username: currentUsername,
          });

          if (rowsAffected > 0) {
            console.log(`✅ [TOTVS MIGRATE] Nova formação acadêmica inserida com sucesso na VFORMACAOACAD (${rowsAffected} linha(s) afetada(s)).`);
            updateSuccess = true;
          } else {
            patchErrorMessage = `Falha ao inserir formação acadêmica no banco TOTVS (0 linhas afetadas).`;
            console.warn(`❌ [TOTVS MIGRATE] ${patchErrorMessage}`);
          }
        } catch (sqlErr: any) {
          patchErrorMessage = sqlErr.message || String(sqlErr);
          console.error(`💥 [TOTVS MIGRATE] Erro ao executar insertCurso:`, sqlErr);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 6. ATUALIZAÇÃO NO BANCO LOCAL SQLITE (STATUS -> MIGRATED)
    // -------------------------------------------------------------------------
    if (updateSuccess) {
      try {
        initAppDb();

        if (targetRequestId) {
          sqliteDb
            .prepare(
              `UPDATE change_request_fields 
               SET status = 'migrated', applied_at = datetime('now') 
               WHERE change_request_id = ?`
            )
            .run(targetRequestId);

          sqliteDb
            .prepare(
              `UPDATE change_requests 
               SET status = 'migrated', applied_at = datetime('now'), updated_at = datetime('now') 
               WHERE id = ?`
            )
            .run(targetRequestId);
        } else {
          sqliteDb
            .prepare(
              `UPDATE change_request_fields 
               SET status = 'migrated', applied_at = datetime('now') 
               WHERE change_request_id IN (
                 SELECT id FROM change_requests WHERE employee_cpf = ? OR employee_cpf = ?
               )`
            )
            .run(cleanCpf, formattedCpf);

          sqliteDb
            .prepare(
              `UPDATE change_requests 
               SET status = 'migrated', applied_at = datetime('now'), updated_at = datetime('now') 
               WHERE (employee_cpf = ? OR employee_cpf = ?)`
            )
            .run(cleanCpf, formattedCpf);
        }
        console.log(`💾 [TOTVS MIGRATE] Status do SQLite local atualizado com sucesso para "migrated".`);
      } catch (dbErr) {
        console.error('⚠️ TOTVS atualizado, porém falhou ao sincronizar SQLite local:', dbErr);
      }
    }

    console.log(`==================================================\n`);

    return NextResponse.json(
      {
        success: updateSuccess,
        method: migrationMethod,
        message: updateSuccess
          ? `Alterações aplicadas no TOTVS (${migrationMethod}) por ${currentUsername}.`
          : `Falha ao aplicar no TOTVS. Detalhe: ${patchErrorMessage}`,
        latency_ms: Date.now() - start,
      },
      { status: updateSuccess ? 200 : 400 }
    );

  } catch (error: any) {
    console.error(`💥 [TOTVS MIGRATE] Erro interno na rota de migração (${section}):`, error);
    return NextResponse.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}