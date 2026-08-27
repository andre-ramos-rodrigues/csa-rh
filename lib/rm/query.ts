import "server-only";

export async function processMigrationData(changeRequestFields: any[]) {
  console.log('\n==================================================');
  console.log('🚀 INICIANDO MIGRAÇÃO (MODO SIMULAÇÃO / SEM TOTVS PATCH)');
  console.log('==================================================\n');

  // ----------------------------------------------------
  // 1. SIMULAÇÃO DE DEPENDENTES
  // ----------------------------------------------------
  const dependenteFields = changeRequestFields.filter(
    (f) => f.field_name === 'DEPENDENTES'
  );

  if (dependenteFields.length > 0) {
    console.log('👨‍👩‍👧‍👦 === [SIMULAÇÃO] MÓDULO DE DEPENDENTES ===');

    const novosDependentes: any[] = [];
    const dependentesExistentes: any[] = [];

    dependenteFields.forEach((field) => {
      try {
        const value = typeof field.new_value === 'string' 
          ? JSON.parse(field.new_value) 
          : field.new_value;

        // Trata tanto objetos individuais quanto arrays completos
        const items = Array.isArray(value) ? value : [value];

        items.forEach((item) => {
          if (item.target_id === 'NEW' || item.isExisting === false) {
            novosDependentes.push(item);
          } else {
            dependentesExistentes.push(item);
          }
        });
      } catch (err) {
        console.error(`❌ Erro ao ler payload de DEPENDENTES (Field ID: ${field.id})`);
      }
    });

    console.log(`\n✨ NOVOS DEPENDENTES A CADASTRAR (${novosDependentes.length}):`);
    console.dir(novosDependentes, { depth: null, colors: true });

    console.log(`\n🔒 DEPENDENTES EXISTENTES A ATUALIZAR/MANTER (${dependentesExistentes.length}):`);
    console.dir(dependentesExistentes, { depth: null, colors: true });
  }

  // ----------------------------------------------------
  // 2. SIMULAÇÃO DE FORMAÇÃO ACADÊMICA
  // ----------------------------------------------------
  const formacaoFields = changeRequestFields.filter(
    (f) => f.field_name === 'FORMACAO_ACADEMICA'
  );

  if (formacaoFields.length > 0) {
    console.log('\n🎓 === [SIMULAÇÃO] MÓDULO DE FORMAÇÃO ACADÊMICA ===');

    const novasFormacoes: any[] = [];
    const formacoesExistentes: any[] = [];

    formacaoFields.forEach((field) => {
      try {
        const value = typeof field.new_value === 'string' 
          ? JSON.parse(field.new_value) 
          : field.new_value;

        const items = Array.isArray(value) ? value : [value];

        items.forEach((item) => {
          if (item.isExisting === false || String(item.ID).startsWith('novo_')) {
            novasFormacoes.push(item);
          } else {
            formacoesExistentes.push(item);
          }
        });
      } catch (err) {
        console.error(`❌ Erro ao ler payload de FORMAÇÃO ACADÊMICA (Field ID: ${field.id})`);
      }
    });

    console.log(`\n✨ NOVAS FORMAÇÕES ACADÊMICAS (${novasFormacoes.length}):`);
    console.dir(novasFormacoes, { depth: null, colors: true });

    console.log(`\n🔒 FORMAÇÕES ACADÊMICAS EXISTENTES (${formacoesExistentes.length}):`);
    console.dir(formacoesExistentes, { depth: null, colors: true });
  }

  console.log('\n==================================================');
  console.log('✅ SIMULAÇÃO CONCLUÍDA');
  console.log('==================================================\n');
}