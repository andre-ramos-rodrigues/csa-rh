//'use client';

import MigrationData from './migrationdata';

export default function RHMigrationPage() {
  return (
    <main className="min-h-screen bg-white text-slate-100 p-8">      
      {/* Main Content Grid */}
      <div className="max-w-6xl mx-auto flex items-center justify-between py-4 px-6 bg-white/90 border border-slate-200/80 rounded-2xl shadow-sm backdrop-blur-xl">
        <MigrationData />
      </div>
    </main>
  );
}