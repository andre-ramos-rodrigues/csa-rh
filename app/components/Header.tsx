'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { RH_USERS, FULL_ACCESS_USERS, checkIsRhUser } from '@/lib/constants';

interface HeaderProps {
  usuario?: string;
}

export default function Header({ usuario: initialUsername }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const [currentUsername, setCurrentUsername] = useState<string | null>(initialUsername || null);

  // Busca e sincroniza os dados do usuário com a sessão atual
  const fetchUserData = useCallback(async () => {
    // Se estiver na tela de login, garante que o header está limpo
    if (pathname === '/login') {
      setCurrentUsername(null);
      return;
    }

    try {
      const res = await fetch('/api/auth/me');
      const contentType = res.headers.get('content-type');

      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        const username = data.user?.usuario || data.user?.username || data.usuario;
        if (username) {
          setCurrentUsername(username);
          return;
        }
      }
      // Se a sessão expirou ou não retornou usuário válido, reseta a permissão
      setCurrentUsername(null);
    } catch (error) {
      console.error('Erro ao buscar dados do usuário no Header:', error);
      setCurrentUsername(null);
    }
  }, [pathname]);

  // Dispara a checagem toda vez que a rota/página muda (ex: pós-login)
  useEffect(() => {
    fetchUserData();
  }, [fetchUserData, pathname]);

  const formattedUsername = currentUsername?.trim().toUpperCase() || '';

  const isFullAccess = FULL_ACCESS_USERS.some(
    (u) => u.trim().toUpperCase() === formattedUsername
  );

  const isRhUser =
    RH_USERS?.some((u) => u.trim().toUpperCase() === formattedUsername) ||
    (typeof checkIsRhUser === 'function' && checkIsRhUser(formattedUsername));

  // Permissão compartilhada para recursos de RH / Gestão
  const hasRhOrFullAccess = Boolean(formattedUsername && (isFullAccess || isRhUser));

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
      
      // Limpa o estado local imediatamente
      setCurrentUsername(null);
      setLoggingOut(false);
      
      // Redireciona e atualiza a árvore de componentes
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Erro ao realizar logout:', error);
      setLoggingOut(false);
    }
  };

  return (
    <header className="w-full mx-auto flex items-center justify-between py-4 px-6 bg-white/90 border border-slate-200/80 rounded-2xl mb-8 shadow-sm backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center font-extrabold text-white text-base shadow-sm shadow-sky-600/20">
          RH
        </div>
        <div>
          <h1 className="font-bold text-base text-slate-900">CSA Leblon - Totvs</h1>
          <p className="text-xs text-slate-500">Atualização Cadastral de Funcionários</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Botões de navegação exibidos dinamicamente apenas para usuários RH ou Full Access */}
        {hasRhOrFullAccess && (
          <>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-1.5"
            >
              <span>👥</span>
              <span>Funcionários</span>
            </button>           
          </>
        )}

        {isFullAccess && (
         <button
              type="button"
              onClick={() => router.push('/rhmigration')}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-1.5"
          >
              <span>⚡</span>
              <span>Migrar</span>
          </button>
        )}

        {/* Botão Sair exibido apenas se houver usuário logado */}
        {Boolean(currentUsername) && (
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-3.5 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loggingOut ? 'Saindo...' : 'Sair'}
          </button>
        )}
      </div>
    </header>
  );
}