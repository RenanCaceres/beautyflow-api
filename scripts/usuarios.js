#!/usr/bin/env node
/**
 * CLI de gestão de contas do BeautyFlow SaaS.
 * Uso:
 *   node scripts/usuarios.js listar
 *   node scripts/usuarios.js criar --usuario "maria" --nome "Maria Silva" --salao "Studio Maria" --senha "MinhaSenha123" [--email "maria@exemplo.com"] [--plano "Profissional"] [--valor "99.90"] [--vencimento "10"] [--waha "maria"] [--cidade "Curitiba - PR"] [--lat "-25.4284"] [--lon "-49.2733"] [--admin]
 *   node scripts/usuarios.js senha --usuario "vanessa" --nova "NovaSenhaForte"
 *   node scripts/usuarios.js status --usuario "maria" --ativo false
 */
require('dotenv').config();
const { pool } = require('../src/database');
const { garantirSchemaSaas } = require('../src/database/migracaoSaas');
const Usuarios = require('../src/models/Usuarios');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const chave = token.slice(2);
      const prox = argv[i + 1];
      if (!prox || prox.startsWith('--')) {
        args[chave] = true;
      } else {
        args[chave] = prox;
        i++;
      }
    }
  }
  return args;
}

async function main() {
  const [comando, ...resto] = process.argv.slice(2);
  const args = parseArgs(resto);

  if (!comando || ['help', '--help', '-h'].includes(comando)) {
    console.log(`
Uso:
  node scripts/usuarios.js listar
  node scripts/usuarios.js criar --usuario "maria" --nome "Maria" --senha "minimo6chars" [--salao "Studio Maria"] [--email "opcional@email.com"] [--plano "Profissional"] [--valor "99.90"] [--vencimento "10"] [--waha "sessao"] [--cidade "Cidade - UF"] [--lat "-23.55"] [--lon "-46.63"] [--admin]
  node scripts/usuarios.js senha --usuario "vanessa" --nova "NovaSenha"
  node scripts/usuarios.js status --usuario "maria" --ativo true|false
`);
    process.exit(0);
  }

  await garantirSchemaSaas();

  if (comando === 'listar') {
    const lista = await Usuarios.listar();
    console.table(
      lista.map((u) => ({
        id: u.id,
        usuario: u.username,
        nome: u.nome,
        salao: u.nome_salao || '-',
        plano: u.plano,
        mensalidade: Number(u.valor_mensal || 0).toFixed(2),
        role: u.role,
        ativo: u.ativo,
        waha_session: u.waha_session || '(sem WAHA)',
      }))
    );
  } else if (comando === 'criar') {
    const criado = await Usuarios.criar({
      username: args.usuario || args.username,
      nome: args.nome,
      nome_salao: args.salao || null,
      email: args.email || null,
      senha: args.senha,
      role: args.admin ? 'admin' : 'user',
      waha_session: args.waha || null,
      cidade_nome: args.cidade || null,
      cidade_lat: args.lat || null,
      cidade_lon: args.lon || null,
      plano: args.plano || 'Profissional',
      valor_mensal: args.valor || 0,
      dia_vencimento: args.vencimento || 10,
    });
    console.log('✿ Usuário criado com sucesso:', criado);
  } else if (comando === 'senha') {
    const ident = args.usuario || args.username || args.email;
    if (!ident || !args.nova) {
      throw new Error('Informe --usuario e --nova.');
    }
    const u = await Usuarios.buscarPorLoginComSenha(ident);
    if (!u) throw new Error('Usuário não encontrado.');
    await Usuarios.alterarSenha(u.id, args.nova);
    console.log(`✿ Senha atualizada para ${u.username}.`);
  } else if (comando === 'status') {
    const ident = args.usuario || args.username || args.email;
    if (!ident || args.ativo === undefined) {
      throw new Error('Informe --usuario e --ativo true|false.');
    }
    const u = await Usuarios.buscarPorLoginComSenha(ident);
    if (!u) throw new Error('Usuário não encontrado.');
    const ativo = String(args.ativo).toLowerCase() === 'true';
    const atualizado = await Usuarios.atualizarAdmin(u.id, { ativo });
    console.log(`✿ Status atualizado:`, atualizado);
  } else {
    throw new Error(`Comando desconhecido: ${comando}`);
  }
}

main()
  .catch((err) => {
    console.error('Erro:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
