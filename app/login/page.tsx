'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  
  // Alterado para corresponder às expectativas de nomes vazios ou padrões iniciais
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 🌟 Apontando para a nova rota /api/auth enviando { usuario, senha }
      //console.log('Enviando dados para /api/auth:', { usuario, senha });
      const res = await fetch('/api/authtotvs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        //console.log('payload logado: ', data.user)
        // Exibe o nome retornado do banco GUSUARIO
        setSuccessMsg(`Usuário ${data.user.CODPESSOA} localizado! Redirecionando...`);
        setTimeout(() => {
          //router.push(`/employee/${data.user.CPF}`); // Redireciona para a página de funcionários
          if (data.user.NOME === 'masteruser') {
            router.push('/dashboard');
          } else {
            router.push(`/employee/${data.user.CODPESSOA}`);
          }
          router.refresh();
        }, 1200);
      } else {
        setErrorMsg(data.error || 'Falha na autenticação.');
      }
    } catch (err: any) {
      setErrorMsg('Ocorreu um erro inesperado ao conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center  p-4 relative overflow-hidden">
      {/* Background Glow sutil e suave */} 
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[28rem] h-[28rem] bg-sky-200/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-100/60 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xl p-8 z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-50 border border-sky-200/80 rounded-full text-sky-700 text-xs font-semibold uppercase tracking-wider mb-3">
            Funcionários
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Atualização Cadastral</h1>
          <p className="text-slate-500 text-xs mt-1.5">
            CSA Leblon - Totvs
          </p>
        </div>

        {errorMsg && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-medium">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs tracking-wider  mb-1.5">
              <span className='font-bold text-slate-600 uppercase'>Usuário</span> <span className=" text-slate-400 font-extralight">(o mesmo do Meu RH e Portal do Professor)</span>
            </label>
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-800 placeholder-slate-400 text-xs transition"
              placeholder="Ex: nome.sobrenome"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-slate-800 placeholder-slate-400 text-xs transition"
              placeholder="Digite sua senha"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl shadow-md shadow-sky-600/15 transition duration-200 disabled:opacity-50 text-xs cursor-pointer"
          >
            {loading ? 'Autenticando...' : 'Entrar'}
          </button>
        </form>
      </div>
          <div className="mt-6 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
          <span>Esqueceu sua senha? Clique abaixo e redefina no portal MeuRH</span>
          <a
            href="https://portal.csa.com.br/FrameHTML/Web/App/RH/PortalMeuRH/#/passwordRecovery"
            target="_blank"
            className="w-[200px] mt-2 py-3 px-4 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl shadow-md shadow-sky-600/15 transition duration-200 disabled:opacity-50 text-xs cursor-pointer"
          >
            Redefinir Senha
          </a>
          </div>
    </main>
  );
}