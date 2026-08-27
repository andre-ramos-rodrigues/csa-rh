'use client';

import { useState, useEffect } from 'react';
import { SECTION_LABELS } from '@/lib/change-request-section';

interface Employee {
  DESCRICAO: string;
  CODEQUIPE: string;
  NOME: string;
  CPF: string;
  EMAIL: string | string[];
  ESTADOCIVIL?: string;
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
}

interface Dependent {
  ID?: number | string;
  NRODEPEND?: number | string;
  NOME: string | string[];
  CPF: string | null;
  GRAUPARENTESCO?: string | number;
  GRAUPARENTESCODESC?: string;
  SEXO?: string;
  DATANASCIMENTO?: string;
  DTNASCIMENTO?: string;
  INCIRRF?: string | number;
  isExisting?: boolean;
  target_id?: string;
  [key: string]: any;
}

interface CategorizedFile {
  file: File;
  category: string;
}

interface AcademicFormation {
  ID?: number | string;
  CODENTIDADE?: number | string;
  ENTIDADE_NOMEFANTASIA?: string;
  CODCURSO?: number | string;
  CURSO_NOME?: string;
  CODGRAU?: number | string;
  GRAUINSTRUCAO_DESC?: string;
  DATAINICIO?: string;
  DATATERMINO?: string;
  SITUACAO?: string;
  isExisting?: boolean;
  [key: string]: any;
}

interface EmployeeEditDataProps {
  employee: Employee;
  resultDependentes?: Dependent[];
  resultFormacaoAcademica?: AcademicFormation[];
  existingRequest?: any;
}

export default function EmployeeEditData({
  employee,
  resultDependentes = [],
  existingRequest,
  resultFormacaoAcademica = [],
}: EmployeeEditDataProps) {
  const [editingSections, setEditingSections] = useState({
    identificacao: false,
    estadoCivil: false,
    escolaridade: false,
    endereco: false,
    contato: false,
    dependentes: false,
    formacaoAcademica: false,
  });

  const changeRequests: any[] = Array.isArray(existingRequest?.changeRequests)
    ? existingRequest.changeRequests
    : Array.isArray(existingRequest)
    ? existingRequest
    : existingRequest?.change_requests || [];

  const allFields: any[] = changeRequests.flatMap(
    (req) => req.fields || req.change_request_fields || []
  );

  const hasPendingRequest =
    changeRequests.some((req) => req.status === 'pending') ||
    allFields.some((f) => f.status === 'pending');

  const getCurrentlyRejectedFields = () => {
    if (allFields.length === 0) return [];

    const FIELD_LABELS: Record<string, string> = {
      ESTADOCIVIL: 'Estado Civil',
      GRAUINSTRUCAO: 'Grau de Instrução',
      RUA: 'Rua / Logradouro',
      NUMERO: 'Número',
      COMPLEMENTO: 'Complemento',
      BAIRRO: 'Bairro',
      CEP: 'CEP',
      CIDADE: 'Cidade',
      ESTADO: 'Estado (UF)',
      TELEFONE1: 'Telefone Principal',
      TELEFONE2: 'Telefone Secundário',
      EMAIL: 'E-mail(s)',
      DEPENDENTES: 'Lista de Dependentes',
      NOME: 'Nome Completo',
      FORMACAO_ACADEMICA: 'Formação Acadêmica',
    };

    const fieldsByName = new Map<string, any[]>();
    allFields.forEach((f) => {
      if (!f.field_name) return;
      const key = f.field_name.toUpperCase();
      if (!fieldsByName.has(key)) fieldsByName.set(key, []);
      fieldsByName.get(key)!.push(f);
    });

    const rejectedList: {
      key: string;
      label: string;
      newValue: string;
      reviewNotes: string | null;
    }[] = [];

    fieldsByName.forEach((fList, key) => {
      fList.sort((a, b) => Number(b.id) - Number(a.id));
      const latestField = fList[0];

      if (latestField && latestField.status === 'rejected') {
        rejectedList.push({
          key,
          label: FIELD_LABELS[key] || key,
          newValue: latestField.new_value,
          reviewNotes: latestField.review_notes || null,
        });
      }
    });

    return rejectedList;
  };

  const rejectedFields = getCurrentlyRejectedFields();

  const parseEmailsToArray = (emailData: string | string[] | undefined): string[] => {
    if (!emailData) return [''];
    if (Array.isArray(emailData)) return emailData.length > 0 ? emailData : [''];
    return (
      emailData
        .split(/[;,]/)
        .map((e) => e.trim())
        .filter((e) => e.length > 0) || ['']
    );
  };

  const getDependentName = (nome: string | string[]) => {
    if (Array.isArray(nome)) {
      return nome[0] || '';
    }
    return nome || '';
  };

  const [academicOptions, setAcademicOptions] = useState<{
    entidades: { CODENTIDADE: number | string; NOMEFANTASIA: string }[];
    cursos: { CODCURSO: number | string; CURSO_NOME: string }[];
    grausInstrucao: { CODGRAU: number | string; GRAUINSTRUCAO_DESC: string }[];
  }>({ entidades: [], cursos: [], grausInstrucao: [] });

  const [familyOptions, setFamilyOptions] = useState<{
    grausParentesco: { GRAUPARENTESCO: number | string; GRAUPARENTESCODESC: string }[];
  }>({ grausParentesco: [] });

  const [, setLoadingOptions] = useState(false);
  const [, setLoadingFamilyOptions] = useState(false);

  const [formData, setFormData] = useState({
    NOME: employee.NOME || '',
    ESTADOCIVIL: employee.ESTADOCIVIL || '',
    GRAUINSTRUCAO: employee.GRAUINSTRUCAO || '',
    RUA: employee.RUA || '',
    NUMERO: employee.NUMERO || '',
    COMPLEMENTO: employee.COMPLEMENTO || '',
    BAIRRO: employee.BAIRRO || '',
    CEP: employee.CEP || '',
    CIDADE: employee.CIDADE || '',
    ESTADO: employee.ESTADO || '',
    PAIS: employee.PAIS || 'Brasil',
    TELEFONE1: employee.TELEFONE1 || '',
    TELEFONE2: employee.TELEFONE2 || '',
  });

  const [emails, setEmails] = useState<string[]>(parseEmailsToArray(employee.EMAIL));

  // 👨‍👩‍👧 DEPENDENTES
  const [dependentsList, setDependentsList] = useState<Dependent[]>(
    resultDependentes.map((dep, idx) => ({
      ...dep,
      ID: dep.ID || `existente_${idx}`,
      NRODEPEND: dep.NRODEPEND ?? (idx + 1),
      NOME: getDependentName(dep.NOME),
      CPF: dep.CPF || '',
      GRAUPARENTESCO: dep.GRAUPARENTESCO || '',
      GRAUPARENTESCODESC: dep.GRAUPARENTESCODESC || '',
      SEXO: dep.SEXO || '',
      DATANASCIMENTO: dep.DATANASCIMENTO || dep.DTNASCIMENTO || '',
      INCIRRF: dep.INCIRRF ?? '0',
      isExisting: true,
      target_id: dep.target_id || 'OLD',
    }))
  );

  useEffect(() => {
    if (resultDependentes) {
      setDependentsList(
        resultDependentes.map((dep, idx) => ({
          ...dep,
          ID: dep.ID || `existente_${idx}`,
          NRODEPEND: dep.NRODEPEND ?? (idx + 1),
          NOME: getDependentName(dep.NOME),
          CPF: dep.CPF || '',
          GRAUPARENTESCO: dep.GRAUPARENTESCO || '',
          GRAUPARENTESCODESC: dep.GRAUPARENTESCODESC || '',
          SEXO: dep.SEXO || '',
          DATANASCIMENTO: dep.DATANASCIMENTO || dep.DTNASCIMENTO || '',
          INCIRRF: dep.INCIRRF ?? '0',
          isExisting: true,
          target_id: dep.target_id || 'OLD',
        }))
      );
    }
  }, [resultDependentes]);

  useEffect(() => {
    const fetchFamilyOptions = async () => {
      setLoadingFamilyOptions(true);
      try {
        const res = await fetch('/api/family');
        const json = await res.json();
        if (json.success) {
          const list = Array.isArray(json.data) ? json.data : json.data?.grausParentesco || [];
          setFamilyOptions({ grausParentesco: list });
        }
      } catch (err) {
        console.error('Erro ao carregar opções de parentesco:', err);
      } finally {
        setLoadingFamilyOptions(false);
      }
    };

    fetchFamilyOptions();
  }, []);

  const handleDependentChange = (index: number, field: string, value: any) => {
    setDependentsList((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleDependentParentescoChange = (index: number, selectedCode: string) => {
    setDependentsList((prev) => {
      const updated = [...prev];

      const item = familyOptions.grausParentesco.find(
        (g) => String(g.GRAUPARENTESCO) === selectedCode
      );

      updated[index] = {
        ...updated[index],
        GRAUPARENTESCO: item ? item.GRAUPARENTESCO : '',
        GRAUPARENTESCODESC: item ? item.GRAUPARENTESCODESC : '',
      };

      return updated;
    });
  };

  const handleAddDependent = () => {
    setDependentsList((prev) => {
      const maxNro = prev.reduce((max, dep) => {
        const num = Number(dep.NRODEPEND);
        return !isNaN(num) && num > max ? num : max;
      }, 0);

      return [
        ...prev,
        {
          ID: `novo_dependente_${Date.now()}`,
          NRODEPEND: maxNro + 1,
          NOME: '',
          CPF: '',
          GRAUPARENTESCO: '',
          GRAUPARENTESCODESC: '',
          SEXO: '',
          DATANASCIMENTO: '',
          INCIRRF: '0',
          isExisting: false,
          target_id: 'NEW',
        },
      ];
    });
  };

  const handleRemoveDependent = (index: number) => {
    setDependentsList((prev) => prev.filter((_, i) => i !== index));
  };

  // 🎓 FORMAÇÃO ACADÊMICA
  const [formacaoList, setFormacaoList] = useState<AcademicFormation[]>(
    resultFormacaoAcademica.map((f, idx) => ({
      ...f,
      ID: f.ID || `existente_${idx}`,
      CODENTIDADE: f.CODENTIDADE || '',
      ENTIDADE_NOMEFANTASIA: f.ENTIDADE_NOMEFANTASIA || '',
      CODCURSO: f.CODCURSO || '',
      CURSO_NOME: f.CURSO_NOME || '',
      CODGRAU: f.CODGRAU || '',
      GRAUINSTRUCAO_DESC: f.GRAUINSTRUCAO_DESC || '',
      DATAINICIO: f.DATAINICIO || '',
      DATATERMINO: f.DATATERMINO || '',
      SITUACAO: f.SITUACAO || 'Cursando',
      isExisting: true,
    }))
  );

  useEffect(() => {
    if (resultFormacaoAcademica) {
      setFormacaoList(
        resultFormacaoAcademica.map((f, idx) => ({
          ...f,
          ID: f.ID || `existente_${idx}`,
          CODENTIDADE: f.CODENTIDADE || '',
          ENTIDADE_NOMEFANTASIA: f.ENTIDADE_NOMEFANTASIA || '',
          CODCURSO: f.CODCURSO || '',
          CURSO_NOME: f.CURSO_NOME || '',
          CODGRAU: f.CODGRAU || '',
          GRAUINSTRUCAO_DESC: f.GRAUINSTRUCAO_DESC || '',
          DATAINICIO: f.DATAINICIO || '',
          DATATERMINO: f.DATATERMINO || '',
          SITUACAO: f.SITUACAO || 'Cursando',
          isExisting: true,
        }))
      );
    }
  }, [resultFormacaoAcademica]);

  useEffect(() => {
    const fetchAcademicOptions = async () => {
      setLoadingOptions(true);
      try {
        const res = await fetch('/api/academics');
        const json = await res.json();
        if (json.success) {
          setAcademicOptions(json.data);
        }
      } catch (err) {
        console.error('Erro ao carregar opções acadêmicas:', err);
      } finally {
        setLoadingOptions(false);
      }
    };

    fetchAcademicOptions();
  }, []);

const handleFormacaoSelectChange = (
  index: number,
  type: 'ENTIDADE' | 'CURSO' | 'GRAU',
  selectedId: string
) => {
  setFormacaoList((prev) => {
    const updated = [...prev];

    // 🛑 Trava de segurança: impede edição de registros já existentes
    if (updated[index]?.isExisting) return prev;

    if (type === 'ENTIDADE') {
      const item = academicOptions?.entidades?.find(
        (e) => String(e.CODENTIDADE) === selectedId
      );
      updated[index] = {
        ...updated[index],
        CODENTIDADE: item ? item.CODENTIDADE : '',
        ENTIDADE_NOMEFANTASIA: item ? item.NOMEFANTASIA : '',
      };
    } else if (type === 'CURSO') {
      const item = academicOptions?.cursos?.find(
        (c) => String(c.CODCURSO) === selectedId
      );
      updated[index] = {
        ...updated[index],
        CODCURSO: item ? item.CODCURSO : '',
        CURSO_NOME: item ? item.CURSO_NOME : '',
      };
    } else if (type === 'GRAU') {
      const item = academicOptions?.grausInstrucao?.find(
        (g) => String(g.CODGRAU) === selectedId
      );
      updated[index] = {
        ...updated[index],
        CODGRAU: item ? item.CODGRAU : '',
        GRAUINSTRUCAO_DESC: item ? item.GRAUINSTRUCAO_DESC : '',
      };
    }

    return updated;
  });
};

  const handleAddFormacao = () => {
    setFormacaoList((prev) => [
      ...prev,
      {
        ID: `novo_curso_${Date.now()}`,
        CODENTIDADE: '',
        ENTIDADE_NOMEFANTASIA: '',
        CODCURSO: '',
        CURSO_NOME: '',
        CODGRAU: '',
        GRAUINSTRUCAO_DESC: '',
        DATAINICIO: '',
        DATATERMINO: '',
        SITUACAO: 'Cursando',
        isExisting: false,
      },
    ]);
  };

  const handleRemoveFormacao = (index: number) => {
    const curso = formacaoList[index];
    if (curso) {
      const courseKey = `formacao_academica_${curso.ID || index}`;
      setAttachments((prev) => prev.filter((a) => a.category !== courseKey));
    }
    setFormacaoList((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddFilesForCourse = (
    e: React.ChangeEvent<HTMLInputElement>,
    courseId: string | number
  ) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const category = `formacao_academica_${courseId}`;
    const newAttachments: CategorizedFile[] = selectedFiles.map((file) => ({
      file,
      category,
    }));

    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = '';
  };

  const [attachments, setAttachments] = useState<CategorizedFile[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPendingModalOpen, setIsPendingModalOpen] = useState(false);
  const [isRejectedModalOpen, setIsRejectedModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleSection = (section: keyof typeof editingSections) => {
    setEditingSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEmailChange = (index: number, value: string) => {
    setEmails((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleAddEmail = () => setEmails((prev) => [...prev, '']);
  const handleRemoveEmail = (index: number) => setEmails((prev) => prev.filter((_, i) => i !== index));

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>, category: string) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const newAttachments: CategorizedFile[] = selectedFiles.map((file) => ({
      file,
      category,
    }));

    setAttachments((prev) => [...prev, ...newAttachments]);
    e.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

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

  // 📝 GERAÇÃO DAS ALTERAÇÕES MODIFICADAS
  const getModifiedFields = () => {
    const changes: { field: string; label: string; oldVal: string; newVal: string }[] = [];

    const fieldLabels: Record<string, string> = {
      NOME: 'Nome Completo',
      ESTADOCIVIL: 'Estado Civil',
      GRAUINSTRUCAO: 'Grau de Instrução',
      RUA: 'Rua / Logradouro',
      NUMERO: 'Número',
      COMPLEMENTO: 'Complemento',
      BAIRRO: 'Bairro',
      CEP: 'CEP',
      CIDADE: 'Cidade',
      ESTADO: 'Estado (UF)',
      TELEFONE1: 'Telefone Principal',
      TELEFONE2: 'Telefone Secundário',
    };

    // 1. E-mails
    const originalEmails = parseEmailsToArray(employee.EMAIL).filter((e) => e.trim() !== '');
    const currentEmails = emails.filter((e) => e.trim() !== '');

    if (JSON.stringify(originalEmails) !== JSON.stringify(currentEmails)) {
      changes.push({
        field: 'EMAIL',
        label: 'E-mail(s)',
        oldVal: originalEmails.length ? originalEmails.join(', ') : '(Vazio)',
        newVal: currentEmails.length ? currentEmails.join(', ') : '(Vazio)',
      });
    }

    // 2. Campos Simples
    Object.keys(fieldLabels).forEach((key) => {
      const orig = String((employee as any)[key] || '').trim();
      const curr = String((formData as any)[key] || '').trim();

      if (orig !== curr) {
        changes.push({
          field: key,
          label: fieldLabels[key],
          oldVal: orig || '(Vazio)',
          newVal: curr || '(Vazio)',
        });
      }
    });

    // 3. DEPENDENTES
    const normalizedCurrentDependents = dependentsList.map((dep, idx) => ({
      ID: dep.ID,
      NRODEPEND: dep.NRODEPEND ? String(dep.NRODEPEND) : String(idx + 1),
      NOME: String(getDependentName(dep.NOME) || '').trim(),
      CPF: String(dep.CPF || '').trim(),
      GRAUPARENTESCO: dep.GRAUPARENTESCO ? String(dep.GRAUPARENTESCO) : null,
      GRAUPARENTESCODESC: String(dep.GRAUPARENTESCODESC || '').trim(),
      SEXO: String(dep.SEXO || '').trim(),
      DATANASCIMENTO: String(dep.DATANASCIMENTO || dep.DTNASCIMENTO || '').trim(),
      INCIRRF: String(dep.INCIRRF ?? '0').trim(),
      isExisting: !!dep.isExisting,
      target_id: dep.isExisting ? 'OLD' : 'NEW',
    }));

    const normalizedOriginalDependents = resultDependentes.map((dep, idx) => ({
      ID: dep.ID || `existente_${idx}`,
      NRODEPEND: dep.NRODEPEND ? String(dep.NRODEPEND) : String(idx + 1),
      NOME: String(getDependentName(dep.NOME) || '').trim(),
      CPF: String(dep.CPF || '').trim(),
      GRAUPARENTESCO: dep.GRAUPARENTESCO ? String(dep.GRAUPARENTESCO) : null,
      GRAUPARENTESCODESC: String(dep.GRAUPARENTESCODESC || '').trim(),
      SEXO: String(dep.SEXO || '').trim(),
      DATANASCIMENTO: String(dep.DATANASCIMENTO || dep.DTNASCIMENTO || '').trim(),
      INCIRRF: String(dep.INCIRRF ?? '0').trim(),
      isExisting: true,
      target_id: 'OLD',
    }));

    const dependentsHasChanged =
      JSON.stringify(normalizedOriginalDependents) !== JSON.stringify(normalizedCurrentDependents);

    if (dependentsHasChanged) {
      changes.push({
        field: 'DEPENDENTES',
        label: 'Lista de Dependentes',
        oldVal:
          normalizedOriginalDependents.length > 0
            ? JSON.stringify(normalizedOriginalDependents)
            : '(Nenhum)',
        newVal: JSON.stringify(normalizedCurrentDependents),
      });
    }

    // 4. Formação Acadêmica (Novos cursos adicionados)
    const newCourses = formacaoList.filter((f) => !f.isExisting);

    if (newCourses.length > 0) {
      const normalizedNewCourses = newCourses.map((f) => ({
        CODENTIDADE: f.CODENTIDADE || null,
        ENTIDADE_NOMEFANTASIA: String(f.ENTIDADE_NOMEFANTASIA || '').trim(),
        CODCURSO: f.CODCURSO || null,
        CURSO_NOME: String(f.CURSO_NOME || '').trim(),
        CODGRAU: f.CODGRAU || null,
        GRAUINSTRUCAO_DESC: String(f.GRAUINSTRUCAO_DESC || '').trim(),
        DATAINICIO: String(f.DATAINICIO || '').trim(),
        DATATERMINO: String(f.DATATERMINO || '').trim(),
        SITUACAO: String(f.SITUACAO || '').trim(),
      }));

      changes.push({
        field: 'FORMACAO_ACADEMICA',
        label: 'Formação Acadêmica',
        oldVal: 'Nenhum',
        newVal: JSON.stringify(normalizedNewCourses),
      });
    }

    return changes;
  };

  const modifiedFields = getModifiedFields();
  const hasChanges = modifiedFields.length > 0 || attachments.length > 0;

  // 🔒 VALIDAÇÕES ANTES DE ABRIR O MODAL DE REVISÃO
  const handleOpenReview = () => {
    if (!hasChanges) {
      alert('Nenhuma alteração ou anexo foi realizado.');
      return;
    }

    const modifiedFieldNames = modifiedFields.map((m) => m.field);

    // Validação dos Cursos da API
    if (modifiedFieldNames.includes('FORMACAO_ACADEMICA')) {
      const invalidCourses = formacaoList.filter(
        (c) => !c.isExisting && (!c.CODENTIDADE || !c.CODCURSO || !c.CODGRAU)
      );

      if (invalidCourses.length > 0) {
        alert(
          'Por favor, selecione a Instituição, o Curso e o Grau de Instrução a partir das opções da lista para todos os novos cursos.'
        );
        return;
      }
    }

    // Validação de Parentesco para Dependentes
    if (modifiedFieldNames.includes('DEPENDENTES')) {
      const invalidDependents = dependentsList.filter(
        (d) => !d.GRAUPARENTESCO || String(d.GRAUPARENTESCO).trim() === ''
      );

      if (invalidDependents.length > 0) {
        alert(
          'Por favor, selecione o Grau de Parentesco a partir das opções da lista para todos os dependentes.'
        );
        return;
      }
    }

    const requiresIdentificacao = modifiedFieldNames.includes('NOME');
    const requiresEstadoCivil = modifiedFieldNames.includes('ESTADOCIVIL');
    const requiresEscolaridade = modifiedFieldNames.includes('GRAUINSTRUCAO');
    const requiresEndereco = modifiedFieldNames.some((f) =>
      ['RUA', 'NUMERO', 'COMPLEMENTO', 'BAIRRO', 'CEP', 'CIDADE', 'ESTADO'].includes(f)
    );

    const hasIdentificacaoAtt = attachments.some((a) => a.category === 'identificacao');
    const hasEstadoCivilAtt = attachments.some((a) => a.category === 'estado_civil');
    const hasEscolaridadeAtt = attachments.some((a) => a.category === 'escolaridade');
    const hasEnderecoAtt = attachments.some((a) => a.category === 'endereco');

    // Mapeia dependentes marcados com IRPF = SIM que ainda não possuem anexo correspondente
    const unattachedIrpfDependents = dependentsList.filter((dep, idx) => {
      const isIrpf = dep.INCIRRF === 1 || dep.INCIRRF === '1';
      const isNew = !dep.isExisting;

      if (!isIrpf && !isNew) return false;

      const depId = dep.ID || idx;
      const depKey = `dependentes_${depId}`;

      return !attachments.some((a) => a.category === depKey);
    });

    const missingRules: string[] = [];

    if (modifiedFieldNames.includes('FORMACAO_ACADEMICA')) {
      const unattachedNewCourses = formacaoList.filter((curso, idx) => {
        if (curso.isExisting) return false;
        const courseKey = `formacao_academica_${curso.ID || idx}`;
        return !attachments.some((a) => a.category === courseKey);
      });

      if (unattachedNewCourses.length > 0) {
        missingRules.push(
          `• Formação Acadêmica: É obrigatório anexar o comprovante/diploma para cada NOVO curso adicionado (${unattachedNewCourses.length} curso(s) sem anexo).`
        );
      }
    }

    if (requiresIdentificacao && !hasIdentificacaoAtt) {
      missingRules.push('• Identificação: É obrigatório anexar comprovante de RG/CNH.');
    }
    if (requiresEstadoCivil && !hasEstadoCivilAtt) {
      missingRules.push('• Estado Civil: É obrigatório anexar a certidão correspondente.');
    }
    if (requiresEscolaridade && !hasEscolaridadeAtt) {
      missingRules.push('• Escolaridade: É obrigatório anexar o certificado/diploma.');
    }
    if (requiresEndereco && !hasEnderecoAtt) {
      missingRules.push('• Endereço: É obrigatório anexar o comprovante de residência.');
    }

    if (modifiedFieldNames.includes('DEPENDENTES') && unattachedIrpfDependents.length > 0) {
      missingRules.push(
        `• Dependentes: É obrigatório anexar a certidão/CPF para cada dependente com Incide IRPF = SIM e Para cada dependente novo (${unattachedIrpfDependents.length} dependente(s) sem anexo).`
      );
    }

    if (missingRules.length > 0) {
      alert(
        `Atenção: O anexo de comprovante é obrigatório para as alterações realizadas nas seguintes seções:\n\n${missingRules.join(
          '\n'
        )}`
      );
      return;
    }

    setIsModalOpen(true);
  };

// 🎓👨‍👩‍👧‍👦 Renderizador inteligente de itens para o Modal de Confirmação
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

const renderModalItem = (
  item: { field: string; label: string; oldVal?: string; newVal: string },
  idx: number
) => {
  const parsedNew = parseJsonSafe(item.newVal);
  const parsedOld = parseJsonSafe(item.oldVal);

  const isJson =
    parsedNew !== null ||
    item.field === 'DEPENDENTES' ||
    item.field.toUpperCase().includes('DEPENDENTE') ||
    item.field === 'FORMACAO_ACADEMICA' ||
    item.field.toUpperCase().includes('FORMACAO');

  if (isJson) {
    const arrayNew = Array.isArray(parsedNew) ? parsedNew : parsedNew ? [parsedNew] : [];
    const arrayOld = Array.isArray(parsedOld) ? parsedOld : parsedOld ? [parsedOld] : [];
    const fieldUpper = item.field.toUpperCase();

    // 1. 🎓 FORMAÇÃO ACADÊMICA
    if (fieldUpper.includes('FORMACAO') || fieldUpper.includes('ACADEMICA')) {
      const oldMap = new Map<string, any>();
      arrayOld.forEach((o: any) => {
        const k = String(o.ID || o.CURSO_NOME || o.curso_nome || o.CODCURSO || '').toLowerCase().trim();
        if (k) oldMap.set(k, o);
      });

      const changedOrNewCursos = arrayNew.filter((n: any) => {
        const k = String(n.ID || n.CURSO_NOME || n.curso_nome || n.CODCURSO || '').toLowerCase().trim();
        const o = oldMap.get(k);
        if (!o) return true;

        return (
          String(o.CURSO_NOME || o.curso_nome || '').trim() !== String(n.CURSO_NOME || n.curso_nome || '').trim() ||
          String(o.ENTIDADE_NOMEFANTASIA || o.instituicao || '').trim() !== String(n.ENTIDADE_NOMEFANTASIA || n.instituicao || '').trim() ||
          String(o.GRAUINSTRUCAO_DESC || o.nivel || '').trim() !== String(n.GRAUINSTRUCAO_DESC || n.nivel || '').trim() ||
          String(o.SITUACAO || o.situacao || '').trim() !== String(n.SITUACAO || n.situacao || '').trim()
        );
      });

      const cursosToRender = changedOrNewCursos.length > 0 ? changedOrNewCursos : arrayNew;

      return (
        <div key={idx} className="space-y-2">
          <span className="font-bold text-cyan-700 text-xs block">{item.label}</span>
          {cursosToRender.map((curso: any, cIdx: number) => {
            const k = String(curso.ID || curso.CURSO_NOME || curso.curso_nome || curso.CODCURSO || '').toLowerCase().trim();
            const isNew = !oldMap.has(k);

            const cursoNome = curso.CURSO_NOME || curso.curso_nome || 'Curso';
            const instituicao = curso.ENTIDADE_NOMEFANTASIA || curso.instituicao || '--';
            const nivel = curso.GRAUINSTRUCAO_DESC || curso.nivel || '--';
            const situacao = curso.SITUACAO || curso.situacao || '--';

            return (
              <div key={cIdx} className="p-3 bg-sky-50/70 rounded-xl border border-sky-200 text-xs space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-sky-200/60 pb-1">
                  <span className="font-bold text-slate-800">🎓 {cursoNome}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    isNew ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-sky-100 text-sky-800 border border-sky-300'
                  }`}>
                    {isNew ? 'NOVA FORMAÇÃO' : 'ALTERADO'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400">Instituição: </span>
                    <strong className="text-slate-700">{instituicao}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Nível: </span>
                    <strong className="text-slate-700">{nivel}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Situação: </span>
                    <strong className="text-slate-700">{situacao}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // 2. 👥 DEPENDENTES
    if (fieldUpper.includes('DEPENDENTE')) {
      const oldMap = new Map<string, any>();
      arrayOld.forEach((o: any) => {
        const k = String(o.ID || o.CPF || o.NOME || '').toLowerCase().trim();
        if (k) oldMap.set(k, o);
      });

      const changedOrNewItems = arrayNew.filter((n: any) => {
        const k = String(n.ID || n.CPF || n.NOME || '').toLowerCase().trim();
        const o = oldMap.get(k);
        if (!o) return true;

        return (
          String(o.NOME || '').trim() !== String(n.NOME || '').trim() ||
          String(o.GRAUPARENTESCODESC || o.GRAUPARENTESCO || '').trim() !== String(n.GRAUPARENTESCODESC || n.GRAUPARENTESCO || '').trim() ||
          String(o.CPF || '').trim() !== String(n.CPF || '').trim() ||
          String(o.INCIRRF || '').trim() !== String(n.INCIRRF || '').trim()
        );
      });

      const itemsToRender = changedOrNewItems.length > 0 ? changedOrNewItems : arrayNew;

      return (
        <div key={idx} className="space-y-2">
          <span className="font-bold text-cyan-700 text-xs block">{item.label}</span>
          {itemsToRender.map((dep: any, dIdx: number) => {
            const k = String(dep.ID || dep.CPF || dep.NOME || '').toLowerCase().trim();
            const oldDep = oldMap.get(k);
            const isNew = !oldDep;

            const name = dep.NOME || 'Sem nome';
            const parentesco = dep.GRAUPARENTESCODESC || dep.GRAUPARENTESCO || '--';
            const rawCpf = String(dep.CPF || '').replace(/\D/g, '');
            const formattedCpf = rawCpf.length === 11 
              ? rawCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') 
              : '--';

            const newIrrf = dep.INCIRRF === 1 || dep.INCIRRF === '1' || dep.INCIRRF === true ? 'SIM' : 'NÃO';
            const oldIrrf = oldDep 
              ? (oldDep.INCIRRF === 1 || oldDep.INCIRRF === '1' || oldDep.INCIRRF === true ? 'SIM' : 'NÃO') 
              : null;

            return (
              <div key={dIdx} className="p-3 bg-amber-50/70 rounded-xl border border-amber-200 text-xs space-y-1.5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-1">
                  <span className="font-bold text-slate-800">👤 {name}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                    isNew ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-sky-100 text-sky-800 border border-sky-300'
                  }`}>
                    {isNew ? 'NOVO DEPENDENTE' : 'ALTERADO'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600">
                  <div>
                    <span className="text-slate-400">Parentesco: </span>
                    <strong className="text-slate-700">{parentesco}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400">CPF: </span>
                    <strong className="text-slate-700 font-mono">{formattedCpf}</strong>
                  </div>
                </div>

                <div className="text-[11px] pt-1 border-t border-amber-200/40 flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Incide IRPF:</span>
                  {oldDep && oldIrrf !== newIrrf ? (
                    <>
                      <span className="text-slate-400 line-through">{oldIrrf}</span>
                      <span className="text-slate-400">→</span>
                      <span className="font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">{newIrrf}</span>
                    </>
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

    // 3. 🏠 OBJETO JSON GENÉRICO (Ex: Endereço)
    if (parsedNew && typeof parsedNew === 'object' && !Array.isArray(parsedNew)) {
      return (
        <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5">
          <span className="font-bold text-cyan-700 block">{item.label}</span>
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {Object.entries(parsedNew).map(([k, v]) => (
              <div key={k} className="flex flex-col">
                <span className="text-slate-400 uppercase text-[9px]">{k}:</span>
                <span className="font-medium text-slate-800">{String(v || '--')}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
  }

  // 4. 📄 CAMPO PADRÃO (Texto simples)
  return (
    <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
      <span className="font-bold text-cyan-700">{item.label}</span>
      <div className="flex flex-col gap-1">
        {item.oldVal && <span className="text-slate-400 line-through">De: {item.oldVal}</span>}
        <span className="text-emerald-700 font-semibold break-all">Para: {item.newVal}</span>
      </div>
    </div>
  );
};

  const handleSubmitRequest = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const payload = new FormData();
      payload.append('employeeCpf', employee.CPF.replace(/\D/g, ''));
      payload.append('changes', JSON.stringify(modifiedFields));

      const categoriesList: string[] = [];
      attachments.forEach((item) => {
        payload.append('attachments', item.file);
        categoriesList.push(item.category);
      });
      payload.append('attachmentCategories', JSON.stringify(categoriesList));

      const res = await fetch('/api/change-request/submit', {
        method: 'POST',
        body: payload,
      });

      const data = await res.json();

      if (data.success) {
        window.location.reload();
      } else {
        setErrorMessage(data.error || 'Erro ao enviar solicitação.');
      }
    } catch (err) {
      setErrorMessage('Falha na comunicação com o servidor.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="w-full max-w-4xl shrink-0 mx-auto bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      {/* Mensagem de sucesso */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center justify-between">
          <span>✅ {successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 underline font-medium cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* ⏳ Banner de Pedido Pendente */}
      {hasPendingRequest && !successMessage && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span>
              Você possui solicitações de alteração pendentes sob análise do RH.
            </span>
          </div>
          <button
            onClick={() => setIsPendingModalOpen(true)}
            className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg text-amber-900 text-xs font-semibold transition shrink-0 cursor-pointer"
          >
            Exibir
          </button>
        </div>
      )}

{/* 🔴 Banner de Solicitações Recusadas */}
{rejectedFields.length > 0 && !successMessage && (
  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 text-xs flex items-center justify-between gap-3">
    <div className="flex items-center gap-3">
      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
      <span>
        {rejectedFields.length === 1
          ? 'Você possui 1 solicitação de alteração recusada pelo RH.'
          : `Você possui ${rejectedFields.length} solicitações de alteração recusadas pelo RH.`}
      </span>
    </div>
    <button
      onClick={() => setIsRejectedModalOpen(true)}
      className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 border border-rose-300 rounded-lg text-rose-900 text-xs font-semibold transition shrink-0 cursor-pointer"
    >
      Exibir
    </button>
  </div>
)}

  {/* Cabeçalho */}
  <div className="flex items-center justify-between pb-4 border-b border-slate-200">
    <div>
      <h2 className="text-xl font-bold text-slate-900">Meus Dados Cadastrais</h2>
      <p className="text-xs text-slate-500">Clique no ícone ✏️ para alterar seus dados e enviar para o RH.</p>
    </div>
    <span className="px-2.5 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-700 text-xs font-medium">
      Área do Colaborador
    </span>
  </div>

  {/* Cartão de Identificação (Com opção de editar Nome) */}
  <div className="p-6 bg-slate-50/60 border border-slate-200 rounded-xl space-y-4">
    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center font-bold text-white text-lg shadow-sm">
          {(formData.NOME || employee.NOME)?.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-xs text-slate-500 font-mono">CPF: {employee.CPF}</p>
          <p className="text-xs text-slate-500">Lotação: {employee.DESCRICAO || '--'}</p>
        </div>
      </div>
      <button
        onClick={() => toggleSection('identificacao')}
        className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 transition flex items-center gap-1 font-medium shadow-sm"
      >
        ✏️ {editingSections.identificacao ? 'Concluir Edição' : 'Editar Nome'}
      </button>
    </div>

    {editingSections.identificacao ? (
      <div>
        <label className="block text-xs text-slate-600 font-medium mb-1">Nome Completo</label>
        <input
          type="text"
          name="NOME"
          value={formData.NOME}
          onChange={handleChange}
          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
        />
      </div>
    ) : (
      <div>
        <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">Nome Completo</span>
        <span className="text-base font-bold text-slate-900">{formData.NOME || '--'}</span>
      </div>
    )}

    <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
      <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs text-cyan-700 transition font-medium shadow-sm">
        📎 Anexar Comprovante de Identificação (RG/CNH) <span className="text-rose-600 font-bold">*</span>
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleAddFiles(e, 'identificacao')}
        />
      </label>
    </div>
  </div>

  {/* 💍 SEÇÃO: Estado Civil */}
  <div className="p-6 bg-slate-50/60 border border-slate-200 rounded-xl space-y-4">
    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
      <h3 className="text-sm font-bold text-cyan-700 uppercase tracking-wider">
        💍 Estado Civil
      </h3>
      <button
        onClick={() => toggleSection('estadoCivil')}
        className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 transition flex items-center gap-1 font-medium shadow-sm"
      >
        ✏️ {editingSections.estadoCivil ? 'Concluir Edição' : 'Editar'}
      </button>
    </div>

    {editingSections.estadoCivil ? (
      <div className="max-w-xs">
        <label className="block text-xs text-slate-600 font-medium mb-1">Estado Civil</label>
        <select
          name="ESTADOCIVIL"
          value={formData.ESTADOCIVIL}
          onChange={handleChange}
          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
        >
          <option value="">Selecione...</option>
          <option value="Solteiro(a)">Solteiro(a)</option>
          <option value="Casado(a)">Casado(a)</option>
          <option value="União Estável">União Estável</option>
          <option value="Divorciado(a)">Divorciado(a)</option>
          <option value="Viúvo(a)">Viúvo(a)</option>
          <option value="Separado(a)">Separado(a)</option>
        </select>
      </div>
    ) : (
      <div>
        <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">Estado Civil</span>
        <span className="text-sm text-slate-800">{formData.ESTADOCIVIL || '--'}</span>
      </div>
    )}

    <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
      <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs text-cyan-700 transition font-medium shadow-sm">
        📎 Anexar Certidão (Casamento/Divórcio/União Estável) <span className="text-rose-600 font-bold">*</span>
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleAddFiles(e, 'estado_civil')}
        />
      </label>
    </div>
  </div>

  {/* 🎓 SEÇÃO 1: Escolaridade */}
  {/* 🎓 SEÇÃO 1: Escolaridade */}
<div className="p-6 bg-slate-50/60 border border-slate-200 rounded-xl space-y-4">
  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
    <h3 className="text-sm font-bold text-cyan-700 uppercase tracking-wider">
      🎓 Escolaridade
    </h3>
    <button
      onClick={() => toggleSection('escolaridade')}
      className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 transition flex items-center gap-1 font-medium shadow-sm"
    >
      ✏️ {editingSections.escolaridade ? 'Concluir Edição' : 'Editar'}
    </button>
  </div>

  {editingSections.escolaridade ? (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-xs text-slate-600 font-medium mb-1">Grau de Instrução</label>
        <select
          name="GRAUINSTRUCAO"
          value={formData.GRAUINSTRUCAO}
          onChange={handleChange}
          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
        >
          <option value="">Selecione...</option>
          <option value="Ensino Médio Incompleto">Ensino Médio Incompleto</option>
          <option value="Ensino Médio Completo">Ensino Médio Completo</option>
          <option value="Superior Incompleto">Superior Incompleto</option>
          <option value="Superior Completo">Superior Completo</option>
          <option value="Pós-Graduação / Especialização">Pós-Graduação / Especialização</option>
          <option value="Mestrado">Mestrado</option>
          <option value="Doutorado">Doutorado</option>
        </select>
      </div>
    </div>
  ) : (
    <div>
      <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">Grau de Instrução</span>
      <span className="text-sm text-slate-800">{formData.GRAUINSTRUCAO || '--'}</span>
    </div>
  )}

  {/* Sub-bloco: Formação Acadêmica (cursos) */}
{/* 📚 SEÇÃO: Formação Acadêmica */}
<div className="p-6 bg-slate-50/60 border border-slate-200 rounded-xl space-y-4">
  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
    <h3 className="text-sm font-bold text-cyan-700 uppercase tracking-wider flex items-center gap-2">
      📚 Formação Acadêmica
      <span className="px-2 py-0.5 bg-slate-200 rounded-full text-slate-700 text-xs font-semibold">
        {formacaoList.length}
      </span>
    </h3>
    <button
      type="button"
      onClick={() => toggleSection('formacaoAcademica')}
      className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 transition flex items-center gap-1 font-medium shadow-sm cursor-pointer"
    >
      ✏️ {editingSections.formacaoAcademica ? 'Concluir' : 'Gerenciar / Adicionar Cursos'}
    </button>
  </div>

  {editingSections.formacaoAcademica ? (
    <div className="space-y-4">
  {formacaoList.map((curso, index) => {
    const courseId = curso.ID || index;
    const courseKey = `formacao_academica_${courseId}`;
    const courseAttachments = attachments.filter((a) => a.category === courseKey);

    // 🟢 SE FOR CURSO DA BASE: Exibe como SOMENTE LEITURA
    if (curso.isExisting) {
      return (
        <div
          key={courseId}
          className="p-4 bg-slate-100/80 border border-slate-200 rounded-xl space-y-1 relative"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              🔒 Curso Cadastrado na Base (Não editável)
            </span>
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded-md">
              Verificado
            </span>
          </div>
          <p className="text-sm font-bold text-slate-800">
            {curso.CURSO_NOME || 'Curso não informado'}
          </p>
          <p className="text-xs text-slate-600">
            {curso.ENTIDADE_NOMEFANTASIA || 'Instituição não informada'} •{' '}
            {curso.GRAUINSTRUCAO_DESC || 'Grau não informado'}
          </p>
        </div>
      );
    }

    // 🔵 SE FOR UM NOVO CURSO: Permite EDIÇÃO salvando CÓDIGOS + NOMES
    return (
      <div
  key={courseId}
  className="p-4 bg-white border border-cyan-200 rounded-xl space-y-3 relative shadow-sm"
>
  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
    <span className="text-xs font-bold text-cyan-700 flex items-center gap-1">
      ✨ Novo Curso #{index + 1}
    </span>
    <button
      type="button"
      onClick={() => handleRemoveFormacao(index)}
      className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 cursor-pointer"
    >
      🗑️ Remover Novo Curso
    </button>
  </div>

  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    {/* Nome do Curso */}
    <div>
      <label className="block text-xs text-slate-600 font-medium mb-1">
        Nome do Curso <span className="text-rose-600">*</span>
      </label>
      {academicOptions?.cursos && academicOptions.cursos.length > 0 ? (
        <select
          value={String(curso.CODCURSO ?? '')}
          onChange={(e) => handleFormacaoSelectChange(index, 'CURSO', e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-cyan-600 outline-none transition cursor-pointer"
        >
          <option value="">Selecione o Curso...</option>
          {academicOptions.cursos.map((c) => (
            <option key={c.CODCURSO} value={String(c.CODCURSO)}>
              {c.CURSO_NOME}
            </option>
          ))}
        </select>
      ) : (
        <span>Erro ao carregar opções de cursos da base da totvs</span>
      )}
    </div>

    {/* Instituição / Entidade */}
    <div>
      <label className="block text-xs text-slate-600 font-medium mb-1">
        Instituição / Entidade <span className="text-rose-600">*</span>
      </label>
      {academicOptions?.entidades && academicOptions.entidades.length > 0 ? (
        <select
          value={String(curso.CODENTIDADE ?? '')}
          onChange={(e) => handleFormacaoSelectChange(index, 'ENTIDADE', e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-cyan-600 outline-none transition cursor-pointer"
        >
          <option value="">Selecione a Instituição...</option>
          {academicOptions.entidades.map((ent) => (
            <option key={ent.CODENTIDADE} value={String(ent.CODENTIDADE)}>
              {ent.NOMEFANTASIA}
            </option>
          ))}
        </select>
      ) : (
        <span>Erro ao carregar opções de cursos da base da totvs</span>
      )}
    </div>

    {/* Grau de Instrução */}
    <div>
      <label className="block text-xs text-slate-600 font-medium mb-1">
        Grau de Instrução <span className="text-rose-600">*</span>
      </label>
      {academicOptions?.grausInstrucao && academicOptions.grausInstrucao.length > 0 ? (
        <select
          value={String(curso.CODGRAU ?? '')}
          onChange={(e) => handleFormacaoSelectChange(index, 'GRAU', e.target.value)}
          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-cyan-600 outline-none transition cursor-pointer"
        >
          <option value="">Selecione o Grau...</option>
          {academicOptions.grausInstrucao.map((g) => (
            <option key={g.CODGRAU} value={String(g.CODGRAU)}>
              {g.GRAUINSTRUCAO_DESC}
            </option>
          ))}
        </select>
      ) : (
        <span>Erro ao carregar opções de cursos da base da totvs</span>
      )}
    </div>
  </div>

  {/* 📎 BOTÃO DE ANEXO DE DIPLOMA */}
  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg text-xs text-cyan-800 transition font-medium shadow-sm w-fit">
      📎 Anexar Comprovante / Diploma deste Novo Curso <span className="text-rose-600 font-bold">*</span>
      <input
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleAddFilesForCourse(e, courseId)}
      />
    </label>

    {courseAttachments.length > 0 && (
      <div className="flex flex-wrap gap-1.5 items-center">
        {courseAttachments.map((att, attIdx) => {
          const globalIdx = attachments.findIndex((a) => a === att);
          return (
            <span
              key={attIdx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-300 rounded-md text-[11px] text-slate-700 font-medium"
            >
              📄 {att.file.name.length > 20 ? `${att.file.name.slice(0, 17)}...` : att.file.name}
              <button
                type="button"
                onClick={() => handleRemoveFile(globalIdx)}
                className="text-rose-500 hover:text-rose-700 font-bold ml-1 cursor-pointer"
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
    )}
  </div>
</div>
    );
  })}

  <button
    type="button"
    onClick={handleAddFormacao}
    className="w-full py-2.5 bg-white hover:bg-slate-50 border border-dashed border-slate-300 hover:border-cyan-600 rounded-xl text-xs font-semibold text-cyan-700 transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
  >
    ➕ Adicionar Novo Curso
  </button>
</div>
  ) : formacaoList.length > 0 ? (
    /* MODO VISUALIZAÇÃO FORA DA EDIÇÃO */
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {formacaoList.map((curso, index) => (
        <div
          key={curso.ID || index}
          className="p-3.5 bg-white border border-slate-200 rounded-lg flex flex-col justify-between shadow-sm"
        >
          <div>
            <span className="block text-[10px] text-cyan-700 uppercase font-bold tracking-wider mb-0.5">
              {curso.GRAUINSTRUCAO_DESC || 'Grau não informado'}
            </span>
            <p className="text-sm font-bold text-slate-800">
              {curso.CURSO_NOME || 'Curso não informado'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {curso.ENTIDADE_NOMEFANTASIA || 'Instituição não informada'}
            </p>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-xs text-slate-500 italic">Nenhuma formação acadêmica cadastrada.</p>
  )}
</div>

  <div className="pt-3 border-t border-slate-200/80 flex items-center justify-between">
    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs text-cyan-700 transition font-medium shadow-sm">
      📎 Anexar Certificado / Diploma
      <input
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleAddFiles(e, 'escolaridade')}
      />
    </label>
  </div>
</div>

  {/* 📍 SEÇÃO 2: Endereço */}
  <div className="p-6 bg-slate-50/60 border border-slate-200 rounded-xl space-y-4">
    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
      <h3 className="text-sm font-bold text-cyan-700 uppercase tracking-wider">
        📍 Endereço
      </h3>
      <button
        onClick={() => toggleSection('endereco')}
        className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 transition flex items-center gap-1 font-medium shadow-sm"
      >
        ✏️ {editingSections.endereco ? 'Concluir Edição' : 'Editar'}
      </button>
    </div>

    {editingSections.endereco ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-600 font-medium mb-1">Rua / Logradouro</label>
          <input
            type="text"
            name="RUA"
            value={formData.RUA}
            onChange={handleChange}
            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 font-medium mb-1">Número</label>
          <input
            type="text"
            name="NUMERO"
            value={formData.NUMERO}
            onChange={handleChange}
            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 font-medium mb-1">Complemento</label>
          <input
            type="text"
            name="COMPLEMENTO"
            value={formData.COMPLEMENTO}
            onChange={handleChange}
            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 font-medium mb-1">Bairro</label>
          <input
            type="text"
            name="BAIRRO"
            value={formData.BAIRRO}
            onChange={handleChange}
            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 font-medium mb-1">CEP</label>
          <input
            type="text"
            name="CEP"
            value={formData.CEP}
            onChange={handleChange}
            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 font-medium mb-1">Cidade</label>
          <input
            type="text"
            name="CIDADE"
            value={formData.CIDADE}
            onChange={handleChange}
            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 font-medium mb-1">Estado (UF)</label>
          <input
            type="text"
            name="ESTADO"
            value={formData.ESTADO}
            onChange={handleChange}
            className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
          />
        </div>
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">Rua</span>
          <span className="text-sm text-slate-800">{formData.RUA || '--'}</span>
        </div>
        <div>
          <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">Número</span>
          <span className="text-sm text-slate-800">{formData.NUMERO || '--'}</span>
        </div>
        <div>
          <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">Complemento</span>
          <span className="text-sm text-slate-800">{formData.COMPLEMENTO || '--'}</span>
        </div>
        <div>
          <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">Bairro</span>
          <span className="text-sm text-slate-800">{formData.BAIRRO || '--'}</span>
        </div>
        <div>
          <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">CEP</span>
          <span className="text-sm text-slate-800 font-mono">{formData.CEP || '--'}</span>
        </div>
        <div>
          <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">Cidade / UF</span>
          <span className="text-sm text-slate-800">{formData.CIDADE} - {formData.ESTADO}</span>
        </div>
      </div>
    )}

    <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
      <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs text-cyan-700 transition font-medium shadow-sm">
        📎 Anexar Comprovante de Residência <span className="text-rose-600 font-bold">*</span>
        <input
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleAddFiles(e, 'endereco')}
        />
      </label>
    </div>
  </div>

  {/* 📞 SEÇÃO 3: Contatos */}
  {/* 📞 SEÇÃO 3: Contatos */}
<div className="p-6 bg-slate-50/60 border border-slate-200 rounded-xl space-y-4">
  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
    <h3 className="text-sm font-bold text-cyan-700 uppercase tracking-wider">
      📞 Contatos
    </h3>
    <button
      onClick={() => toggleSection('contato')}
      className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 transition flex items-center gap-1 font-medium shadow-sm"
    >
      ✏️ {editingSections.contato ? 'Concluir Edição' : 'Editar'}
    </button>
  </div>

  {editingSections.contato ? (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2 space-y-2">
        <label className="block text-xs text-slate-600 font-medium mb-1">E-mails</label>

        {emails.map((email, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => handleEmailChange(index, e.target.value)}
              placeholder="nome@exemplo.com"
              className="flex-1 bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
            />
            {emails.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveEmail(index)}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 text-xs font-bold transition"
                title="Remover este e-mail"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={handleAddEmail}
          className="text-xs text-cyan-700 hover:text-cyan-800 font-medium flex items-center gap-1 mt-1"
        >
          ➕ Adicionar outro e-mail
        </button>
      </div>

      <div>
        <label className="block text-xs text-slate-600 font-medium mb-1">Telefone Principal</label>
        <input
          type="text"
          name="TELEFONE1"
          value={formData.TELEFONE1}
          onChange={handleChange}
          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-600 font-medium mb-1">Telefone Secundário</label>
        <input
          type="text"
          name="TELEFONE2"
          value={formData.TELEFONE2}
          onChange={handleChange}
          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-sm text-slate-800 focus:border-cyan-600 outline-none transition"
        />
      </div>
    </div>
  ) : (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">E-mail(s)</span>
        {emails.filter((e) => e.trim() !== '').length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {emails
              .filter((e) => e.trim() !== '')
              .map((email, idx) => (
                <span key={idx} className="text-sm text-slate-800 font-mono">
                  {email}
                </span>
              ))}
          </div>
        ) : (
          <span className="text-sm text-slate-800 font-mono">--</span>
        )}
      </div>
      <div className='flex flex-col gap-3'>
        <div>
        <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">Telefone Principal</span>
        <span className="text-sm text-slate-800 font-mono">{formData.TELEFONE1 || '--'}</span>
        </div>
        <div>
        <span className="block text-xs text-slate-500 uppercase font-semibold mb-0.5">Telefone Secundário</span>
        <span className="text-sm text-slate-800 font-mono">{formData.TELEFONE2 || '--'}</span>
        </div>
      </div>
    </div>
  )}
</div>

  {/* 👨‍👩‍👧‍👦 SEÇÃO 4: Dependentes (Editável) */}
<div className="p-6 bg-slate-50/60 border border-slate-200 rounded-xl space-y-4">
  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
    <h3 className="text-sm font-bold text-cyan-700 uppercase tracking-wider flex items-center gap-2">
      👨‍👩‍👧‍👦 Dependentes
      <span className="px-2 py-0.5 bg-slate-200 rounded-full text-slate-700 text-xs font-semibold">
        {dependentsList.length}
      </span>
    </h3>
    <button
      type="button"
      onClick={() => toggleSection('dependentes')}
      className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs text-slate-700 transition flex items-center gap-1 font-medium shadow-sm cursor-pointer"
    >
      ✏️ {editingSections.dependentes ? 'Concluir Edição' : 'Editar / Gerenciar'}
    </button>
  </div>

  {editingSections.dependentes ? (
    <div className="space-y-4">
      {dependentsList.map((dep, index) => {
        const depId = dep.ID || index;
        const isIrpf = dep.INCIRRF === 1 || dep.INCIRRF === '1';
        const targetAction = dep.isExisting ? 'OLD' : 'NEW';

        return (
          <div
            key={depId}
            data-target-id={targetAction}
            className={`p-4 border rounded-xl space-y-3 relative shadow-sm transition ${
              dep.isExisting
                ? 'bg-slate-50/60 border-slate-200'
                : 'bg-white border-cyan-200'
            }`}
          >
            {/* Cabeçalho do Card */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">
                  Dependente #{index + 1}
                </span>
                {dep.isExisting ? (
                  <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-semibold rounded-md flex items-center gap-1">
                    🔒 Liberado mudar somente o incide IRPF
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 text-[10px] font-semibold rounded-md">
                    ✨ Novo
                  </span>
                )}
              </div>

              {!dep.isExisting && (
                <button
                  type="button"
                  onClick={() => handleRemoveDependent(index)}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  🗑️ Remover
                </button>
              )}
            </div>

            {/* Campos Editáveis */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {/* Nome Completo */}
              <div className="sm:col-span-2 md:col-span-1">
                <label className="block text-xs text-slate-600 font-medium mb-1">
                  Nome Completo <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  value={getDependentName(dep.NOME)}
                  onChange={(e) => handleDependentChange(index, 'NOME', e.target.value)}
                  readOnly={dep.isExisting}
                  placeholder="Nome completo do dependente"
                  className={`w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-cyan-600 outline-none transition ${
                    dep.isExisting ? 'bg-slate-100 cursor-not-allowed' : 'bg-white'
                  }`}
                />
              </div>

              {/* CPF */}
              <div>
                <label className="block text-xs text-slate-600 font-medium mb-1">
                  CPF {!dep.isExisting && <span className="text-rose-600">*</span>}
                </label>
                <input
                  type="text"
                  value={dep.CPF || ''}
                  onChange={(e) => handleDependentChange(index, 'CPF', e.target.value)}
                  readOnly={dep.isExisting}
                  placeholder="000.000.000-00"
                  className={`w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-cyan-600 outline-none transition ${
                    dep.isExisting ? 'bg-slate-100 cursor-not-allowed' : 'bg-white'
                  }`}
                />
              </div>

              {/* Grau de Parentesco */}
              <div>
                <label className="block text-xs text-slate-600 font-medium mb-1">
                  Grau de Parentesco <span className="text-rose-600">*</span>
                </label>
                {familyOptions?.grausParentesco && familyOptions.grausParentesco.length > 0 ? (
                  <select
                    value={String(dep.GRAUPARENTESCO || '')}
                    disabled={dep.isExisting}
                    onChange={(e) => handleDependentParentescoChange(index, e.target.value)}
                    className={`w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-cyan-600 outline-none transition ${
                      dep.isExisting ? 'bg-slate-100 cursor-not-allowed' : 'bg-white cursor-pointer'
                    }`}
                  >
                    <option value="">Selecione o Parentesco...</option>
                    {familyOptions.grausParentesco.map((g) => (
                      <option key={g.GRAUPARENTESCO} value={String(g.GRAUPARENTESCO)}>
                        {g.GRAUPARENTESCODESC}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={dep.GRAUPARENTESCODESC || ''}
                    onChange={(e) => handleDependentChange(index, 'GRAUPARENTESCODESC', e.target.value)}
                    readOnly={dep.isExisting}
                    placeholder="Ex: Filho(a)"
                    className={`w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-cyan-600 outline-none transition ${
                      dep.isExisting ? 'bg-slate-100 cursor-not-allowed' : 'bg-white'
                    }`}
                  />
                )}
              </div>

              {/* Sexo */}
              <div>
                <label className="block text-xs text-slate-600 font-medium mb-1">
                  Sexo {!dep.isExisting && <span className="text-rose-600">*</span>}
                </label>
                <select
                  value={dep.SEXO || 'M'}
                  disabled={dep.isExisting}
                  onChange={(e) => handleDependentChange(index, 'SEXO', e.target.value)}
                  className={`w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-cyan-600 outline-none transition ${
                    dep.isExisting ? 'bg-slate-100 cursor-not-allowed' : 'bg-white cursor-pointer'
                  }`}
                >
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </div>

              {/* Data Nascimento */}
              <div>
                <label className="block text-xs text-slate-600 font-medium mb-1">
                  Data Nascimento {!dep.isExisting && <span className="text-rose-600">*</span>}
                </label>
                <input
                  type="text"
                  placeholder="dd/mm/aaaa"
                  value={formatDateToBR(dep.DATANASCIMENTO || dep.DTNASCIMENTO || '')}
                  maxLength={10}
                  onChange={(e) => handleDependentChange(index, 'DATANASCIMENTO', e.target.value)}
                  readOnly={dep.isExisting}
                  className={`w-full border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-cyan-600 outline-none transition ${
                    dep.isExisting ? 'bg-slate-100 cursor-not-allowed' : 'bg-white'
                  }`}
                />
              </div>

              {/* Incide IRPF */}
              <div>
                <label className="block text-xs text-slate-600 font-medium mb-1">Incide IRPF</label>
                <select
                  value={dep.INCIRRF === 1 || dep.INCIRRF === '1' ? '1' : '0'}
                  onChange={(e) => handleDependentChange(index, 'INCIRRF', e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs text-slate-800 focus:border-cyan-600 outline-none transition cursor-pointer"
                >
                  <option value="1">Sim</option>
                  <option value="0">Não</option>
                </select>
              </div>
            </div>

            {/* Anexo de IRPF */}
            {(isIrpf || !dep.isExisting) && (
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg text-xs text-amber-900 transition font-medium shadow-2xs">
                  📎 Anexar Certidão/CPF deste dependente (IRPF) <span className="text-rose-600 font-bold">*</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleAddFiles(e, `dependentes_${depId}`)}
                  />
                </label>
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={handleAddDependent}
        className="w-full py-2.5 bg-white hover:bg-slate-50 border border-dashed border-slate-300 hover:border-cyan-600 rounded-xl text-xs font-semibold text-cyan-700 transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
      >
        ➕ Adicionar Novo Dependente
      </button>
    </div>
  ) : dependentsList.length > 0 ? (
    /* Modo Visualização (Leitura) */
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {dependentsList.map((dep, index) => {
        const rawBirthDate = dep.DATANASCIMENTO || dep.DTNASCIMENTO || '';
        const birthDateFormatted = formatDateToBR(rawBirthDate);

        return (
          <div
            key={dep.ID || index}
            className="p-3.5 bg-white border border-slate-200 rounded-lg flex flex-col justify-between shadow-sm"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="block text-xs text-slate-500 uppercase font-semibold mb-1">
                  Nome do Dependente
                </span>
                {dep.GRAUPARENTESCODESC && (
                  <span className="text-[10px] px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-700 font-medium">
                    {dep.GRAUPARENTESCODESC}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {getDependentName(dep.NOME) || '--'}
              </p>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono text-slate-600">
              <span>CPF: {dep.CPF || 'Não cadastrado'}</span>
              {birthDateFormatted && <span className="text-slate-500">{birthDateFormatted}</span>}
            </div>

            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-slate-500 uppercase font-semibold">Incide IRPF</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  dep.INCIRRF === 1 || dep.INCIRRF === '1'
                    ? 'bg-emerald-100 border border-emerald-300 text-emerald-800'
                    : 'bg-slate-100 border border-slate-200 text-slate-600'
                }`}
              >
                {dep.INCIRRF === 1 || dep.INCIRRF === '1' ? 'Sim' : 'Não'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  ) : (
    <p className="text-xs text-slate-500 italic">
      Nenhum dependente vinculado.
    </p>
  )}
</div>

  {/* 📁 RESUMO DOS ARQUIVOS ANEXADOS (Geral) */}
  {attachments.length > 0 && (
    <div className="p-6 bg-purple-50/50 border border-purple-200 rounded-xl space-y-3">
      <h3 className="text-xs font-bold text-purple-700 uppercase tracking-wider">
        📁 Documentos Anexados para Envio ({attachments.length})
      </h3>
      <div className="flex flex-wrap gap-2">
        {attachments.map((item, idx) => (
          <div
            key={idx}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-purple-200 rounded-lg text-purple-900 text-xs font-mono shadow-sm"
          >
            <span className="px-1.5 py-0.5 bg-purple-100 rounded text-[10px] font-semibold text-purple-700 uppercase border border-purple-200">
              {SECTION_LABELS[item.category] || item.category}
            </span>
            <span className="truncate max-w-[150px]">{item.file.name}</span>
            <button
              onClick={() => handleRemoveFile(idx)}
              className="text-rose-600 hover:text-rose-800 font-bold ml-1"
              title="Remover anexo"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )}

  {/* Mensagem de erro no envio */}
  {errorMessage && (
    <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-center justify-between">
      <span>⚠️ {errorMessage}</span>
      <button onClick={() => setErrorMessage(null)} className="text-xs text-rose-600 hover:text-rose-800 underline font-medium">
        Fechar
      </button>
    </div>
  )}

  {/* Botão de Salvar Geral */}
  <div className="flex justify-center pt-4">
    <button
      onClick={handleOpenReview}
      disabled={!hasChanges}
      className={`px-6 py-3 rounded-xl font-bold text-sm transition shadow-md ${
        hasChanges
          ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20'
          : 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
      }`}
    >
      Salvar Solicitação de Alteração
    </button>
  </div>

  

  {/* 🔍 MODAL DE REVISÃO DE NOVAS ALTERAÇÕES */}
{isModalOpen && (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
      <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
        Confirmar Alterações
      </h3>
      <p className="text-xs text-slate-500">
        Revise as alterações e anexos que serão enviados para aprovação do setor de RH:
      </p>

      <div className="max-h-[60vh] overflow-y-auto space-y-2.5 pr-1">
        {/* Renderização tratada dos campos alterados */}
        {modifiedFields.map((item, idx) => renderModalItem(item, idx))}

        {attachments.length > 0 && (
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs space-y-2">
            <span className="font-bold text-purple-700">Anexos Vinculados:</span>
            <div className="space-y-1">
              {attachments.map((att, idx) => (
                <div key={idx} className="flex items-center justify-between text-purple-900">
                  <span>📄 {att.file.name}</span>
                  <span className="text-[10px] bg-purple-100 px-2 py-0.5 rounded text-purple-700 font-medium border border-purple-200">
                    {SECTION_LABELS[att.category] || att.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
        <button
          onClick={() => setIsModalOpen(false)}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-xl font-medium transition border border-slate-200 cursor-pointer"
        >
          Voltar e Editar
        </button>
        <button
          onClick={handleSubmitRequest}
          disabled={submitting}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
        >
          {submitting ? 'Enviando...' : 'Confirmar e Enviar'}
        </button>
      </div>
    </div>
  </div>
)}

  {/* 🔍 MODAL DE RESUMO DA SOLICITAÇÃO PENDENTE */}
 {isPendingModalOpen && (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
      {/* Cabeçalho do Modal */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Solicitações Pendentes de Aprovação
          </h3>
          <p className="text-xs text-slate-500">
            Acompanhe os dados que estão sob análise da equipe de RH.
          </p>
        </div>
        <button
          onClick={() => setIsPendingModalOpen(false)}
          className="text-slate-400 hover:text-slate-700 transition p-1 text-sm font-bold cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Conteúdo com Scroll */}
      <div className="overflow-y-auto space-y-4 pr-1 flex-1">
        {(() => {
          // Extrai a lista real de chamados (changeRequests) de dentro do objeto retornado pela API
          const requestsList: any[] = Array.isArray(existingRequest?.changeRequests)
            ? existingRequest.changeRequests
            : Array.isArray(existingRequest)
            ? existingRequest
            : existingRequest?.change_requests
            ? existingRequest.change_requests
            : existingRequest?.id
            ? [existingRequest]
            : [];

          // Filtra apenas os chamados cujo status seja 'pending'
          const pendingList = requestsList.filter(
            (r: any) => r && r.status === 'pending'
          );

          if (pendingList.length === 0) {
            return (
              <div className="text-center py-8 text-slate-500 text-xs">
                Nenhuma solicitação pendente encontrada no momento.
              </div>
            );
          }

          return pendingList.map((req: any) => {
            console.log('Chamado pendente:', req);
            // Filtra para exibir apenas os campos com status pendente neste chamado
            const pendingFields = (req.fields || []).filter(
              (f: any) => f.status === 'pending'
            );

            return (
              <div
                key={req.id}
                className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3"
              >
                {/* Barra de título do Chamado */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      #{req.id}
                    </span>
                    {req.section_key && (
                      <span className="px-2 py-0.5 rounded bg-cyan-100 border border-cyan-200 text-cyan-800 text-[10px] font-semibold uppercase tracking-wider">
                        {req.section_key}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500 font-mono">
                      Enviado em:{' '}
                      {req.submitted_at
                        ? new Date(req.submitted_at).toLocaleDateString('pt-BR')
                        : '--'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-medium uppercase">
                      {req.status || 'Pendente'}
                    </span>
                  </div>
                </div>

                {/* Lista de Campos Alterados no Chamado */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Campos em análise ({pendingFields.length}):
                  </h4>
                  {pendingFields.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {pendingFields.map((field: any, idx: number) => {
                        // --- TRATAMENTO ESPECIAL PARA O CAMPO DE DEPENDENTES ---
                        if (field.field_name === 'DEPENDENTES') {
                          let dependentsList: any[] = [];
                          let isJsonArray = false;

                          try {
                            if (
                              field.new_value &&
                              (field.new_value.trim().startsWith('[') ||
                                field.new_value.trim().startsWith('{'))
                            ) {
                              const parsed = JSON.parse(field.new_value);
                              dependentsList = Array.isArray(parsed)
                                ? parsed
                                : [parsed];
                              isJsonArray = true;
                            }
                          } catch {
                            isJsonArray = false;
                          }

                          if (isJsonArray) {
                            return (
                              <div
                                key={field.id || idx}
                                className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-2 shadow-sm"
                              >
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <span className="font-bold text-cyan-700">
                                    DEPENDENTES
                                  </span>
                                  <span className="text-[11px] text-slate-500 font-mono">
                                    De:{' '}
                                    <strong className="text-slate-700">
                                      {field.old_value || '0'}
                                    </strong>{' '}
                                    → Para:{' '}
                                    <strong className="text-emerald-700">
                                      {dependentsList.length} dependente(s)
                                    </strong>
                                  </span>
                                </div>

                                {/* Cards individuais dos dependentes */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                  {dependentsList.map((dep: any, dIdx: number) => (
                                    <div
                                      key={dIdx}
                                      className="p-2.5 bg-slate-50 rounded-md border border-slate-200 space-y-1"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-slate-800 truncate">
                                          {dep.NOME || 'Nome não informado'}
                                        </span>
                                        {dep.INCIRRF === '1' && (
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-800 text-[9px] font-bold">
                                            IRRF
                                          </span>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-slate-600 font-mono">
                                        <div>
                                          Parentesco:{' '}
                                          <span className="text-slate-800 font-semibold">
                                            {dep.GRAUPARENTESCODESC ||
                                              dep.GRAUPARENTESCO ||
                                              '--'}
                                          </span>
                                        </div>
                                        <div>
                                          Sexo:{' '}
                                          <span className="text-slate-800">
                                            {dep.SEXO || '--'}
                                          </span>
                                        </div>
                                        {dep.CPF && (
                                          <div>
                                            CPF:{' '}
                                            <span className="text-slate-800">
                                              {dep.CPF}
                                            </span>
                                          </div>
                                        )}
                                        {dep.DATANASCIMENTO && (
                                          <div>
                                            Nasc:{' '}
                                            <span className="text-slate-800">
                                              {new Date(
                                                dep.DATANASCIMENTO
                                              ).toLocaleDateString('pt-BR')}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                        }

                        // --- RENDERIZAÇÃO PADRÃO PARA OS DEMAIS CAMPOS ---
                        return (
                          <div
                            key={field.id || idx}
                            className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2 shadow-sm"
                          >
                            <span className="font-bold text-cyan-700">
                              {field.field_name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 line-through text-[11px]">
                                De: {field.old_value || '(Vazio)'}
                              </span>
                              <span className="text-slate-400">→</span>
                              <span className="text-emerald-700 font-semibold text-[11px]">
                                Para: {field.new_value || '(Vazio)'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Nenhum detalhe de campo pendente encontrado nesta solicitação.
                    </p>
                  )}
                </div>

                {/* Anexos vinculados */}
                {req.attachments && req.attachments.length > 0 && (
                  <div className="pt-2 border-t border-slate-200">
                    <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Anexos Enviados ({req.attachments.length}):
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {req.attachments.map((att: any) => (
                        <a
                          key={att.id}
                          href={`/api/attachments/${att.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 text-xs hover:bg-purple-100 transition font-mono"
                        >
                          📄 {att.original_filename}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Rodapé do Modal */}
      <div className="flex items-center justify-end pt-3 border-t border-slate-100 shrink-0">
        <button
          onClick={() => setIsPendingModalOpen(false)}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-xl font-medium transition border border-slate-200 cursor-pointer"
        >
          Fechar
        </button>
      </div>
    </div>
  </div>
)}
{/* 🔴 Modal de Solicitações Recusadas */}
{isRejectedModalOpen && (
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
    <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
      {/* Cabeçalho do Modal */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Solicitações Recusadas pelo RH
          </h3>
          <p className="text-xs text-slate-500">
            Acompanhe os dados que foram recusados e as justificativas do RH.
          </p>
        </div>
        <button
          onClick={() => setIsRejectedModalOpen(false)}
          className="text-slate-400 hover:text-slate-700 transition p-1 text-sm font-bold cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Conteúdo com Scroll */}
      <div className="overflow-y-auto space-y-4 pr-1 flex-1">
        {(() => {
          const requestsList: any[] = Array.isArray(existingRequest?.changeRequests)
            ? existingRequest.changeRequests
            : Array.isArray(existingRequest)
            ? existingRequest
            : existingRequest?.change_requests
            ? existingRequest.change_requests
            : existingRequest?.id
            ? [existingRequest]
            : [];

          // 1. Agrupa todos os campos de todas as solicitações por nome para achar o mais recente
          const allFields: any[] = requestsList.flatMap(
            (req) => req.fields || req.change_request_fields || []
          );

          const fieldsByName = new Map<string, any[]>();
          allFields.forEach((f) => {
            if (!f.field_name) return;
            const key = f.field_name.toUpperCase();
            if (!fieldsByName.has(key)) fieldsByName.set(key, []);
            fieldsByName.get(key)!.push(f);
          });

          // 2. Coleta os IDs apenas dos campos cujo status MAIS RECENTE é 'rejected'
          const activeRejectedFieldIds = new Set<any>();
          fieldsByName.forEach((fList) => {
            fList.sort((a, b) => Number(b.id) - Number(a.id));
            const latestField = fList[0];
            if (latestField && latestField.status === 'rejected') {
              activeRejectedFieldIds.add(latestField.id);
            }
          });

          // 3. Filtra apenas os chamados que contêm pelo menos 1 campo recusado que ainda está ATIVO (sem novo envio)
          const rejectedRequestsList = requestsList.filter((req: any) =>
            (req.fields || []).some((f: any) => activeRejectedFieldIds.has(f.id))
          );

          if (rejectedRequestsList.length === 0) {
            return (
              <div className="text-center py-8 text-slate-500 text-xs">
                Nenhuma solicitação recusada pendente de correção encontrada.
              </div>
            );
          }

          return rejectedRequestsList.map((req: any) => {
            // Exibe somente os campos do chamado que ainda estão com recusa ativa
            const rejectedFieldsInReq = (req.fields || []).filter((f: any) =>
              activeRejectedFieldIds.has(f.id)
            );

            return (
              <div
                key={req.id}
                className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3"
              >
                {/* Barra de título do Chamado */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      #{req.id}
                    </span>
                    {req.section_key && (
                      <span className="px-2 py-0.5 rounded bg-rose-100 border border-rose-200 text-rose-800 text-[10px] font-semibold uppercase tracking-wider">
                        {req.section_key}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-500 font-mono">
                      Enviado em:{' '}
                      {req.submitted_at
                        ? new Date(req.submitted_at).toLocaleDateString('pt-BR')
                        : '--'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-rose-800 text-[10px] font-medium uppercase">
                      Recusado
                    </span>
                  </div>
                </div>

                {/* Lista de Campos Recusados Ativos no Chamado */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                    Campos recusados ({rejectedFieldsInReq.length}):
                  </h4>
                  {rejectedFieldsInReq.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                      {rejectedFieldsInReq.map((field: any, idx: number) => {
                        // --- TRATAMENTO ESPECIAL PARA O CAMPO DE DEPENDENTES ---
                        if (field.field_name === 'DEPENDENTES') {
                          let dependentsList: any[] = [];
                          let isJsonArray = false;

                          try {
                            if (
                              field.new_value &&
                              (field.new_value.trim().startsWith('[') ||
                                field.new_value.trim().startsWith('{'))
                            ) {
                              const parsed = JSON.parse(field.new_value);
                              dependentsList = Array.isArray(parsed)
                                ? parsed
                                : [parsed];
                              isJsonArray = true;
                            }
                          } catch {
                            isJsonArray = false;
                          }

                          if (isJsonArray) {
                            return (
                              <div
                                key={field.id || idx}
                                className="p-3 bg-white rounded-lg border border-slate-200 text-xs space-y-2 shadow-sm"
                              >
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <span className="font-bold text-slate-700">
                                    DEPENDENTES
                                  </span>
                                  <span className="text-[11px] text-slate-500 font-mono">
                                    De:{' '}
                                    <strong className="text-slate-700">
                                      {field.old_value || '0'}
                                    </strong>{' '}
                                    → Para:{' '}
                                    <strong className="text-slate-700">
                                      {dependentsList.length} dependente(s)
                                    </strong>
                                  </span>
                                </div>

                                {field.review_notes && (
                                  <div className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-800 text-[11px]">
                                    <strong>Motivo da recusa:</strong> "{field.review_notes}"
                                  </div>
                                )}

                                {/* Cards individuais dos dependentes */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                  {dependentsList.map((dep: any, dIdx: number) => (
                                    <div
                                      key={dIdx}
                                      className="p-2.5 bg-slate-50 rounded-md border border-slate-200 space-y-1"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-slate-800 truncate">
                                          {dep.NOME || 'Nome não informado'}
                                        </span>
                                        {dep.INCIRRF === '1' && (
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-800 text-[9px] font-bold">
                                            IRRF
                                          </span>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-slate-600 font-mono">
                                        <div>
                                          Parentesco:{' '}
                                          <span className="text-slate-800 font-semibold">
                                            {dep.GRAUPARENTESCODESC ||
                                              dep.GRAUPARENTESCO ||
                                              '--'}
                                          </span>
                                        </div>
                                        <div>
                                          Sexo:{' '}
                                          <span className="text-slate-800">
                                            {dep.SEXO || '--'}
                                          </span>
                                        </div>
                                        {dep.CPF && (
                                          <div>
                                            CPF:{' '}
                                            <span className="text-slate-800">
                                              {dep.CPF}
                                            </span>
                                          </div>
                                        )}
                                        {dep.DATANASCIMENTO && (
                                          <div>
                                            Nasc:{' '}
                                            <span className="text-slate-800">
                                              {new Date(
                                                dep.DATANASCIMENTO
                                              ).toLocaleDateString('pt-BR')}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                        }

                        // --- RENDERIZAÇÃO PADRÃO PARA OS DEMAIS CAMPOS ---
                        return (
                          <div
                            key={field.id || idx}
                            className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs space-y-2 shadow-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-slate-700">
                                {field.field_name}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400 line-through text-[11px]">
                                  De: {field.old_value || '(Vazio)'}
                                </span>
                                <span className="text-slate-400">→</span>
                                <span className="text-slate-700 font-semibold text-[11px]">
                                  Para: {field.new_value || '(Vazio)'}
                                </span>
                              </div>
                            </div>

                            {field.review_notes && (
                              <div className="p-2 bg-slate-50 border border-slate-200 rounded text-slate-800 text-[11px]">
                                <strong>Motivo da recusa:</strong> "{field.review_notes}"
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Nenhum detalhe de campo recusado encontrado nesta solicitação.
                    </p>
                  )}
                </div>

                {/* Anexos vinculados */}
                {req.attachments && req.attachments.length > 0 && (
                  <div className="pt-2 border-t border-slate-200">
                    <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Anexos Enviados ({req.attachments.length}):
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {req.attachments.map((att: any) => (
                        <a
                          key={att.id}
                          href={`/api/attachments/${att.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 border border-purple-200 rounded-lg text-purple-800 text-xs hover:bg-purple-100 transition font-mono"
                        >
                          📄 {att.original_filename}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Rodapé do Modal */}
      <div className="flex items-center justify-end pt-3 border-t border-slate-100 shrink-0">
        <button
          onClick={() => setIsRejectedModalOpen(false)}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-xl font-medium transition border border-slate-200 cursor-pointer"
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