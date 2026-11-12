const bcrypt = require('bcryptjs');
const { withTransaction } = require('../database');

const TABELAS_TENANT = [
  'clientes',
  'servicos',
  'agendamentos',
  'consumo',
  'mensagens_whatsapp',
  'dias_indisponiveis',
];

async function tabelaExiste(client, nomeTabela) {
  const r = await client.query(`SELECT to_regclass($1) AS reg`, [`public.${nomeTabela}`]);
  return Boolean(r.rows[0]?.reg);
}

/**
 * Migração idempotente para o esquema SaaS Multi-Tenant + Financeiro SaaS.
 * - Garante tabela `usuarios` com `username` (login por usuário + senha) e `email` opcional.
 * - Cria a conta inicial da Vanessa se não houver usuários e vincula os dados existentes a ela.
 * - Garante `usuario_id NOT NULL` e índices em todas as tabelas de negócio.
 * - Garante tabelas `pagamentos_saas` e `despesas_saas` para controle financeiro do painel admin.
 */
async function garantirSchemaSaas() {
  return withTransaction(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id               SERIAL PRIMARY KEY,
        username         VARCHAR(60)  NOT NULL UNIQUE,
        nome             VARCHAR(120) NOT NULL,
        nome_salao       VARCHAR(120),
        email            VARCHAR(160) UNIQUE,
        senha_hash       TEXT NOT NULL,
        role             VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
        ativo            BOOLEAN NOT NULL DEFAULT TRUE,
        waha_session     VARCHAR(80),
        cidade_nome      VARCHAR(120),
        cidade_lat       VARCHAR(30),
        cidade_lon       VARCHAR(30),
        plano            VARCHAR(60) NOT NULL DEFAULT 'Profissional',
        valor_mensal     NUMERIC(10,2) NOT NULL DEFAULT 0,
        dia_vencimento   INT NOT NULL DEFAULT 10,
        observacao_admin TEXT,
        criado_em        TIMESTAMP DEFAULT NOW(),
        atualizado_em    TIMESTAMP DEFAULT NOW()
      );
    `);

    // Caso a tabela já exista de versão anterior (sem username/plano ou com email NOT NULL)
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS username VARCHAR(60)`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano VARCHAR(60) NOT NULL DEFAULT 'Profissional'`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS valor_mensal NUMERIC(10,2) NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dia_vencimento INT NOT NULL DEFAULT 10`);
    await client.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS observacao_admin TEXT`);
    await client.query(`ALTER TABLE usuarios ALTER COLUMN email DROP NOT NULL`);

    // Preenche username caso existam linhas criadas antes da coluna username
    const semUsername = await client.query(
      `SELECT id, email, nome FROM usuarios WHERE username IS NULL OR TRIM(username) = '' ORDER BY id ASC`
    );
    for (const u of semUsername.rows) {
      let base = u.id === 1
        ? (process.env.VANESSA_USUARIO || 'vanessa')
        : (u.email ? u.email.split('@')[0] : u.nome || `user_${u.id}`);
      base = String(base).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') || `user_${u.id}`;
      let candidato = base;
      let sufixo = 1;
      while (true) {
        const dup = await client.query(
          `SELECT 1 FROM usuarios WHERE username = $1 AND id <> $2`,
          [candidato, u.id]
        );
        if (dup.rowCount === 0) break;
        sufixo++;
        candidato = `${base}${sufixo}`;
      }
      await client.query(`UPDATE usuarios SET username = $1 WHERE id = $2`, [candidato, u.id]);
    }

    await client.query(`ALTER TABLE usuarios ALTER COLUMN username SET NOT NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_username ON usuarios (username)`);

    let vanessaId;
    const existente = await client.query(`SELECT id FROM usuarios ORDER BY id ASC LIMIT 1`);
    if (existente.rowCount > 0) {
      vanessaId = existente.rows[0].id;
    } else {
      const username = (process.env.VANESSA_USUARIO || 'vanessa').trim().toLowerCase();
      const email = process.env.VANESSA_EMAIL ? process.env.VANESSA_EMAIL.trim().toLowerCase() : null;
      const senhaEnv = process.env.VANESSA_SENHA;
      const senha = senhaEnv || 'vanessa123';
      const nome = process.env.VANESSA_NOME || 'Vanessa';
      const nomeSalao = process.env.VANESSA_SALAO || 'Studio Vanessa';
      const wahaSession = process.env.WAHA_SESSION || 'default';
      const cidadeNome = process.env.CIDADE_NOME || 'São Paulo - SP';
      const cidadeLat = process.env.CIDADE_LAT || '-23.5505';
      const cidadeLon = process.env.CIDADE_LON || '-46.6333';

      const senhaHash = await bcrypt.hash(senha, 10);
      const ins = await client.query(
        `INSERT INTO usuarios (
           username, nome, nome_salao, email, senha_hash, role, ativo,
           waha_session, cidade_nome, cidade_lat, cidade_lon, plano, valor_mensal
         )
         VALUES ($1, $2, $3, $4, $5, 'admin', TRUE, $6, $7, $8, $9, 'Fundadora', 0)
         RETURNING id`,
        [username, nome, nomeSalao, email, senhaHash, wahaSession, cidadeNome, cidadeLat, cidadeLon]
      );
      vanessaId = ins.rows[0].id;

      console.log(`✿ [SaaS] Conta inicial criada para ${nome} (usuário: ${username}) — ID #${vanessaId}`);
      if (!senhaEnv) {
        console.warn(
          '⚠ [SaaS] ATENÇÃO: VANESSA_SENHA não definida no .env. Senha padrão "vanessa123" aplicada. Troque após o primeiro login!'
        );
      }
    }

    // Garante tabela dias_indisponiveis
    await client.query(`
      CREATE TABLE IF NOT EXISTS dias_indisponiveis (
        usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        data       DATE NOT NULL,
        motivo     VARCHAR(120),
        criado_em  TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (usuario_id, data)
      );
    `);

    for (const tabela of TABELAS_TENANT) {
      if (!(await tabelaExiste(client, tabela))) continue;

      await client.query(
        `ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE`
      );
      await client.query(
        `UPDATE ${tabela} SET usuario_id = $1 WHERE usuario_id IS NULL`,
        [vanessaId]
      );
      await client.query(
        `ALTER TABLE ${tabela} ALTER COLUMN usuario_id SET NOT NULL`
      );
    }

    // Migra chave primária de dias_indisponiveis de (data) para (usuario_id, data)
    if (await tabelaExiste(client, 'dias_indisponiveis')) {
      const pkRes = await client.query(`
        SELECT c.conname,
               ARRAY_AGG(a.attname::text ORDER BY k.ord) AS cols
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
        WHERE n.nspname = 'public'
          AND t.relname = 'dias_indisponiveis'
          AND c.contype = 'p'
        GROUP BY c.conname
      `);

      if (pkRes.rowCount > 0) {
        const { conname, cols } = pkRes.rows[0];
        if (!Array.isArray(cols) || !cols.includes('usuario_id')) {
          await client.query(`ALTER TABLE dias_indisponiveis DROP CONSTRAINT "${conname}"`);
          await client.query(`ALTER TABLE dias_indisponiveis ADD PRIMARY KEY (usuario_id, data)`);
        }
      } else {
        await client.query(`ALTER TABLE dias_indisponiveis ADD PRIMARY KEY (usuario_id, data)`);
      }
    }

    // Tabelas financeiras do painel administrativo SaaS
    await client.query(`
      CREATE TABLE IF NOT EXISTS pagamentos_saas (
        id              SERIAL PRIMARY KEY,
        usuario_id      INT           NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        competencia     VARCHAR(7)    NOT NULL,
        valor           NUMERIC(10,2) NOT NULL,
        status          VARCHAR(20)   NOT NULL DEFAULT 'pago' CHECK (status IN ('pago','pendente','isento')),
        data_pagamento  DATE,
        forma_pagamento VARCHAR(40),
        observacao      VARCHAR(200),
        criado_em       TIMESTAMP     DEFAULT NOW(),
        UNIQUE (usuario_id, competencia)
      );

      CREATE TABLE IF NOT EXISTS despesas_saas (
        id         SERIAL PRIMARY KEY,
        descricao  VARCHAR(150)  NOT NULL,
        categoria  VARCHAR(60)   DEFAULT 'Infraestrutura',
        valor      NUMERIC(10,2) NOT NULL,
        data       DATE          NOT NULL DEFAULT CURRENT_DATE,
        observacao VARCHAR(200),
        criado_em  TIMESTAMP     DEFAULT NOW()
      );
    `);

    // Índices por usuario_id
    if (await tabelaExiste(client, 'clientes')) {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_clientes_usuario ON clientes (usuario_id, nome)`);
    }
    if (await tabelaExiste(client, 'servicos')) {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_servicos_usuario ON servicos (usuario_id, nome)`);
    }
    if (await tabelaExiste(client, 'agendamentos')) {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_agendamentos_usuario_data ON agendamentos (usuario_id, data_hora)`);
    }
    if (await tabelaExiste(client, 'consumo')) {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_consumo_usuario_data ON consumo (usuario_id, data)`);
    }
    if (await tabelaExiste(client, 'mensagens_whatsapp')) {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_mensagens_usuario_status ON mensagens_whatsapp (usuario_id, status)`);
    }
    if (await tabelaExiste(client, 'dias_indisponiveis')) {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_dias_indisp_usuario_data ON dias_indisponiveis (usuario_id, data)`);
    }

    return vanessaId;
  });
}

module.exports = { garantirSchemaSaas };
