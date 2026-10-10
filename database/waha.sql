-- Fila/histórico de mensagens do WhatsApp (WAHA)
CREATE TABLE IF NOT EXISTS mensagens_whatsapp (
  id          SERIAL PRIMARY KEY,
  cliente_id  INT          NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  telefone    VARCHAR(20)  NOT NULL,
  tipo        VARCHAR(20)  NOT NULL CHECK (tipo IN ('confirmacao','retorno','marketing','lembrete_dia','lembrete_30m')),
  referencia  VARCHAR(100) NOT NULL,   -- retorno/lembretes: id/data do atendimento | marketing: id da campanha
  texto       TEXT         NOT NULL,
  status      VARCHAR(12)  NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente','enviando','enviada','erro')),
  erro        TEXT,
  criado_em   TIMESTAMP    DEFAULT NOW(),
  enviado_em  TIMESTAMP
);

-- Atualiza constraint caso a tabela já exista de versão anterior
ALTER TABLE mensagens_whatsapp DROP CONSTRAINT IF EXISTS mensagens_whatsapp_tipo_check;
ALTER TABLE mensagens_whatsapp ADD CONSTRAINT mensagens_whatsapp_tipo_check
  CHECK (tipo IN ('confirmacao','retorno','marketing','lembrete_dia','lembrete_30m'));

-- Evita mandar o mesmo lembrete duas vezes pro mesmo atendimento/campanha
CREATE UNIQUE INDEX IF NOT EXISTS ux_msg_unica
  ON mensagens_whatsapp (cliente_id, tipo, referencia);

-- Permite a cliente pedir pra não receber mais mensagens
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS aceita_whatsapp BOOLEAN NOT NULL DEFAULT TRUE;
