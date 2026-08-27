'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Employee {
  DESCRICAO: string;
  CODEQUIPE: string;
  NOME: string;
  CPF: string;
  EMAIL: string;
}

interface FieldDetail {
  field_name: string;
  old_value?: string | null;
  new_value?: string | null;
  status?: string;
}

interface ChangeSummary {
  employee_cpf: string;
  request_id: number;
  status: string;
  submitted_at: string;
  approved_count: number;
  pending_count: number;
  rejected_count: number;
  attachments_count: number;
  fields?: FieldDetail[];
  changed_fields?: string[];
}

interface ApprovedMigrationItem {
  employee: Employee;
  summary: ChangeSummary;
}

function sanitizeCpf(cpf: string) {
  if (!cpf) return '';
  return String(cpf).replace(/\D/g, '');
}

function formatCpf(cpf: string) {
  const clean = sanitizeCpf(cpf);
  if (!clean || clean.length !== 11) return cpf || '--';
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '');
}

function parseJsonSafe(val?: string | null) {
  if (!val) return null;
  try {
    const trimmed = String(val).trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed);
    }
  } catch {}
  return null;
}

// 🗺️ Mapeia o campo para a rota de seção e extrai o payload
function mapFieldToSectionAndPayload(field: FieldDetail): { section: string; payload: any } {
  const nameUpper = (field.field_name || '').toUpperCase().trim();
  const parsedNew = parseJsonSafe(field.new_value);

  if (nameUpper.includes('DEPENDENTE')) {
    return { section: 'dependentes', payload: parsedNew || { NOME: field.new_value } };
  }
  if (nameUpper.includes('FORMACAO') || nameUpper.includes('ACADEMICA')) {
    return { section: 'formacao-academica', payload: parsedNew || { CURSO_NOME: field.new_value } };
  }
  if (
    nameUpper.includes('ENDERECO') ||
    nameUpper.includes('ENDEREÇO') ||
    ['RUA', 'NUMERO', 'COMPLEMENTO', 'BAIRRO', 'CIDADE', 'ESTADO', 'CEP', 'PAIS'].includes(nameUpper)
  ) {
    return { section: 'endereco', payload: parsedNew || { [field.field_name]: field.new_value } };
  }
  if (nameUpper.includes('CONTATO') || ['TELEFONE1', 'TELEFONE2', 'EMAIL'].includes(nameUpper)) {
    return { section: 'contato', payload: parsedNew || { [field.field_name]: field.new_value } };
  }
  if (nameUpper.includes('IDENTIFICACAO') || nameUpper === 'NOME') {
    return { section: 'identificacao', payload: parsedNew || { NOME: field.new_value } };
  }
  if (nameUpper.includes('ESTADO CIVIL') || nameUpper === 'ESTADOCIVIL') {
    return { section: 'estado-civil', payload: parsedNew || { ESTADOCIVIL: field.new_value } };
  }
  if (nameUpper.includes('ESCOLARIDADE') || nameUpper === 'GRAUINSTRUCAO') {
    return { section: 'escolaridade', payload: parsedNew || { GRAUINSTRUCAO: field.new_value } };
  }

  const fallbackSection = nameUpper.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return { section: fallbackSection || 'geral', payload: parsedNew || { [field.field_name]: field.new_value } };
}

function renderFieldDetail(
  field: FieldDetail,
  idx: number,
  requestId: number,
  employeeCpf: string,
  onCancelField: (requestId: number, fieldName: string, cpf: string) => void,
  isFieldCanceling: boolean
) {
  const parsedNew = parseJsonSafe(field.new_value);
  const parsedOld = parseJsonSafe(field.old_value);

  const isJson = parsedNew !== null || parsedOld !== null;
  const fieldNameUpper = field.field_name.toUpperCase();

  if (isJson) {
    const arrayNew = Array.isArray(parsedNew) ? parsedNew : parsedNew ? [parsedNew] : [];
    const arrayOld = Array.isArray(parsedOld) ? parsedOld : parsedOld ? [parsedOld] : [];

    if (fieldNameUpper === 'DEPENDENTES' || fieldNameUpper.includes('DEPENDENTE')) {
      const oldMap = new Map<string, any>();
      arrayOld.forEach((o: any) => {
        const k = String(o.ID || o.CPF || o.NOME || o.nome || '').replace(/\D/g, '').toLowerCase().trim();
        if (k) oldMap.set(k, o);
      });

      const changedOrNew = arrayNew.filter((n: any) => {
        const k = String(n.ID || n.CPF || n.NOME || n.nome || '').replace(/\D/g, '').toLowerCase().trim();
        const o = oldMap.get(k);
        if (!o) return true;

        return (
          String(o.NOME || o.nome || '').trim() !== String(n.NOME || n.nome || '').trim() ||
          String(o.GRAUPARENTESCO || o.grau_parentesco || '').trim() !== String(n.GRAUPARENTESCO || n.grau_parentesco || '').trim() ||
          String(o.GRAUPARENTESCODESC || o.grau_parentesco_desc || '').trim() !== String(n.GRAUPARENTESCODESC || n.grau_parentesco_desc || '').trim() ||
          String(o.CPF || o.cpf || '').replace(/\D/g, '') !== String(n.CPF || n.cpf || '').replace(/\D/g, '') ||
          String(o.INCIRRF ?? '').trim() !== String(n.INCIRRF ?? '').trim()
        );
      });

      const itemsToRender = changedOrNew.length > 0 ? changedOrNew : arrayNew;

      return (
        <div key={idx} className="space-y-2 my-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-amber-900 block font-mono">
              {field.field_name}
            </span>
            <button
              type="button"
              disabled={isFieldCanceling}
              onClick={() => onCancelField(requestId, field.field_name, employeeCpf)}
              className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 border border-rose-200 rounded text-[10px] font-bold transition cursor-pointer"
            >
              {isFieldCanceling ? 'Desfazendo...' : 'Desfazer Campo'}
            </button>
          </div>

          {itemsToRender.map((dep: any, dIdx: number) => {
            const k = String(dep.ID || dep.CPF || dep.NOME || dep.nome || '').replace(/\D/g, '').toLowerCase().trim();
            const oldDep = oldMap.get(k);
            const isNew = !oldDep;

            const name = dep.NOME || dep.nome || 'Sem nome';
            const parentesco = dep.GRAUPARENTESCODESC || dep.GRAUPARENTESCO || dep.grau_parentesco || '--';
            const oldParentesco = oldDep ? (oldDep.GRAUPARENTESCODESC || oldDep.GRAUPARENTESCO || oldDep.grau_parentesco || '--') : null;

            const rawCpf = String(dep.CPF || dep.cpf || '').replace(/\D/g, '');
            const oldRawCpf = oldDep ? String(oldDep.CPF || oldDep.cpf || '').replace(/\D/g, '') : null;

            const newIrrf = dep.INCIRRF === 1 || dep.INCIRRF === '1' || dep.INCIRRF === true ? 'SIM' : 'NÃO';
            const oldIrrf = oldDep
              ? (oldDep.INCIRRF === 1 || oldDep.INCIRRF === '1' || oldDep.INCIRRF === true ? 'SIM' : 'NÃO')
              : null;

            return (
              <div key={dIdx} className="p-2.5 bg-white rounded-xl border border-amber-200/80 shadow-2xs space-y-1.5 text-xs">
                <div className="flex items-center justify-between border-b border-amber-100 pb-1">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    👤 {name}
                  </span>
                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded ${
                    isNew ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-sky-100 text-sky-800 border border-sky-300'
                  }`}>
                    {isNew ? 'NOVO DEPENDENTE' : 'ALTERADO'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400">Parentesco: </span>
                    {oldParentesco && oldParentesco !== parentesco ? (
                      <span>
                        <span className="line-through text-slate-400">{oldParentesco}</span> → <strong className="text-slate-800">{parentesco}</strong>
                      </span>
                    ) : (
                      <strong className="text-slate-800">{parentesco}</strong>
                    )}
                  </div>

                  <div>
                    <span className="text-slate-400">CPF: </span>
                    {oldRawCpf && oldRawCpf !== rawCpf ? (
                      <span>
                        <span className="line-through text-slate-400 font-mono">{formatCpf(oldRawCpf)}</span> → <strong className="text-slate-800 font-mono">{formatCpf(rawCpf)}</strong>
                      </span>
                    ) : (
                      <strong className="text-slate-800 font-mono">{formatCpf(rawCpf)}</strong>
                    )}
                  </div>
                </div>

                <div className="text-[11px] pt-1 border-t border-amber-100 flex items-center gap-2">
                  <span className="text-slate-500 font-medium">Incide IRPF:</span>
                  {oldIrrf && oldIrrf !== newIrrf ? (
                    <span className="flex items-center gap-1">
                      <span className="line-through text-slate-400 font-medium">{oldIrrf}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">{newIrrf}</span>
                    </span>
                  ) : (
                    <span className="font-semibold text-slate-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">{newIrrf}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (fieldNameUpper === 'FORMACAO_ACADEMICA' || fieldNameUpper.includes('FORMACAO')) {
      const oldMap = new Map<string, any>();
      arrayOld.forEach((o: any) => {
        const k = String(o.ID || o.CURSO_NOME || o.curso_nome || o.NOME || '').toLowerCase().trim();
        if (k) oldMap.set(k, o);
      });

      return (
        <div key={idx} className="space-y-2 my-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-amber-900 block font-mono">
              {field.field_name}
            </span>
            <button
              type="button"
              disabled={isFieldCanceling}
              onClick={() => onCancelField(requestId, field.field_name, employeeCpf)}
              className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 border border-rose-200 rounded text-[10px] font-bold transition cursor-pointer"
            >
              {isFieldCanceling ? 'Cancelando...' : 'Cancelar Campo'}
            </button>
          </div>

          {arrayNew.map((cursoItem: any, cIdx: number) => {
            const k = String(cursoItem.ID || cursoItem.CURSO_NOME || cursoItem.curso_nome || cursoItem.NOME || '').toLowerCase().trim();
            const oldCurso = oldMap.get(k);
            const isNew = !oldCurso;

            const cursoNome = cursoItem.CURSO_NOME || cursoItem.curso_nome || cursoItem.NOME || 'Curso';
            const inst = cursoItem.INSTITUICAO || cursoItem.instituicao || '--';
            const nivel = cursoItem.NIVEL || cursoItem.nivel || '--';
            const situacao = cursoItem.SITUACAO || cursoItem.situacao || '--';

            return (
              <div key={cIdx} className="p-2.5 bg-white rounded-xl border border-amber-200/80 shadow-2xs space-y-1.5 text-xs">
                <div className="flex items-center justify-between border-b border-amber-100 pb-1">
                  <span className="font-bold text-slate-800">🎓 {cursoNome}</span>
                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded ${
                    isNew ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-sky-100 text-sky-800 border border-sky-300'
                  }`}>
                    {isNew ? 'NOVA FORMAÇÃO' : 'ALTERADO'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-600">
                  <div><span className="text-slate-400">Instituição: </span><strong className="text-slate-800">{inst}</strong></div>
                  <div><span className="text-slate-400">Nível: </span><strong className="text-slate-800">{nivel}</strong></div>
                  <div><span className="text-slate-400">Situação: </span><strong className="text-slate-800">{situacao}</strong></div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
  }

  return (
    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-2 bg-white/90 rounded-xl border border-amber-200/60 text-[11px] gap-2 shadow-2xs">
      <span className="font-medium text-slate-700 font-mono">
        {field.field_name}
      </span>

      <div className="flex items-center gap-2 text-[10px]">
        {field.old_value && (
          <span className="line-through text-slate-400 font-mono">
            {field.old_value}
          </span>
        )}
        {field.old_value && <span className="text-slate-400">→</span>}
        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-md font-semibold font-mono">
          {field.new_value || 'Sem valor'}
        </span>

        <button
          type="button"
          disabled={isFieldCanceling}
          onClick={() => onCancelField(requestId, field.field_name, employeeCpf)}
          className="ml-1 px-1.5 py-0.5 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 border border-rose-200 rounded text-[9px] font-bold transition cursor-pointer shrink-0"
          title="Voltar apenas este campo para pendente"
        >
          {isFieldCanceling ? '...' : 'Desfazer'}
        </button>
      </div>
    </div>
  );
}

export default function MigrationData() {
  const router = useRouter();
  const [items, setItems] = useState<ApprovedMigrationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [migratingCpfs, setMigratingCpfs] = useState<Set<string>>(new Set());
  const [cancelingKeys, setCancelingKeys] = useState<Set<string>>(new Set());
  const [isMigratingAll, setIsMigratingAll] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [expandedCpfs, setExpandedCpfs] = useState<Set<string>>(new Set());

  const toggleExpand = (cpf: string) => {
    setExpandedCpfs((prev) => {
      const next = new Set(prev);
      if (next.has(cpf)) {
        next.delete(cpf);
      } else {
        next.add(cpf);
      }
      return next;
    });
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [employeesRes, summaryRes] = await Promise.all([
        fetch('/api/allemployees'),
        fetch('/api/migratesummary'),
      ]);
      const employeesData = await employeesRes.json();
      const summaryData = await summaryRes.json();

      if (!employeesData.success) throw new Error('Falha ao carregar funcionários.');
      if (!summaryData.success) throw new Error('Falha ao carregar resumo de migração.');

      const empMap = new Map<string, Employee>();
      employeesData.employees.forEach((e: Employee) => {
        empMap.set(sanitizeCpf(e.CPF), e);
      });

      const approvedList: ApprovedMigrationItem[] = [];
      summaryData.summaries.forEach((s: ChangeSummary) => {
        if (s.approved_count > 0) {
          const cleanCpf = sanitizeCpf(s.employee_cpf);
          const emp = empMap.get(cleanCpf);
          if (emp) {
            approvedList.push({ employee: emp, summary: s });
          }
        }
      });

      setItems(approvedList);
    } catch (err: any) {
      setError(err.message || 'Não foi possível conectar às APIs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesName = item.employee.NOME.toLowerCase().includes(search.toLowerCase());
      const matchesCpf = sanitizeCpf(item.employee.CPF).includes(sanitizeCpf(search));
      return matchesName || matchesCpf;
    });
  }, [items, search]);

  const handleMigrateSingle = async (cpf: string, fields: FieldDetail[] = [], requestId?: number) => {
    const cleanCpf = sanitizeCpf(cpf);
    setMigratingCpfs((prev) => new Set(prev).add(cleanCpf));
    setFeedback(null);

    try {
      let migratedCount = 0;
      let lastMessage = '';

      const fieldsToProcess = fields.length > 0 ? fields : [{ field_name: 'endereco', new_value: '' }];

      for (const field of fieldsToProcess) {
        const { section, payload } = mapFieldToSectionAndPayload(field);

        // 🎯 Rota padronizada com subpasta /totvs/
        const res = await fetch(`/api/totvs/migrate/${section}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeCpf: cleanCpf,
            requestId,
            payload,
          }),
        });
        const data = await res.json();

        if (!data.success && !res.ok) {
          throw new Error(data.error || `Falha ao migrar seção "${section}".`);
        }

        migratedCount++;
        lastMessage = data.message || `Seção "${section}" processada com sucesso.`;
      }

      setFeedback({
        type: 'success',
        message: `${migratedCount} campo(s)/seção(ões) processado(s) com sucesso! (${lastMessage})`,
      });

      setItems((prev) => prev.filter((i) => sanitizeCpf(i.employee.CPF) !== cleanCpf));
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao comunicar com a API de migração.' });
    } finally {
      setMigratingCpfs((prev) => {
        const next = new Set(prev);
        next.delete(cleanCpf);
        return next;
      });
    }
  };

  const handleCancelApproval = async (requestId: number, fieldName?: string, cpf?: string) => {
    const cancelKey = fieldName ? `${requestId}_${fieldName}` : String(requestId);
    setCancelingKeys((prev) => new Set(prev).add(cancelKey));
    setFeedback(null);

    const cleanCpf = cpf ? sanitizeCpf(cpf) : '';
    const normalizeStr = (str: string) =>
      (str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\s_]/g, '');

    const cleanFieldName = fieldName ? fieldName.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';

    const fieldVariations = fieldName
      ? Array.from(
          new Set([
            fieldName,
            cleanFieldName,
            fieldName.toUpperCase(),
            cleanFieldName.toUpperCase(),
            fieldName.toLowerCase(),
            cleanFieldName.toLowerCase(),
            fieldName.replace(/\s+/g, '_'),
            fieldName.replace(/_/g, ' '),
            cleanFieldName.replace(/\s+/g, '_'),
          ])
        )
      : [];

    const payload = {
      requestId,
      request_id: requestId,
      employeeCpf: cleanCpf,
      employee_cpf: cleanCpf,
      cpf: cleanCpf,
      fieldName: fieldName || null,
      field_name: fieldName || null,
      fieldVariations,
      status: 'PENDING',
    };

    try {
      const res = await fetch('/api/change-request/returntopending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok && data.success !== false) {
        setFeedback({
          type: 'success',
          message: fieldName
            ? `Aprovação do campo "${fieldName}" cancelada com sucesso! Retornado para pendente.`
            : 'Aprovação de todos os campos cancelada com sucesso! Retornados para pendente.',
        });

        setItems((prevItems) => {
          return prevItems
            .map((item) => {
              const itemCpf = sanitizeCpf(item.employee.CPF);
              const matchesTarget = cleanCpf ? itemCpf === cleanCpf : item.summary.request_id === requestId;

              if (!matchesTarget) return item;

              if (fieldName) {
                const targetNorm = normalizeStr(fieldName);
                const updatedFields = (item.summary.fields || []).filter(
                  (f) => normalizeStr(f.field_name) !== targetNorm
                );

                if (updatedFields.length === 0) return null;

                return {
                  ...item,
                  summary: {
                    ...item.summary,
                    approved_count: updatedFields.length,
                    fields: updatedFields,
                  },
                };
              } else {
                return null;
              }
            })
            .filter(Boolean) as ApprovedMigrationItem[];
        });

        await fetchData();
      } else {
        throw new Error(data.error || data.message || `Erro no servidor (Status: ${res.status})`);
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: `Falha ao cancelar aprovação: ${err.message}`,
      });
    } finally {
      setCancelingKeys((prev) => {
        const next = new Set(prev);
        next.delete(cancelKey);
        return next;
      });
    }
  };

  const handleMigrateAll = async () => {
    if (filteredItems.length === 0) return;

    setIsMigratingAll(true);
    setFeedback(null);

    try {
      let totalMigrated = 0;

      for (const item of filteredItems) {
        const cleanCpf = sanitizeCpf(item.employee.CPF);
        const fields = item.summary.fields || [];

        for (const field of fields) {
          const { section, payload } = mapFieldToSectionAndPayload(field);

          // 🎯 Rota padronizada com subpasta /totvs/
          const res = await fetch(`/api/totvs/migrate/${section}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeCpf: cleanCpf,
              requestId: item.summary.request_id,
              payload,
            }),
          });

          const data = await res.json();
          if (!data.success && !res.ok) {
            throw new Error(data.error || `Falha ao migrar a seção "${section}" para o CPF ${cleanCpf}.`);
          }
        }
        totalMigrated++;
      }

      setFeedback({
        type: 'success',
        message: `Migração concluída com sucesso para ${totalMigrated} funcionário(s)!`,
      });
      await fetchData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: `Falha na migração em lote: ${err.message}` });
    } finally {
      setIsMigratingAll(false);
    }
  };

  return (
    <div className="w-full shrink-0 mx-auto bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Migração de Dados para o TOTVS</h2>
          <p className="text-xs text-slate-500">
            Apenas alterações de campos aprovadas aguardando sincronização com o TOTVS.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-mono">
            {loading ? '...' : `${filteredItems.length} funcionário(s)`}
          </span>

          {filteredItems.length > 0 && (
            <button
              type="button"
              onClick={handleMigrateAll}
              disabled={isMigratingAll || migratingCpfs.size > 0 || cancelingKeys.size > 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center gap-2 cursor-pointer"
            >
              {isMigratingAll ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Migrando todos...
                </>
              ) : (
                `Migrar Todos para TOTVS (${filteredItems.length})`
              )}
            </button>
          )}
        </div>
      </div>

      {/* Alertas de Feedback */}
      {feedback && (
        <div
          className={`mb-4 p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-bold hover:opacity-75 cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Busca */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou CPF..."
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
          />
        </div>
      </div>

      {/* Estados de loading / erro */}
      {loading && (
        <p className="text-slate-500 text-sm animate-pulse py-4 text-center">
          Carregando campos aprovados para migração...
        </p>
      )}

      {error && <p className="text-rose-600 text-sm font-medium py-2">{error}</p>}

      {/* Lista de cards */}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto pr-1">
          {filteredItems.length === 0 && (
            <p className="text-slate-400 text-sm italic col-span-2 py-6 text-center">
              Nenhum campo aprovado pendente de migração.
            </p>
          )}

          {filteredItems.map(({ employee: emp, summary }) => {
            const cleanCpf = sanitizeCpf(emp.CPF);
            const cardKey = `${cleanCpf}-${summary.request_id}`;
            const isMigratingThis = migratingCpfs.has(cleanCpf);
            const isCancelingCard = cancelingKeys.has(String(summary.request_id));
            const isExpanded = expandedCpfs.has(cleanCpf);
            const approvedFields = summary.fields || [];

            return (
              <div
                key={cardKey}
                className="w-full p-4 bg-slate-50/60 hover:bg-slate-50 border border-slate-200/80 hover:border-emerald-300 rounded-xl transition shadow-2xs hover:shadow-xs flex flex-col justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-sky-600 flex items-center justify-center font-bold text-white text-xs shadow-xs">
                    {initials(emp.NOME)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900 truncate">{emp.NOME}</p>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        #{summary.request_id}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 truncate">{emp.EMAIL}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      CPF: {formatCpf(emp.CPF)}
                    </p>

                    <div className="flex items-center flex-wrap gap-1.5 mt-2">
                      <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-semibold">
                        {emp.DESCRICAO} · Equipe {emp.CODEQUIPE}
                      </span>

                      <span className="px-2 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-[10px] font-semibold">
                        {summary.approved_count}{' '}
                        {summary.approved_count === 1 ? 'campo aprovado' : 'campos aprovados'}
                      </span>

                      {summary.attachments_count > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-semibold">
                          Anexo ({summary.attachments_count})
                        </span>
                      )}
                    </div>

                    {/* Bloco expansível de Campos em Alteração Aprovados */}
                    <div className="mt-2.5 bg-amber-50/60 border border-amber-200/60 rounded-xl overflow-hidden transition-all">
                      <button
                        type="button"
                        onClick={() => toggleExpand(cleanCpf)}
                        className="w-full p-2.5 flex items-center justify-between text-left hover:bg-amber-100/50 transition cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <span className="font-semibold text-amber-900 text-[11px] shrink-0">
                            Aprovados p/ migração ({approvedFields.length}):
                          </span>
                          <span className="font-mono text-slate-800 font-medium text-[11px] truncate">
                            {approvedFields.map((f) => f.field_name).join(', ')}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 text-amber-900">
                          <span className="text-[10px] font-semibold hidden sm:inline">
                            {isExpanded ? 'Ocultar' : 'Detalhes'}
                          </span>
                          <svg
                            className={`w-4 h-4 transform transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </button>

                      {/* Exibição detalhada de cada campo aprovado */}
                      {isExpanded && (
                        <div className="px-2.5 pb-2.5 pt-1 border-t border-amber-200/40 bg-amber-50/30">
                          <div className="space-y-1.5 mt-1">
                            {approvedFields.map((field, idx) => {
                              const isFieldCanceling = cancelingKeys.has(
                                `${summary.request_id}_${field.field_name}`
                              );
                              return renderFieldDetail(
                                field,
                                idx,
                                summary.request_id,
                                emp.CPF,
                                (reqId, fName, cpf) =>
                                  handleCancelApproval(reqId, fName, cpf),
                                isFieldCanceling
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60 shrink-0">
                  <button
                    type="button"
                    disabled={isMigratingThis || isCancelingCard || isMigratingAll}
                    onClick={() => handleCancelApproval(summary.request_id, undefined, emp.CPF)}
                    className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                    title="Cancelar aprovação de todos os campos deste card"
                  >
                    {isCancelingCard ? (
                      <>
                        <span className="w-2.5 h-2.5 border-2 border-amber-800/30 border-t-amber-800 rounded-full animate-spin" />
                        Cancelando Tudo...
                      </>
                    ) : (
                      'Cancelar Tudo'
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={isMigratingThis || isCancelingCard || isMigratingAll}
                    onClick={() =>
                      handleMigrateSingle(emp.CPF, approvedFields, summary.request_id)
                    }
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {isMigratingThis ? (
                      <>
                        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Migrando para TOTVS...
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>Migrar ({summary.approved_count})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}