// lib/change-request-sections.ts

// Cada seção declara: chave canônica, rótulo pra exibir, e quais campos do
// TOTVS pertencem a ela. Usado tanto no envio (frontend) quanto na
// validação/armazenamento (backend) quanto na exibição pro RH.
// Adicione FORMACAO_ACADEMICA à seção de escolaridade (reaproveita o mesmo anexo)
export const SECTION_FIELD_MAP: Record<string, string[]> = {
  identificacao: ['NOME'],
  estado_civil: ['ESTADOCIVIL'],
  escolaridade: ['GRAUINSTRUCAO', 'FORMACAO_ACADEMICA'], // ← adicionado aqui
  endereco: ['RUA', 'NUMERO', 'COMPLEMENTO', 'BAIRRO', 'CEP', 'CIDADE', 'ESTADO', 'PAIS'],
  contato: ['EMAIL', 'TELEFONE1', 'TELEFONE2'],
  dependentes: ['DEPENDENTES'],
};

export const SECTION_LABELS: Record<string, string> = {
  identificacao: 'Identificação',
  estado_civil: 'Estado Civil',
  escolaridade: 'Escolaridade',
  endereco: 'Endereço',
  contato: 'Contato',
  dependentes: 'Dependentes',
};

export const VALID_SECTION_KEYS = Object.keys(SECTION_FIELD_MAP);
export const ALL_ALLOWED_FIELDS = Object.values(SECTION_FIELD_MAP).flat();

export function getSectionForField(field: string): string | null {
  for (const [section, fields] of Object.entries(SECTION_FIELD_MAP)) {
    if (fields.includes(field)) return section;
  }
  return null;
}