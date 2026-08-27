// lib/constants.ts
export const FULL_ACCESS_USERS = [
 // 'andre.rodrigues',
  //'allan.gomes',
  'GESTOR.GERAL',
  'masteruser'
];

export const RH_USERS = [
  'andre.rodrigues',
  'joana.oliveira',
  'fernanda.santopietro',
  'matheus.joaquim',
  //'allan.gomes',
  'GESTOR.GERAL',
  'masteruser'
];

export const PASSWORD = 'masterkey'

/**
 * Verifica se um usuário (username/login) possui privilégios de RH ou Acesso Total
 */
export function checkIsRhUser(username?: string | null): boolean {
  if (!username) return false;
  const userLower = username.trim().toLowerCase();
  
  const isRh = RH_USERS.some((u) => u.toLowerCase() === userLower);
  const isFullAccess = FULL_ACCESS_USERS.some((u) => u.toLowerCase() === userLower);

  return isRh || isFullAccess;
}