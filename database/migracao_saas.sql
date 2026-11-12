-- ==========================================================
--  BeautyFlow SaaS — Migração Multi-Tenant (referência SQL)
--  Obs: A API também executa esta migração automaticamente
--  na inicialização via src/database/migracaoSaas.js.
-- ==========================================================

BEGIN;

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

ALTER TABLE clientes           ADD COLUMN IF NOT EXISTS usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE servicos           ADD COLUMN IF NOT EXISTS usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE agendamentos       ADD COLUMN IF NOT EXISTS usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE consumo            ADD COLUMN IF NOT EXISTS usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE mensagens_whatsapp ADD COLUMN IF NOT EXISTS usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE dias_indisponiveis ADD COLUMN IF NOT EXISTS usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE;

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

COMMIT;
