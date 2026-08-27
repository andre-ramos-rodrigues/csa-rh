'use client';

import { useState } from 'react';
import TotvsMigrate from '../components/TotvsMigrate';
import Image from 'next/image';

interface Employee {
  DESCRICAO: string;
  CODEQUIPE: string;
  NOME: string;
  CPF: string;
  EMAIL: string | string[];
  GRAUINSTRUCAO?: string;
  RUA?: string;
  BAIRRO?: string;
  NUMERO?: string;
  COMPLEMENTO?: string;
  ESTADO?: string;
  CIDADE?: string;
  CEP?: string;
  PAIS?: string;
  TELEFONE1?: string;
  TELEFONE2?: string;
  DATA_NASCIMENTO?: string;
  ESTADOCIVIL?: string;
  ESTADO_CIVIL?: string;
  CARGO?: string;
  image?: string; // ← novo: base64 JPEG sem prefixo "data:", vindo direto da API REST TOTVS
  [key: string]: any; // ← novo: aceita os demais campos espalhados via ...personData (birth, EMAILPESSOAL, etc.)
}

interface Dependent {
  ID?: number;
  NOME: string | string[];
  CPF: string | null;
  GRAUPARENTESCODESC?: string;
  SEXO?: string;
  INCIRRF?: string | number;
  DTNASCIMENTO?: string | number;
  target_id?: string;
  NRODEPEND?: number | string;
  [key: string]: any;
}

interface AcademicFormation {
  ID?: number | string;
  ENTIDADE_NOMEFANTASIA?: string;
  CURSO_NOME?: string;
  GRAUINSTRUCAO_DESC?: string;
  DATAINICIO?: string;
  DATATERMINO?: string;
  SITUACAO?: string;
  [key: string]: any;
}

interface ChangeField {
  id: number;
  field_id?: number;
  change_request_id?: number;
  field_name: string;
  old_value: string;
  new_value: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string;
  review_notes?: string;
  applied_at?: string;
  reviewed_at?: string;
}

interface Attachment {
  id: number;
  change_request_id?: number;
  field_name?: string | null;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  size_bytes: number;
}

interface ChangeRequest {
  id: number;
  employee_cpf: string;
  section_key?: string | null;
  status: string;
  submitted_at: string;
  reviewed_at?: string;
  applied_at?: string;
  fields: ChangeField[];
  attachments: Attachment[];
}

interface EmployeeDataProps {
  employee: Employee;
  resultDependentes?: Dependent[];
  resultFormacaoAcademica?: AcademicFormation[];
  changeRequest?: any;
  onApproveField?: (fieldId: number, note?: string) => Promise<void>;
  onRejectField?: (fieldId: number, note?: string) => Promise<void>;
}

const SECTION_MAP: Record<
  string,
  'escolaridade' | 'endereco' | 'documentos' | 'contato' | 'dependentes' | 'formacaoAcademica' | 'geral' | 'outros'
> = {
  GRAUINSTRUCAO: 'escolaridade',
  escolaridade: 'escolaridade',
  RUA: 'endereco',
  NUMERO: 'endereco',
  COMPLEMENTO: 'endereco',
  BAIRRO: 'endereco',
  CEP: 'endereco',
  CIDADE: 'endereco',
  ESTADO: 'endereco',
  PAIS: 'endereco',
  endereco: 'endereco',
  CPF: 'documentos',
  documentos: 'documentos',
  EMAIL: 'contato',
  TELEFONE1: 'contato',
  TELEFONE2: 'contato',
  contato: 'contato',
  DEPENDENTES: 'dependentes',
  dependentes: 'dependentes',
  FORMACAO_ACADEMICA: 'formacaoAcademica',
  formacaoAcademica: 'formacaoAcademica',
  formacao_academica: 'formacaoAcademica',
  NOME: 'geral',
  DESCRICAO: 'geral',
  CODEQUIPE: 'geral',
  DATA_NASCIMENTO: 'geral',
  ESTADOCIVIL: 'geral',
  ESTADO_CIVIL: 'geral',
  estado_civil: 'geral',
  CARGO: 'geral',
  geral: 'geral'
};

function formatCpf(cpf?: string | null) {
  if (!cpf) return '--';
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf || '--';
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function formatCep(cep?: string) {
  if (!cep) return '--';
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return cep;
  return clean.replace(/(\d{5})(\d{3})/, '$1-$2');
}

function formatPhone(phone?: string) {
  if (!phone) return '--';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  if (clean.length === 10) {
    return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return phone;
}

function formatDateToBR(dateStr: any): string {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  if (!str) return '';

  // Se já estiver no formato dd/mm/aaaa
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }

  // Se vier no formato ISO (ex: 2026-01-01T00:00:00.000Z) ou YYYY-MM-DD
  const cleanDate = str.includes('T') ? str.split('T')[0] : str;
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    const [year, month, day] = cleanDate.split('-');
    return `${day}/${month}/${year}`;
  }

  return str;
}

function initials(name: string) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '');
}

function parseEmails(emailData?: string | string[]): string[] {
  if (!emailData) return [];
  if (Array.isArray(emailData)) return emailData.filter(Boolean);
  return emailData
    .split(/[;,]/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
}

function getDependentName(nome: any) {
  if (Array.isArray(nome)) {
    return nome[0] || '--';
  }
  return nome || '--';
}

const isPendingStatus = (status?: string) => {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === 'pending' || s === 'pendente';
};

const isApprovedStatus = (status?: string) => {
  if (!status) return false;
  const s = status.trim().toLowerCase();
  return s === 'approved' || s === 'aprovado';
};

function getSafeFieldId(field: any): number | null {
  if (!field) return null;
  const rawId = field.id ?? field.field_id ?? field.change_field_id;
  if (rawId === undefined || rawId === null || rawId === '') return null;
  const parsed = Number(rawId);
  return isNaN(parsed) ? null : parsed;
}

export default function EmployeeData({
  employee,
  resultDependentes = [],
  resultFormacaoAcademica = [],
  changeRequest,
  onApproveField,
  onRejectField,
}: EmployeeDataProps) {
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [, setApprovedFieldIds] = useState<number[]>([]);
  const [, setRejectedFieldIds] = useState<number[]>([]);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const emailList = parseEmails(employee.EMAIL);

  let requestsList: ChangeRequest[] = [];
  let allFields: ChangeField[] = [];

  if (changeRequest) {
    const rawData = changeRequest?.data || changeRequest;

    const rawRequests =
      rawData.changeRequests ||
      rawData.change_requests ||
      (Array.isArray(rawData) ? rawData : [rawData]);

    const rawFields: ChangeField[] =
      rawData.change_request_fields ||
      rawRequests.flatMap((r: any) => r.fields || []);

    const rawAttachments: Attachment[] =
      rawData.change_request_attachments ||
      rawRequests.flatMap((r: any) => r.attachments || []);

    allFields = rawFields;

    requestsList = rawRequests.map((req: any) => ({
      ...req,
      fields: (req.fields && req.fields.length > 0)
        ? req.fields
        : rawFields.filter((f) => String(f.change_request_id) === String(req.id)),
      attachments: (req.attachments && req.attachments.length > 0)
        ? req.attachments
        : rawAttachments.filter((a) => String(a.change_request_id) === String(req.id)),
    }));
  }

  const pendingFields = allFields.filter((f) => isPendingStatus(f.status));
  const pendingRequests = requestsList.filter((r) =>
    (r.fields || []).some((f) => isPendingStatus(f.status))
  );

  const approvedFields = allFields.filter((f) => isApprovedStatus(f.status));

  const sortedApprovedFields = [...approvedFields].sort((a, b) => {
    const dateA = new Date(a.applied_at || a.reviewed_at || 0).getTime();
    const dateB = new Date(b.applied_at || b.reviewed_at || 0).getTime();
    return dateB - dateA;
  });

  const lastApprovedField = sortedApprovedFields[0];

  const rawApprovedDate =
    lastApprovedField?.applied_at || lastApprovedField?.reviewed_at;

  const formattedApprovedDate = rawApprovedDate
    ? new Date(rawApprovedDate).toLocaleDateString('pt-BR')
    : '--/--/----';

  const latestApprovedDateStr = rawApprovedDate
    ? new Date(rawApprovedDate).toLocaleDateString('pt-BR')
    : null;

  const latestApprovedFields = sortedApprovedFields.filter((f) => {
    const fDate = f.applied_at || f.reviewed_at;
    return (
      fDate &&
      new Date(fDate).toLocaleDateString('pt-BR') === latestApprovedDateStr
    );
  });

  const approvedFieldNames = Array.from(
    new Set(latestApprovedFields.map((f) => f.field_name))
  ).join(', ');

  interface HistoricalAttachmentItem {
    attachment: Attachment;
    requestStatus: string;
    sectionKey: string;
    fieldName: string;
    dateStr: string;
  }

  const pendingAttachmentsBySection: Record<string, Attachment[]> = {
    escolaridade: [],
    endereco: [],
    documentos: [],
    contato: [],
    dependentes: [],
    formacaoAcademica: [],
    geral: [],
    outros: [],
  };

  const historicalAttachments: HistoricalAttachmentItem[] = [];

  requestsList.forEach((req) => {
    const rawSectionKey = req.section_key || '';
    const isReqPending =
      isPendingStatus(req.status) ||
      (req.fields && req.fields.some((f) => isPendingStatus(f.status)));

    (req.attachments || []).forEach((att) => {
      const rawFieldName = att.field_name || '';

      let mappedSection =
        SECTION_MAP[rawSectionKey] ||
        SECTION_MAP[rawFieldName] ||
        SECTION_MAP[rawFieldName.toUpperCase()];

      if (!mappedSection) {
        if (
          rawFieldName.startsWith('dependentes') ||
          rawFieldName.startsWith('dependente') ||
          rawSectionKey.startsWith('dependente')
        ) {
          mappedSection = 'dependentes';
        } else if (
          rawFieldName.startsWith('formacao_academica') ||
          rawFieldName.startsWith('formacaoAcademica') ||
          rawSectionKey.startsWith('formacao')
        ) {
          mappedSection = 'formacaoAcademica';
        } else {
          mappedSection = 'outros';
        }
      }

      if (isReqPending) {
        if (pendingAttachmentsBySection[mappedSection]) {
          pendingAttachmentsBySection[mappedSection].push(att);
        } else {
          pendingAttachmentsBySection.outros.push(att);
        }
      } else {
        const rawDate = req.reviewed_at || req.applied_at || req.submitted_at;
        const dateStr = rawDate
          ? new Date(rawDate).toLocaleDateString('pt-BR')
          : '--/--/----';

        historicalAttachments.push({
          attachment: att,
          requestStatus: req.status || 'FINALIZADO',
          sectionKey: mappedSection,
          fieldName: att.field_name || req.section_key || 'Geral',
          dateStr,
        });
      }
    });
  });

  const getFieldsBySection = (section: string) =>
    allFields.filter(
      (f) =>
        (SECTION_MAP[f.field_name] ||
          SECTION_MAP[f.field_name.toUpperCase()] ||
          'geral') === section
    );

  const escolaridadeChanges = getFieldsBySection('escolaridade');
  const enderecoChanges = getFieldsBySection('endereco');
  const documentosChanges = getFieldsBySection('documentos');
  const contatoChanges = getFieldsBySection('contato');
  const dependentesChanges = getFieldsBySection('dependentes');
  const formacaoAcademicaChanges = getFieldsBySection('formacaoAcademica');
  const geralChanges = getFieldsBySection('geral');

  const handleApproveFieldApi = async (field: ChangeField) => {
    const fieldId = getSafeFieldId(field);
    if (fieldId === null) {
      alert('Erro: ID do campo não identificado.');
      return;
    }

    setProcessingId(fieldId);
    try {
      const response = await fetch('/api/change-request/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldId,
          fieldName: field.field_name,
          oldValue: field.old_value,
          newValue: field.new_value,
          employeeCpf: employee.CPF,
          status: 'APPROVED',
        }),
      });

      if (!response.ok) throw new Error('Erro ao processar aprovação');

      setApprovedFieldIds((prev) => [...prev, fieldId]);
      if (onApproveField) await onApproveField(fieldId);

      window.location.reload();
    } catch (error) {
      console.error('Erro ao aprovar o campo:', error);
      alert('Falha ao aprovar a solicitação.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDenyFieldApi = async (field: ChangeField) => {
    const fieldId = getSafeFieldId(field);
    if (fieldId === null) {
      alert('Erro: ID do campo não identificado.');
      return;
    }

    const reviewNotes = window.prompt(
      `Motivo do indeferimento para "${field.field_name}" (opcional):`
    );

    if (reviewNotes === null) return;

    setProcessingId(fieldId);
    try {
      const response = await fetch('/api/change-request/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldId,
          fieldName: field.field_name,
          employeeCpf: employee.CPF,
          reviewNotes: reviewNotes.trim() || '',
          status: 'REJECTED',
        }),
      });

      const resData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          resData.error ||
            resData.message ||
            `Erro ${response.status}: Falha ao processar rejeição no servidor.`
        );
      }

      setRejectedFieldIds((prev) => [...prev, fieldId]);
      if (onRejectField) await onRejectField(fieldId, reviewNotes || undefined);

      window.location.reload();
    } catch (error: any) {
      console.error('Erro ao negar o campo:', error);
      alert(error.message || 'Falha ao rejeitar a solicitação.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveSingleDependent = async (
    field: ChangeField,
    targetDep: any,
    fullList: any[]
  ) => {
    const fieldId = getSafeFieldId(field);
    if (fieldId === null) return;

    if (!window.confirm(`Confirma a APROVAÇÃO do dependente "${getDependentName(targetDep.NOME || targetDep.nome)}"?`)) {
      return;
    }

    setProcessingId(fieldId);
    try {
      const response = await fetch('/api/change-request/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldId,
          fieldName: field.field_name,
          oldValue: field.old_value,
          newValue: JSON.stringify([targetDep]),
          employeeCpf: employee.CPF,
          status: 'APPROVED',
        }),
      });

      if (!response.ok) throw new Error('Erro ao aprovar dependente');

      setApprovedFieldIds((prev) => [...prev, fieldId]);
      if (onApproveField) await onApproveField(fieldId);
      window.location.reload();
    } catch (error) {
      console.error('Erro ao aprovar dependente:', error);
      alert('Falha ao aprovar o dependente selecionado.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDenySingleDependent = async (
    field: ChangeField,
    targetDep: any,
    fullList: any[]
  ) => {
    const fieldId = getSafeFieldId(field);
    if (fieldId === null) return;

    const depName = getDependentName(targetDep.NOME || targetDep.nome);
    const reviewNotes = window.prompt(
      `Motivo do indeferimento para o dependente "${depName}" (opcional):`
    );

    if (reviewNotes === null) return;

    setProcessingId(fieldId);
    try {
      const remainingDeps = fullList.filter((dep) => dep !== targetDep);

      const response = await fetch('/api/change-request/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldId,
          fieldName: field.field_name,
          employeeCpf: employee.CPF,
          reviewNotes: reviewNotes.trim() || '',
          rejectedItem: targetDep,
          newValue: JSON.stringify(remainingDeps),
          status: remainingDeps.length === 0 ? 'REJECTED' : 'APPROVED',
        }),
      });

      if (!response.ok) throw new Error('Erro ao rejeitar dependente');

      setRejectedFieldIds((prev) => [...prev, fieldId]);
      if (onRejectField) await onRejectField(fieldId, reviewNotes || undefined);
      window.location.reload();
    } catch (error: any) {
      console.error('Erro ao negar dependente:', error);
      alert(error.message || 'Falha ao rejeitar o dependente selecionado.');
    } finally {
      setProcessingId(null);
    }
  };

  function renderFormattedValue(value: string, fieldName: string) {
    if (!value || value.trim() === '' || value === '(Vazio)' || value === 'Nenhum' || value === '(Nenhum)') {
      return <span className="text-xs text-slate-400 italic">(Nenhum registrado)</span>;
    }

    const trimmed = value.trim();

    if (
      fieldName === 'FORMACAO_ACADEMICA' ||
      fieldName === 'DEPENDENTES' ||
      trimmed.startsWith('[') ||
      trimmed.startsWith('{')
    ) {
      try {
        const parsedRaw = JSON.parse(trimmed);
        const parsed = Array.isArray(parsedRaw) ? parsedRaw : [parsedRaw];

        if (parsed.length === 0) {
          return <span className="text-xs text-slate-400 italic">Nenhum item informado</span>;
        }

        if (fieldName === 'FORMACAO_ACADEMICA' || parsed[0]?.CURSO_NOME) {
          return (
            <div className="space-y-2 mt-1">
              {parsed.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-2xs space-y-0.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-cyan-800">
                      🎓 {item.CURSO_NOME || 'Curso não informado'}
                    </span>
                    {item.SITUACAO && (
                      <span className="px-1.5 py-0.5 bg-cyan-50 border border-cyan-200 text-cyan-700 text-[10px] font-semibold rounded">
                        {item.SITUACAO}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-600 font-medium">
                    🏢 {item.ENTIDADE_NOMEFANTASIA || 'Instituição não informada'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Grau: {item.GRAUINSTRUCAO_DESC || 'Não informado'}
                  </p>
                </div>
              ))}
            </div>
          );
        }

        if (
          fieldName === 'DEPENDENTES' ||
          parsed[0]?.GRAUPARENTESCODESC !== undefined ||
          parsed[0]?.INCIRRF !== undefined ||
          parsed[0]?.INCIDE_IRPF !== undefined
        ) {
          return (
            <div className="space-y-2 mt-1">
              {parsed.map((item: any, idx: number) => {
                const rawIrrf =
                  item.INCIRRF ?? item.incirrf ?? item.INCIDE_IRPF ?? item.incide_irpf ?? item.IRPF ?? item.irpf;

                const isIrrfSim =
                  rawIrrf === 1 ||
                  rawIrrf === '1' ||
                  rawIrrf === true ||
                  String(rawIrrf).toLowerCase() === 'sim';

                return (
                  <div
                    key={idx}
                    className="p-2.5 bg-white border border-slate-200 rounded-lg shadow-2xs space-y-1 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        👤 {getDependentName(item.NOME || item.nome)}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          isIrrfSim
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        INCIDE IRPF: {isIrrfSim ? 'SIM' : 'NÃO'}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px]">
                      Parentesco: <strong>{item.GRAUPARENTESCODESC || item.grau_parentesco || '--'}</strong> | CPF: {formatCpf(item.CPF || item.cpf)}
                    </p>
                  </div>
                );
              })}
            </div>
          );
        }
      } catch {
        // Fallback
      }
    }

    return <span className="text-xs text-slate-800 font-semibold whitespace-pre-wrap">{value}</span>;
  }

  const handleDenySectionFieldsApi = async (
    fields: ChangeField[],
    sectionLabel: string
  ) => {
    const pendingInSection = fields.filter((f) => isPendingStatus(f.status));
    if (pendingInSection.length === 0) return;

    const reviewNotes = window.prompt(
      `Motivo do indeferimento para TODOS os ${pendingInSection.length} campo(s) de "${sectionLabel}" (opcional):`
    );

    if (reviewNotes === null) return;

    setProcessingId(-1);
    try {
      await Promise.all(
        pendingInSection.map(async (field) => {
          const fieldId = getSafeFieldId(field);
          if (fieldId === null) return;

          const response = await fetch('/api/change-request/deny', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fieldId,
              fieldName: field.field_name,
              employeeCpf: employee.CPF,
              reviewNotes: reviewNotes.trim() || '',
              status: 'REJECTED',
            }),
          });

          if (!response.ok) {
            const resData = await response.json().catch(() => ({}));
            throw new Error(
              resData.error ||
                resData.message ||
                `Erro ao rejeitar o campo ${field.field_name}`
            );
          }

          setRejectedFieldIds((prev) => [...prev, fieldId]);
          if (onRejectField) await onRejectField(fieldId, reviewNotes || undefined);
        })
      );

      window.location.reload();
    } catch (error: any) {
      console.error('Erro ao negar os campos da seção:', error);
      alert(error.message || 'Falha ao rejeitar a solicitação.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveSectionFieldsApi = async (
    fields: ChangeField[],
    sectionLabel: string
  ) => {
    const pendingInSection = fields.filter((f) => isPendingStatus(f.status));
    if (pendingInSection.length === 0) return;

    if (
      !window.confirm(
        `Confirma a APROVAÇÃO de todos os ${pendingInSection.length} campo(s) de "${sectionLabel}"?`
      )
    ) {
      return;
    }

    setProcessingId(-1);
    try {
      await Promise.all(
        pendingInSection.map(async (field) => {
          const fieldId = getSafeFieldId(field);
          if (fieldId === null) return;

          const response = await fetch('/api/change-request/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fieldId,
              fieldName: field.field_name,
              oldValue: field.old_value,
              newValue: field.new_value,
              employeeCpf: employee.CPF,
              status: 'APPROVED',
            }),
          });

          if (!response.ok) throw new Error(`Erro ao aprovar o campo ${field.field_name}`);

          setApprovedFieldIds((prev) => [...prev, fieldId]);
          if (onApproveField) await onApproveField(fieldId);
        })
      );

      window.location.reload();
    } catch (error: any) {
      console.error('Erro ao aprovar os campos da seção:', error);
      alert(error.message || 'Falha ao aprovar a solicitação.');
    } finally {
      setProcessingId(null);
    }
  };

  const renderSectionHeaderActions = (
    fields: ChangeField[],
    sectionLabel: string
  ) => {
    const pendingInSection = fields.filter((f) => isPendingStatus(f.status));
    if (pendingInSection.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-bold uppercase">
          Alteração Solicitada ({pendingInSection.length})
        </span>
        {pendingInSection.length > 1 && (
          <div className="flex items-center gap-1.5 ml-1">
            <button
              type="button"
              disabled={processingId !== null}
              onClick={() => handleApproveSectionFieldsApi(fields, sectionLabel)}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {processingId === -1 ? 'Processando...' : 'APROVAR TODOS'}
            </button>
            <button
              type="button"
              disabled={processingId !== null}
              onClick={() => handleDenySectionFieldsApi(fields, sectionLabel)}
              className="px-2.5 py-1 rounded-md text-[11px] font-bold text-white bg-rose-700 hover:bg-rose-800 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {processingId === -1 ? 'Processando...' : 'NEGAR TODOS'}
            </button>
          </div>
        )}
      </div>
    );
  };

const renderFieldChangeBadge = (field: ChangeField) => {
    if (!isPendingStatus(field.status)) {
      return null;
    }

    const fieldId = getSafeFieldId(field);
    const isProcessing = processingId === fieldId;

    // 👨‍👩‍👧‍👦 Card individual para Dependente desacoplado
    if (
      field.field_name === 'DEPENDENTES' ||
      field.field_name.toUpperCase().includes('DEPENDENTE')
    ) {
      let item: any = null;
      try {
        const parsed = field.new_value ? JSON.parse(field.new_value) : null;
        item = Array.isArray(parsed) ? parsed[0] : parsed;
      } catch {
        item = null;
      }

      if (item && typeof item === 'object') {
        const rawIrrf =
          item.INCIRRF ?? item.incirrf ?? item.INCIDE_IRPF ?? item.incide_irpf ?? item.IRPF ?? item.irpf;
        const isIrrfSim =
          rawIrrf === 1 || rawIrrf === '1' || rawIrrf === true || String(rawIrrf).toLowerCase() === 'sim';

        return (
          <div
            key={field.id}
            className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3 shadow-2xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800">
                  👤 {getDependentName(item.NOME || item.nome)}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                    isIrrfSim
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  INCIDE IRPF: {isIrrfSim ? 'SIM' : 'NÃO'}
                </span>
                <span className='px-2 py-0.5 rounded-md text-[10px] font-bold border bg-slate-100 text-slate-600 border-slate-20 '>
                  {item?.target_id === 'NEW' ? 'Novo' : 'Antigo'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={processingId !== null}
                  onClick={() => handleApproveFieldApi(field)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? '...' : 'APROVAR ESTE'}
                </button>
                <button
                  type="button"
                  disabled={processingId !== null}
                  onClick={() => handleDenyFieldApi(field)}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  {isProcessing ? '...' : 'NEGAR ESTE'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
              <p>
                Parentesco: <strong>{item.GRAUPARENTESCODESC || item.grau_parentesco || '--'}</strong>
              </p>
              <p>
                CPF: <strong className="font-mono">{formatCpf(item.CPF || item.cpf)}</strong>
              </p>
              {item.DTNASCIMENTO && (
                <p>
                  Nascimento:{' '}
                  <strong>
                    {new Date(item.DTNASCIMENTO).toLocaleDateString('pt-BR')}
                  </strong>
                </p>
              )}
            </div>
          </div>
        );
      }
    }

    // Retorno padrão para demais campos do sistema
    return (
      <div
        key={field.id || `${field.field_name}_${field.new_value}`}
        className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3 relative shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
          <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
            🟠 SOLICITAÇÃO DE ALTERAÇÃO: {field.field_name}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={processingId !== null}
              onClick={() => handleApproveFieldApi(field)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? '...' : 'APROVAR'}
            </button>
            <button
              type="button"
              disabled={processingId !== null}
              onClick={() => handleDenyFieldApi(field)}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? '...' : 'NEGAR'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 bg-white/80 border border-slate-200 rounded-lg space-y-1">
            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              DE (TOTVS)
            </span>
            {renderFormattedValue(field.old_value, field.field_name)}
          </div>

          <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-lg space-y-1">
            <span className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
              PARA (NOVO)
            </span>
            {renderFormattedValue(field.new_value, field.field_name)}
          </div>
        </div>
      </div>
    );
  };

  const renderAttachmentChips = (attachments: Attachment[], label = 'Anexos da Seção') => {
    if (!attachments || attachments.length === 0) return null;
    return (
      <div className="pt-3 border-t border-slate-100 mt-3">
        <span className="text-xs font-bold text-purple-700 uppercase tracking-wider block mb-2">
          📎 {label} ({attachments.length}):
        </span>
        <div className="flex flex-wrap gap-2">
          {attachments.map((att) => (
            <a
              key={att.id}
              href={`/api/attachments/${att.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 text-xs hover:bg-purple-100 transition font-mono"
            >
              📄 {att.original_filename} ({Math.round(att.size_bytes / 1024)} KB)
            </a>
          ))}
        </div>
      </div>
    );
  };

  const estadoCivilValor = employee.ESTADOCIVIL || employee.ESTADO_CIVIL;

  return (
    <div className="w-full max-w-4xl shrink-0 mx-auto bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Botão de Voltar */}
      <div>
        <button
          onClick={() => window.history.back()}
          className="text-xs text-slate-500 hover:text-slate-800 transition flex items-center gap-1 mb-2 cursor-pointer font-medium"
        >
          ← Voltar ao painel
        </button>
      </div>

      {/* Cabeçalho Principal */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Ficha do Funcionário (RH)</h2>
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            Cadastro TOTVS Ativo
          </span>
        </div>

        {/* Botão de Histórico de Arquivos */}
        <button
          type="button"
          onClick={() => setIsHistoryModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 text-xs font-bold transition shadow-2xs cursor-pointer active:scale-95"
        >
          📁 Histórico de arquivos ({historicalAttachments.length})
        </button>
      </div>

      {/* 🟢 BANNER: Aviso de Última Alteração Aprovada no Topo */}
      {approvedFields.length > 0 && (
        <div className="p-4 bg-emerald-50/80 border border-emerald-200/90 rounded-xl flex items-center gap-3 shadow-2xs">
          <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
          <div className="text-xs text-emerald-900 font-medium">
            <span className="font-bold uppercase tracking-wider text-emerald-800 block sm:inline">
              Última alteração foi aprovada em {formattedApprovedDate}:
            </span>{' '}
            <span>
              campo(s): <strong className="font-semibold text-emerald-950">{approvedFieldNames}</strong>
            </span>
          </div>
        </div>
      )}

      {/* 🟡 BANNER: Resumo de Solicitações Pendentes */}
      {pendingFields.length > 0 && (
        <div className="p-4 bg-amber-50/80 border border-amber-200/90 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-amber-900">
                  {pendingRequests.length === 1
                    ? `Solicitação de Alteração Pendente (#REQ-${pendingRequests[0].id})`
                    : `Existe(m) ${pendingRequests.length} solicitação(ões) de alteração pendente(s)`}
                </h3>
                <p className="text-xs text-amber-800/90">
                  Total de {pendingFields.length} alteração(ões) pendente(s) de análise nesta ficha.
                </p>
              </div>
            </div>
            {pendingRequests.length === 1 && pendingRequests[0].submitted_at && (
              <span className="text-xs font-mono text-amber-800/80 hidden sm:block shrink-0">
                Enviado em:{' '}
                {new Date(pendingRequests[0].submitted_at).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Cartão Hero de Identificação (TOTVS) + Anexos Gerais / Estado Civil */}
      <div className="p-6 bg-slate-50/60 border border-slate-200/80 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {employee.image ? (
        <Image
            width={80} 
            height={80} 
            src={`data:image/jpeg;base64,${employee.image}`}
            alt={employee.NOME}
            className="w-20 h-20 shrink-0 rounded-2xl object-cover shadow-sm shadow-sky-600/20 border border-slate-200"
            onError={(e) => {
            // Se o base64 vier corrompido/vazio, esconde a <img> e mostra o fallback de iniciais
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
            }}
        />
        ) : null}
        <div
        className={`w-20 h-20 shrink-0 rounded-2xl bg-sky-600 flex items-center justify-center font-bold text-white text-2xl shadow-sm shadow-sky-600/20 ${
            employee.image ? 'hidden' : ''
        }`}
        >
        {initials(employee.NOME)}
        </div>

          <div className="min-w-0 flex-1 text-center sm:text-left w-full">
            <h1 className="text-2xl font-bold text-slate-900 truncate mb-1">
              {employee.NOME}
            </h1>

            <p className="text-sm text-slate-500 mb-4">
              {emailList.length > 0 ? emailList.join(' · ') : 'E-mail não cadastrado'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-200/80 pt-4 text-left">
              <div>
                <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
                  Lotação / Equipe
                </span>
                <span className="text-sm text-slate-700 font-medium">
                  {employee.DESCRICAO || '--'}{' '}
                  <span className="text-slate-400 font-mono">
                    ({employee.CODEQUIPE || '--'})
                  </span>
                </span>
              </div>
              <div>
                <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
                  Estado Civil
                </span>
                <span className="text-sm text-slate-700 font-medium">
                  {estadoCivilValor || '--'}
                </span>
              </div>
              {employee.CARGO && (
                <div>
                  <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
                    Cargo
                  </span>
                  <span className="text-sm text-slate-700 font-medium">
                    {employee.CARGO}
                  </span>
                </div>
              )}
              {employee.DATA_NASCIMENTO && (
                <div>
                  <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
                    Data Nascimento
                  </span>
                  <span className="text-sm text-slate-700 font-medium font-mono">
                    {employee.DATA_NASCIMENTO}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {geralChanges.map(renderFieldChangeBadge)}
        {renderAttachmentChips(
          pendingAttachmentsBySection.geral,
          'Anexos de Identificação / Estado Civil'
        )}
      </div>

      {/* 🎓 Escolaridade e Formação Acadêmica */}
      <div className="p-6 bg-slate-50/60 border border-slate-200/80 rounded-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-2">
          <h3 className="text-sm font-bold text-sky-800 uppercase tracking-wider flex items-center gap-2">
            🎓 Escolaridade e Formação Acadêmica
          </h3>
          {renderSectionHeaderActions(
            [...escolaridadeChanges, ...formacaoAcademicaChanges],
            'Escolaridade e Formação Acadêmica'
          )}
        </div>

        {/* Grau de Instrução */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2 border-b border-slate-200/60">
          <div>
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              Grau de Instrução
            </span>
            <span className="text-sm text-slate-700 font-medium">
              {employee.GRAUINSTRUCAO || '--'}
            </span>
          </div>
        </div>

        {/* 📚 Cursos Cadastrados Atualmente na Base */}
        <div className="space-y-2">
          <span className="block text-xs text-slate-500 uppercase font-bold tracking-wider">
            📚 Cursos Registrados na Base ({resultFormacaoAcademica.length})
          </span>
          {resultFormacaoAcademica.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {resultFormacaoAcademica.map((curso, idx) => (
                <div
                  key={curso.ID || idx}
                  className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm space-y-1"
                >
                  <span className="block text-[10px] text-sky-700 font-bold uppercase tracking-wider">
                    {curso.GRAUINSTRUCAO_DESC || 'Grau não informado'}
                  </span>
                  <p className="text-xs font-bold text-slate-800">
                    {curso.CURSO_NOME || 'Curso não informado'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {curso.ENTIDADE_NOMEFANTASIA || 'Instituição não informada'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">
              Nenhum curso acadêmico registrado na base de dados.
            </p>
          )}
        </div>

        {/* ⚠️ Solicitações de Alteração / Novos Cursos Pendentes */}
        {(escolaridadeChanges.length > 0 || formacaoAcademicaChanges.length > 0) && (
          <div className="space-y-2 pt-2 border-t border-slate-200/60">
            {escolaridadeChanges.map(renderFieldChangeBadge)}
            {formacaoAcademicaChanges.map(renderFieldChangeBadge)}
          </div>
        )}

        {/* 📎 Comprovantes e Anexos Pendentes */}
        {renderAttachmentChips(
          pendingAttachmentsBySection.escolaridade,
          'Comprovantes de Escolaridade'
        )}
        {renderAttachmentChips(
          pendingAttachmentsBySection.formacaoAcademica,
          'Comprovantes / Diplomas de Formação Acadêmica'
        )}
      </div>

      {/* 📍 Endereço */}
      <div className="p-6 bg-slate-50/60 border border-slate-200/80 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-2">
          <h3 className="text-sm font-bold text-sky-800 uppercase tracking-wider">
            📍 Endereço
          </h3>
          {renderSectionHeaderActions(enderecoChanges, 'Endereço')}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              Logradouro / Rua
            </span>
            <span className="text-sm text-slate-700 font-medium">
              {employee.RUA || '--'}
            </span>
          </div>
          <div>
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              Número
            </span>
            <span className="text-sm text-slate-700 font-medium">
              {employee.NUMERO || 'S/N'}
            </span>
          </div>
          <div>
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              Complemento
            </span>
            <span className="text-sm text-slate-700 font-medium">
              {employee.COMPLEMENTO || '--'}
            </span>
          </div>
          <div>
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              Bairro
            </span>
            <span className="text-sm text-slate-700 font-medium">
              {employee.BAIRRO || '--'}
            </span>
          </div>
          <div>
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              CEP
            </span>
            <span className="text-sm text-slate-700 font-medium font-mono">
              {formatCep(employee.CEP)}
            </span>
          </div>
          <div>
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              Cidade / UF
            </span>
            <span className="text-sm text-slate-700 font-medium">
              {employee.CIDADE || '--'}
              {employee.ESTADO ? ` - ${employee.ESTADO}` : ''}
            </span>
          </div>
          <div>
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              País
            </span>
            <span className="text-sm text-slate-700 font-medium">
              {employee.PAIS || 'Brasil'}
            </span>
          </div>
        </div>

        {enderecoChanges.map(renderFieldChangeBadge)}
        {renderAttachmentChips(
          pendingAttachmentsBySection.endereco,
          'Comprovante de Endereço'
        )}
      </div>

      {/* 📄 Documentos */}
      <div className="p-6 bg-slate-50/60 border border-slate-200/80 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-2">
          <h3 className="text-sm font-bold text-sky-800 uppercase tracking-wider">
            📄 Documentos
          </h3>
          {renderSectionHeaderActions(documentosChanges, 'Documentos')}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              CPF
            </span>
            <span className="text-sm text-slate-700 font-medium font-mono">
              {formatCpf(employee.CPF)}
            </span>
          </div>
        </div>

        {documentosChanges.map(renderFieldChangeBadge)}
        {renderAttachmentChips(
          pendingAttachmentsBySection.documentos,
          'Documentos de Identificação'
        )}
      </div>

      {/* 📞 Contato */}
      <div className="p-6 bg-slate-50/60 border border-slate-200/80 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-2">
          <h3 className="text-sm font-bold text-sky-800 uppercase tracking-wider">
            📞 Contato
          </h3>
          {renderSectionHeaderActions(contatoChanges, 'Contato')}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-1.5">
              E-mails Cadastrados ({emailList.length})
            </span>
            <div className="flex flex-wrap gap-2">
              {emailList.length > 0 ? (
                emailList.map((mail, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-3 py-1 rounded-lg bg-white border border-slate-200 text-sky-800 text-xs font-mono shadow-2xs"
                  >
                    {mail}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-400 italic">
                  Nenhum e-mail cadastrado
                </span>
              )}
            </div>
          </div>

          <div>
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              Telefone Principal
            </span>
            <span className="text-sm text-slate-700 font-medium font-mono">
              {formatPhone(employee.TELEFONE1)}
            </span>
          </div>
          <div>
            <span className="block text-xs text-slate-400 uppercase font-semibold mb-0.5">
              Telefone Secundário
            </span>
            <span className="text-sm text-slate-700 font-medium font-mono">
              {formatPhone(employee.TELEFONE2)}
            </span>
          </div>
        </div>

        {contatoChanges.map(renderFieldChangeBadge)}
        {renderAttachmentChips(
          pendingAttachmentsBySection.contato,
          'Comprovantes de Contato'
        )}
      </div>

      {/* 👨‍👩‍👧‍👦 SEÇÃO: Dependentes */}
{/* 👨‍👩‍👧‍👦 SEÇÃO: Dependentes */}
      <div className="p-6 bg-slate-50/60 border border-slate-200/80 rounded-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-2 gap-2">
          <h3 className="text-sm font-bold text-sky-800 uppercase tracking-wider flex items-center gap-2">
            👨‍👩‍👧‍👦 Dependentes (TOTVS)
            <span className="px-2 py-0.5 bg-slate-200/80 rounded-full text-slate-700 text-xs font-semibold">
              {resultDependentes.length}
            </span>
          </h3>
          {renderSectionHeaderActions(dependentesChanges, 'Dependentes')}
        </div>

        {resultDependentes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {resultDependentes.map((dep, index) => (
              <div
                key={dep.ID || index}
                className="p-3.5 bg-white border border-slate-200 rounded-lg flex flex-col justify-between shadow-2xs"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="block text-xs text-slate-400 uppercase font-semibold mb-1">
                      Nome do Dependente
                    </span>
                    {dep.GRAUPARENTESCODESC && (
                      <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">
                        {dep.GRAUPARENTESCODESC}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-900">
                    {getDependentName(dep.NOME)}
                  </p>
                  {dep.DTNASCIMENTO && (
                    <span className="text-[10px] px-2 py-0.5 bg-slate-300 rounded text-slate-600 font-medium">
                      {formatDateToBR(dep.DTNASCIMENTO)}
                    </span>
                  )}
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase font-semibold">
                      CPF
                    </span>
                    <p className="text-xs font-mono text-slate-700 font-medium">
                      {formatCpf(dep.CPF)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] text-slate-400 uppercase font-semibold mb-0.5">
                      Incide IRPF
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        dep.INCIRRF === 1 || dep.INCIRRF === '1'
                          ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                          : 'bg-slate-100 border border-slate-200 text-slate-500'
                      }`}
                    >
                      {dep.INCIRRF === 1 || dep.INCIRRF === '1' ? 'Sim' : 'Não'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">
            Nenhum dependente cadastrado atualmente no TOTVS para este funcionário.
          </p>
        )}

        {/* 🟠 LISTA AGRUPADA DE DEPENDENTES PENDENTES */}
        {dependentesChanges.filter((f) => isPendingStatus(f.status)).length > 0 && (
          <div className="space-y-3 pt-3 border-t border-slate-200/80">
            <span className="text-xs font-bold text-amber-900 uppercase tracking-wider block">
              🟠 SOLICITAÇÕES DE DEPENDENTES ({dependentesChanges.filter((f) => isPendingStatus(f.status)).length} PENDENTE(S))
            </span>
            <div className="space-y-3">
              {dependentesChanges.map(renderFieldChangeBadge)}
            </div>
          </div>
        )}

        {renderAttachmentChips(
          pendingAttachmentsBySection.dependentes,
          'Comprovantes de Dependentes'
        )}
      </div>

      {/* Outros Anexos Gerais / Não Categorizados Pendentes */}
      {pendingAttachmentsBySection.outros.length > 0 && (
        <div className="p-6 bg-slate-50/60 border border-slate-200/80 rounded-xl space-y-3">
          <h3 className="text-xs font-bold text-purple-700 uppercase tracking-wider border-b border-slate-200 pb-2">
            📎 Outros Anexos Pendentes ({pendingAttachmentsBySection.outros.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {pendingAttachmentsBySection.outros.map((att) => (
              <a
                key={att.id}
                href={`/api/attachments/${att.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 text-xs hover:bg-purple-100 transition font-mono"
              >
                📄 {att.original_filename} ({Math.round(att.size_bytes / 1024)} KB)
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Rodapé - Ação de Migração TOTVS */}
      <div className="w-full flex items-center justify-center mt-6">
        <TotvsMigrate
          employeeCpf={employee.CPF}
          approvedCount={approvedFields.length}
          hasApprovedFields={approvedFields.length > 0}
          onMigrateSuccess={() => {
            console.log('Migração concluída com sucesso!');
          }}
        />
      </div>

      {/* 📁 MODAL: Histórico de Arquivos */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📁</span>
                <h3 className="text-base font-bold text-slate-900">
                  Histórico de Arquivos Anexados
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-bold">
                  {historicalAttachments.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-3 flex-1 pr-1">
              {historicalAttachments.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs italic">
                  Nenhum arquivo histórico encontrado para solicitações já concluídas.
                </div>
              ) : (
                historicalAttachments.map((item, idx) => {
                  const statusStr = (item.requestStatus || '').toLowerCase();
                  let statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                  let statusLabel = item.requestStatus;

                  if (statusStr === 'approved' || statusStr === 'aprovado') {
                    statusBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                    statusLabel = 'APROVADO';
                  } else if (statusStr === 'rejected' || statusStr === 'recusado' || statusStr === 'negado') {
                    statusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
                    statusLabel = 'NEGADO';
                  } else if (statusStr === 'migrated' || statusStr === 'migrado') {
                    statusBadgeClass = 'bg-sky-50 text-sky-800 border-sky-200';
                    statusLabel = 'MIGRADO TOTVS';
                  }

                  return (
                    <div
                      key={item.attachment.id || idx}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 truncate">
                            📄 {item.attachment.original_filename}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({Math.round(item.attachment.size_bytes / 1024)} KB)
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono">
                          <span>Seção: <strong className="text-slate-700 capitalize">{item.sectionKey}</strong></span>
                          <span>·</span>
                          <span>Data: <strong className="text-slate-700">{item.dateStr}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`px-2.5 py-1 rounded-md text-[10px] uppercase font-bold border ${statusBadgeClass}`}>
                          {statusLabel}
                        </span>
                        <a
                          href={`/api/attachments/${item.attachment.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition shadow-2xs"
                        >
                          Visualizar
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 text-right">
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}