'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Employee {
  DESCRICAO: string;
  CODEQUIPE: string;
  NOME: string;
  CPF: string;
  EMAIL: string;
  CODIGO: string;
}

interface ChangeSummary {
  employee_cpf: string;
  request_id: number;
  status: 'pending' | 'approved' | 'rejected' | 'partially_approved' | 'migrated';
  submitted_at: string;
  attachments_count: number;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'none' | 'migrated';

const STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  pending: {
    label: 'Solicitado',
    className: 'bg-amber-950/40 border-amber-800 text-amber-300',
  },
  approved: {
    label: 'Aprovado',
    className: 'bg-emerald-950/40 border-emerald-800 text-emerald-300',
  },
  rejected: {
    label: 'Rejeitado',
    className: 'bg-rose-950/40 border-rose-800 text-rose-300',
  },
    migrated: {
    label: 'Migrado',
    className: 'bg-emerald-750/40 border-emerald-800 text-emerald-300',
  },
};

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending', label: 'Pendente de aprovação' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'rejected', label: 'Rejeitado' },
  { value: 'none', label: 'Sem solicitação' },
  { value: 'migrated', label: 'Migrado'}
];

function sanitizeCpf(cpf: string) {
  if (!cpf) return '';
  return String(cpf).replace(/\D/g, '');
}

function formatCpf(cpf: string) {
  const clean = sanitizeCpf(cpf);
  if (!clean || clean.length !== 11) return cpf;
  return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '');
}

export default function EmployeesPanel() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summaries, setSummaries] = useState<Map<string, ChangeSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [employeesRes, summaryRes] = await Promise.all([
          fetch('/api/allemployees'),
          fetch('/api/change-request/summary'),
        ]);
        const employeesData = await employeesRes.json();
        const summaryData = await summaryRes.json();

        if (employeesData.success) {
          setEmployees(employeesData.employees);
        } else {
          setError('Falha ao carregar funcionários, ' + (employeesData.error || 'erro desconhecido.'));
        }

        if (summaryData.success) {
          const map = new Map<string, ChangeSummary>();
          summaryData.summaries.forEach((s: ChangeSummary) => {
            map.set(sanitizeCpf(s.employee_cpf), s);
          });
          setSummaries(map);
        }
      } catch (err) {
        setError('Não foi possível conectar às APIs.');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const teams = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((e) => map.set(e.CODEQUIPE, e.DESCRICAO));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [employees]);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const matchesSearch = e.NOME.toLowerCase().includes(search.toLowerCase());
      const matchesTeam = teamFilter === 'all' || e.CODEQUIPE === teamFilter;

      const summary = summaries.get(sanitizeCpf(e.CPF));

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'none' && !summary) ||
        summary?.status === statusFilter;

      return matchesSearch && matchesTeam && matchesStatus;
    });
  }, [employees, search, teamFilter, statusFilter, summaries]);

  return (
    <div className="w-full shrink-0 mx-auto bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-bold text-slate-900">Funcionários</h2>
        <span className="text-xs text-slate-500 font-mono">
          {loading ? '...' : `${filtered.length} de ${employees.length}`}
        </span>
      </div>

      {/* Busca e filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition"
          />
        </div>

        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition sm:w-56"
        >
          <option value="all">Todas as equipes</option>
          {teams.map(([code, desc]) => (
            <option key={code} value={code}>
              {desc} (Equipe {code})
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition sm:w-56"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Estados de loading / erro */}
      {loading && (
        <p className="text-slate-500 text-sm animate-pulse">Carregando funcionários...</p>
      )}

      {error && <p className="text-rose-600 text-sm font-medium">{error}</p>}

      {/* Lista de funcionários */}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto pr-1">
          {filtered.length === 0 && (
            <p className="text-slate-400 text-sm italic col-span-2">
              Nenhum funcionário encontrado.
            </p>
          )}

          {filtered.map((emp) => {
            const cleanCpf = sanitizeCpf(emp.CPF);
            const summary = summaries.get(cleanCpf);
            const statusConfig = summary ? STATUS_CONFIG[summary.status] : null;

            return (
              <div
                key={emp.CPF}
                //onClick={() => router.push(`/employee/${cleanCpf}`)}
                onClick={() => router.push(`/employee/${emp.CODIGO}`)}
                className="w-full p-4 bg-slate-50/60 hover:bg-slate-50 border border-slate-200/80 hover:border-sky-300 rounded-xl transition cursor-pointer select-none shadow-2xs hover:shadow-xs"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-sky-600 flex items-center justify-center font-bold text-white text-xs shadow-xs">
                    {initials(emp.NOME)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{emp.NOME}</p>
                    <p className="text-xs text-slate-500 truncate">{emp.EMAIL}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      CPF: {formatCpf(emp.CPF)}
                    </p>

                    <div className="flex items-center flex-wrap gap-1.5 mt-2">
                      <span className="px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-semibold">
                        {emp.DESCRICAO} · Equipe {emp.CODEQUIPE}
                      </span>

                      {/* Tag de status da solicitação */}
                      {statusConfig ? (
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-semibold transition ${statusConfig.className}`}
                        >
                          {statusConfig.label}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-semibold transition"
                        >
                          sem solicitação
                        </button>
                      )}

                      {/* Tag de anexo */}
                      {summary && summary.attachments_count > 0 && (
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-semibold hover:bg-purple-100 transition"
                        >
                          Anexo ({summary.attachments_count})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}