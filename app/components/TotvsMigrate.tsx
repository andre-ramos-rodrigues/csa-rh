'use client';

import { useState, useEffect } from 'react';
import { RH_USERS, FULL_ACCESS_USERS, checkIsRhUser } from '@/lib/constants';

interface FieldDetail {
  id?: number | string;
  change_request_id?: number | string;
  field_name: string;
  old_value?: string | null;
  new_value?: string | null;
  status?: string;
}

interface TotvsMigrateProps {
  employeeCpf: string;
  approvedCount?: number;
  hasApprovedFields?: boolean;
  fields?: FieldDetail[];
  requestId?: number | string;
  onMigrateSuccess?: () => void;
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

function mapFieldToSectionAndPayload(field: FieldDetail): { section: string; payload: any } {
  const nameUpper = (field.field_name || '').toUpperCase().trim();
  const parsedNew = parseJsonSafe(field.new_value);

  if (nameUpper.includes('DEPENDENTE')) {
    return { section: 'dependentes', payload: parsedNew || { nome: field.new_value } };
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

export default function TotvsMigrate({
  employeeCpf,
  approvedCount,
  hasApprovedFields,
  fields,
  requestId,
  onMigrateSuccess,
}: TotvsMigrateProps) {
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  useEffect(() => {
    async function checkUserPermission() {
      try {
        setCheckingAuth(true);
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const username = (data?.user?.usuario || '').toUpperCase().trim();

          const isFullAccess = FULL_ACCESS_USERS.some((u) => u.toUpperCase() === username);
          const isRh =
            RH_USERS.some((u) => u.toUpperCase() === username) ||
            (typeof checkIsRhUser === 'function' && checkIsRhUser(username)) ||
            Boolean(data?.user?.isRh);

          if (isFullAccess || isRh) setIsAuthorized(true);
        }
      } catch (err) {
        console.error('Erro ao verificar permissões:', err);
      } finally {
        setCheckingAuth(false);
      }
    }
    checkUserPermission();
  }, []);

  const count = approvedCount !== undefined ? approvedCount : hasApprovedFields ? 1 : 0;
  const canMigrate = count > 0;
  const isButtonDisabled = loading || !canMigrate || !isAuthorized || checkingAuth;

  const handleMigrate = async () => {
    if (!isAuthorized) {
      alert('Acesso negado. Apenas o RH ou administradores podem executar esta migração.');
      return;
    }

    const cleanCpf = String(employeeCpf || '').replace(/\D/g, '');
    if (!cleanCpf) {
      alert('CPF do funcionário não informado.');
      return;
    }

    const confirmed = window.confirm(`Deseja migrar ${count} alteração(ões) APROVADA(S) para o TOTVS?`);
    if (!confirmed) return;

    setLoading(true);
    setFeedback(null);

    try {
      let rawFields: FieldDetail[] = fields || [];

      if (rawFields.length === 0) {
        const summaryRes = await fetch('/api/migratesummary');
        const summaryData = await summaryRes.json();

        if (summaryData.success && Array.isArray(summaryData.summaries)) {
          const userSummary = summaryData.summaries.find(
            (s: any) => String(s.employee_cpf).replace(/\D/g, '') === cleanCpf
          );
          if (userSummary && Array.isArray(userSummary.fields)) {
            rawFields = userSummary.fields;
          }
        }
      }

      // 📌 Garante filtragem estrita apenas de campos com status de aprovação
      const approvedFields = rawFields.filter((f) => {
        const st = (f.status || '').toLowerCase();
        return st === 'approved' || st === 'aprovado' || rawFields.length === 1;
      });

      const fieldsToProcess = approvedFields.length > 0 
        ? approvedFields 
        : [{ field_name: 'geral', new_value: '' }];

      let processedCount = 0;

      for (const field of fieldsToProcess) {
        const { section, payload } = mapFieldToSectionAndPayload(field);
        const targetRequestId = requestId || field.change_request_id;

        const response = await fetch(`/api/totvs/migrate/${section}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeCpf: cleanCpf,
            requestId: targetRequestId,
            fieldName: field.field_name,
            payload,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || `Falha ao migrar "${field.field_name}" para o TOTVS.`);
        }

        processedCount++;
      }

      setFeedback({
        type: 'success',
        message: `${processedCount} alteração(ões) migrada(s) com sucesso para o TOTVS!`,
      });

      if (onMigrateSuccess) onMigrateSuccess();

      setTimeout(() => {
        window.location.reload();
      }, 1200);

    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Erro de comunicação com a API de migração.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full pt-6 border-t border-slate-200 mt-6 flex flex-col items-center gap-3">
      {feedback && (
        <div
          className={`w-full p-3 rounded-xl text-xs font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? '✅ ' : '❌ '}
          {feedback.message}
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        {checkingAuth ? (
          <span className="text-xs text-slate-400 animate-pulse">Verificando permissões de acesso...</span>
        ) : !isAuthorized ? (
          <span className="text-xs text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 font-medium">
            🔒 Migração restrita a usuários RH ou Administradores
          </span>
        ) : canMigrate ? (
          <span className="text-xs text-slate-500 font-medium">
            <strong className="text-emerald-700 font-bold">{count}</strong>{' '}
            {count === 1 ? 'campo aprovado aguardando migração' : 'campos aprovados aguardando migração'}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">Nenhum campo aprovado pendente de migração</span>
        )}

        <button
          type="button"
          onClick={handleMigrate}
          disabled={isButtonDisabled}
          className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition shadow-sm ${
            isButtonDisabled
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              : loading
              ? 'bg-sky-400 text-white cursor-wait'
              : 'bg-sky-700 hover:bg-sky-800 text-white shadow-sky-700/20 active:scale-95 cursor-pointer'
          }`}
        >
          {loading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Migrando para TOTVS...
            </>
          ) : (
            <>
              <span>⚡</span>
              <span>Migrar Aprovados para TOTVS</span>
              {canMigrate && isAuthorized && (
                <span className="ml-1 px-2 py-0.5 text-[10px] font-extrabold bg-sky-900/60 text-sky-100 rounded-full border border-sky-400/30">
                  {count}
                </span>
              )}
            </>
          )}
        </button>
      </div>
    </div>
  );
}