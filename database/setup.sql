-- ===========================================
--  BeautyFlow — PostgreSQL v3 (SaaS Multi-Tenant)
--  Execute no Railway ou em qualquer Postgres
-- ===========================================

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

CREATE TABLE IF NOT EXISTS clientes (
  id              SERIAL PRIMARY KEY,
  usuario_id      INT          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome            VARCHAR(100) NOT NULL,
  telefone        VARCHAR(20)  NOT NULL,
  aceita_whatsapp BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS servicos (
  id                     SERIAL PRIMARY KEY,
  usuario_id             INT            NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome                   VARCHAR(100)   NOT NULL,
  valor                  NUMERIC(10,2)  NOT NULL,
  intervalo_retorno_dias INT            NOT NULL DEFAULT 30,
  criado_em              TIMESTAMP      DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id  INT          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  servico_id  INT          REFERENCES servicos(id),  -- mantido para retrocompatibilidade
  data_hora   TIMESTAMP    NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'agendado'
                CHECK (status IN ('agendado','realizado','cancelado')),
  observacao  VARCHAR(300),
  valor_final NUMERIC(10,2),                         -- valor cobrado (pode diferir do padrão)
  criado_em   TIMESTAMP    DEFAULT NOW()
);

-- Tabela para múltiplos serviços por agendamento
CREATE TABLE IF NOT EXISTS agendamento_servicos (
  agendamento_id INT NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
  servico_id     INT NOT NULL REFERENCES servicos(id),
  PRIMARY KEY (agendamento_id, servico_id)
);

CREATE TABLE IF NOT EXISTS consumo (
  id         SERIAL PRIMARY KEY,
  usuario_id INT           NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  produto    VARCHAR(150)  NOT NULL,
  valor      NUMERIC(10,2) NOT NULL,
  data       DATE          NOT NULL DEFAULT CURRENT_DATE,
  criado_em  TIMESTAMP     DEFAULT NOW()
);

-- Fila/histórico de mensagens do WhatsApp (WAHA)
CREATE TABLE IF NOT EXISTS mensagens_whatsapp (
  id          SERIAL PRIMARY KEY,
  usuario_id  INT          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id  INT          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  telefone    VARCHAR(20)  NOT NULL,
  tipo        VARCHAR(20)  NOT NULL CHECK (tipo IN ('confirmacao','retorno','marketing','lembrete_dia','lembrete_30m')),
  referencia  VARCHAR(100) NOT NULL,
  texto       TEXT         NOT NULL,
  status      VARCHAR(12)  NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('aprovacao','pendente','enviando','enviada','erro')),
  erro        TEXT,
  criado_em   TIMESTAMP    DEFAULT NOW(),
  enviado_em  TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_msg_unica
  ON mensagens_whatsapp (cliente_id, tipo, referencia);

-- Dias em que a profissional está indisponível / de folga (isolado por usuário)
CREATE TABLE IF NOT EXISTS dias_indisponiveis (
  usuario_id INT          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  data       DATE         NOT NULL,
  motivo     VARCHAR(120),
  criado_em  TIMESTAMP    DEFAULT NOW(),
  PRIMARY KEY (usuario_id, data)
);

CREATE INDEX IF NOT EXISTS idx_clientes_usuario          ON clientes (usuario_id, nome);
CREATE INDEX IF NOT EXISTS idx_servicos_usuario          ON servicos (usuario_id, nome);
CREATE INDEX IF NOT EXISTS idx_agendamentos_usuario_data ON agendamentos (usuario_id, data_hora);
CREATE INDEX IF NOT EXISTS idx_consumo_usuario_data      ON consumo (usuario_id, data);
CREATE INDEX IF NOT EXISTS idx_mensagens_usuario_status  ON mensagens_whatsapp (usuario_id, status);
CREATE INDEX IF NOT EXISTS idx_dias_indisp_usuario_data  ON dias_indisponiveis (usuario_id, data);
