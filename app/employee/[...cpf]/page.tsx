'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import EmployeeData from '../employeeData';
import EmployeeEditData from '../employeeEditData';
import { checkIsRhUser } from '@/lib/constants';

export default function EmployeePage() {
  const params = useParams();

  // Recebe o codPessoa presente no parâmetro [cpf] da URL (ex: 17316)
  const codPessoaRaw = Array.isArray(params?.cpf) ? params.cpf[0] : params?.cpf;

  const [employee, setEmployee] = useState<any | null>(null);
  const [resultDependentes, setResultDependentes] = useState<any[]>([]);
  const [resultFormacaoAcademica, setResultFormacaoAcademica] = useState<any[]>([]);
  const [changeRequest, setChangeRequest] = useState<any | null>(null);
  const [isRh, setIsRh] = useState<boolean>(false);
  const [isSelfAccess, setIsSelfAccess] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

const fetchAllData = useCallback(async () => {
    if (!codPessoaRaw) return;

    setLoading(true);
    setError(null);
    try {
      const codPessoa = String(codPessoaRaw).trim();

      // 1. Chamada inicial em paralelo para TOTVS (codPessoa) e Sessão do usuário
      const [empRes, userRes] = await Promise.all([
        fetch(`/api/totvs/employee/${codPessoa}`),
        fetch(`/api/auth/me`, { credentials: 'include' }).catch(() => null),
      ]);

      if (!empRes.ok) {
        const errorText = await empRes.text();
        console.error('[ERRO /api/totvs/employee]:', errorText);
        throw new Error(`A API do TOTVS falhou com status ${empRes.status}. Verifique o terminal do servidor.`);
      }
      const empData = await empRes.json();

      // Extrai o CPF real retornado pelo TOTVS (somente números)
      const fetchedEmployeeCpf = empData?.employee?.CPF || empData?.employee?.cpf
        ? String(empData.employee.CPF || empData.employee.cpf).replace(/\D/g, '')
        : '';

      // 2. Com o CPF obtido do TOTVS, faz a chamada na API do change-request
      let reqData: any = null;
      if (fetchedEmployeeCpf) {
        const reqRes = await fetch(`/api/change-request/employee/${fetchedEmployeeCpf}`);
        if (!reqRes.ok) {
          const errorText = await reqRes.text();
          console.error('[ERRO /api/change-request]:', errorText);
          throw new Error(`A API de solicitações falhou com status ${reqRes.status}.`);
        }
        reqData = await reqRes.json();
      }

      // 3. Checagem de perfil e permissão do próprio perfil
      let hasRhAccess = false;
      let isOwnProfile = false;

      if (userRes && userRes.ok) {
        const contentType = userRes.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const userData = await userRes.json();
          const username = userData?.user?.usuario || '';

          hasRhAccess = checkIsRhUser(username) || !!userData?.user?.isRh;

          // CPF do usuário logado na sessão
          const loggedUserCpf = userData?.user?.cpf
            ? String(userData.user.cpf).replace(/\D/g, '')
            : '';

          // codPessoa do usuário logado na sessão (se houver)
          const loggedCodPessoa = userData?.user?.codPessoa
            ? String(userData.user.codPessoa).trim()
            : '';

          // Valida se é o próprio perfil comparando CPF ou codPessoa
          const isSameCpf = Boolean(loggedUserCpf && fetchedEmployeeCpf && loggedUserCpf === fetchedEmployeeCpf);
          const isSameCodPessoa = Boolean(loggedCodPessoa && loggedCodPessoa === codPessoa);

          isOwnProfile = isSameCpf || isSameCodPessoa;

          console.log(
            `[Sessão de Usuário] Usuário: "${username}" | É RH: ${hasRhAccess} | Próprio perfil: ${isOwnProfile}`
          );
        }
      }

      setIsRh(hasRhAccess);
      setIsSelfAccess(isOwnProfile);

      if (empData.success && empData.employee) {
        setEmployee(empData.employee);
        setResultDependentes(empData.resultDependentes || []);
        setResultFormacaoAcademica(empData.resultFormacaoAcademica || []);
      } else {
        setError(empData.error || 'Funcionário não encontrado no TOTVS.');
      }

      if (reqData && reqData.success) {
        setChangeRequest(reqData);
      } else {
        setChangeRequest(null);
      }
    } catch (err: any) {
      console.error('Erro na requisição da página employee:', err);
      setError(err.message || 'Não foi possível conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  }, [codPessoaRaw]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const showRhView = isRh && !isSelfAccess;

  return (
    <div className="min-h-screen bg-slate-50 flex justify-center p-4">
      {loading && (
        <div className="text-center my-auto">
          <div className="w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm animate-pulse">
            Buscando dados no TOTVS e SQLite...
          </p>
        </div>
      )}

      {!loading && error && (
        <div className="w-full max-w-md text-center bg-white border border-rose-200 rounded-2xl p-6 shadow-sm my-auto">
          <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 text-xl font-bold mx-auto mb-3">
            !
          </div>
          <h3 className="text-slate-900 font-bold mb-1">Ops! Ocorreu um problema</h3>
          <p className="text-rose-600 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
          >
            Voltar ao painel
          </button>
        </div>
      )}

      {!loading && !error && employee && (
        showRhView ? (
          <EmployeeData
            employee={employee}
            resultDependentes={resultDependentes}
            resultFormacaoAcademica={resultFormacaoAcademica}
            changeRequest={changeRequest}
            onApproveField={async () => {
              await fetchAllData();
            }}
          />
        ) : (
          <EmployeeEditData
            employee={employee}
            resultDependentes={resultDependentes}
            resultFormacaoAcademica={resultFormacaoAcademica}
            existingRequest={changeRequest}
          />
        )
      )}
    </div>
  );
}