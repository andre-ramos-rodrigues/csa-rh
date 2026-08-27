'use client';

import EmployeesPanel from './EmployeesPanel';

interface DbTestResult {
  success: boolean;
  totvs_mysql: {
    connected: boolean;
    latency_ms?: number;
    data?: any;
    config?: {
      host: string;
      port: string;
      database: string;
      user: string;
    };
    error?: string;
  };
  app_sqlite: {
    connected: boolean;
    latency_ms?: number;
    data?: any;
    path?: string;
    error?: string;
  };
}

export default function DashboardPage() {

  return (
    <main className="min-h-screen bg-white text-slate-100 p-8">      
      {/* Main Content Grid */}
      <div className="max-w-6xl mx-auto flex items-center justify-between py-4 px-6 bg-white/90 border border-slate-200/80 rounded-2xl shadow-sm backdrop-blur-xl">
        <EmployeesPanel />
      </div>
    </main>
  );
}