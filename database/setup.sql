-- ===========================================
--  BeautyFlow — PostgreSQL v2
--  Execute no Railway ou em qualquer Postgres
-- ===========================================

CREATE TABLE IF NOT EXISTS clientes (
  id         SERIAL PRIMARY KEY,
  nome       VARCHAR(100) NOT NULL,
  telefone   VARCHAR(20)  NOT NULL,
  criado_em  TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS servicos (
  id                     SERIAL PRIMARY KEY,
  nome                   VARCHAR(100)   NOT NULL,
  valor                  NUMERIC(10,2)  NOT NULL,
  intervalo_retorno_dias INT            NOT NULL DEFAULT 30,
  criado_em              TIMESTAMP      DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id          SERIAL PRIMARY KEY,
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
  id        SERIAL PRIMARY KEY,
  produto   VARCHAR(150)  NOT NULL,
  valor     NUMERIC(10,2) NOT NULL,
  data      DATE          NOT NULL DEFAULT CURRENT_DATE,
  criado_em TIMESTAMP     DEFAULT NOW()
);

-- Migração: popula agendamento_servicos com dados existentes
INSERT INTO agendamento_servicos (agendamento_id, servico_id)
SELECT id, servico_id FROM agendamentos
WHERE servico_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Permite a cliente pedir pra não receber mais mensagens no WhatsApp
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS aceita_whatsapp BOOLEAN NOT NULL DEFAULT TRUE;

-- Fila/histórico de mensagens do WhatsApp (WAHA)
CREATE TABLE IF NOT EXISTS mensagens_whatsapp (
  id          SERIAL PRIMARY KEY,
  cliente_id  INT          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  telefone    VARCHAR(20)  NOT NULL,
  tipo        VARCHAR(20)  NOT NULL CHECK (tipo IN ('confirmacao','retorno','marketing','lembrete_dia','lembrete_30m')),
  referencia  VARCHAR(100) NOT NULL,
  texto       TEXT         NOT NULL,
  status      VARCHAR(12)  NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','enviando','enviada','erro')),
  erro        TEXT,
  criado_em   TIMESTAMP    DEFAULT NOW(),
  enviado_em  TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_msg_unica
  ON mensagens_whatsapp (cliente_id, tipo, referencia);


-- Dados de exemplo (só insere se estiver vazio)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clientes LIMIT 1) THEN

    INSERT INTO clientes (nome, telefone) VALUES
      ('Ana Paula Silva',   '(43) 9 9123-4567'),
      ('Carla Mendes',      '(43) 9 9876-5432'),
      ('Juliana Rodrigues', '(43) 9 9111-2233'),
      ('Mariana Ferreira',  '(43) 9 9444-5566'),
      ('Patricia Souza',    '(43) 9 9555-7788');

    INSERT INTO servicos (nome, valor, intervalo_retorno_dias) VALUES
      ('Limpeza de Pele',       150.00, 30),
      ('Design de Sobrancelha',  50.00, 21),
      ('Peeling Químico',       220.00, 45),
      ('Hidratação Facial',      90.00, 15);

    INSERT INTO agendamentos (cliente_id, servico_id, data_hora, status) VALUES
      (1, 1, NOW(),                    'agendado'),
      (2, 2, NOW(),                    'agendado'),
      (3, 3, NOW() - INTERVAL '2 days','realizado'),
      (4, 4, NOW() - INTERVAL '5 days','realizado'),
      (5, 1, NOW() - INTERVAL '1 day', 'realizado');

    INSERT INTO agendamento_servicos (agendamento_id, servico_id) VALUES
      (1, 1), (2, 2), (3, 3), (4, 4), (5, 1);

    INSERT INTO consumo (produto, valor, data) VALUES
      ('Ácido Glicólico 30%',          89.00, CURRENT_DATE - 10),
      ('Creme Hidratante Profissional', 134.00, CURRENT_DATE - 12),
      ('Henna para Sobrancelha',         45.00, CURRENT_DATE - 15);

  END IF;
END $$;
