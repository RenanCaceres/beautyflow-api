// Worker: pega 1 mensagem pendente por vez e envia com intervalo aleatório (range limit anti-ban)
const { query } = require('../database');
const waha = require('./waha');

const DELAY_MIN  = Number(process.env.WA_DELAY_MIN_S  || 25);  // segundos mínimos entre envios
const DELAY_MAX  = Number(process.env.WA_DELAY_MAX_S  || 60);  // segundos máximos entre envios
const LIMITE_24H = Number(process.env.WA_LIMITE_24H   || 100); // máximo de mensagens em 24h

let timerAtual = null;
let processando = false;

function obterConfigFila() {
  return {
    delayMinSegundos: DELAY_MIN,
    delayMaxSegundos: DELAY_MAX,
    limite24h: LIMITE_24H,
  };
}

async function garantirTabela() {
  await query(`
    ALTER TABLE clientes ADD COLUMN IF NOT EXISTS aceita_whatsapp BOOLEAN NOT NULL DEFAULT TRUE;
  `);
  await query(`
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
  `);
  await query(`
    ALTER TABLE mensagens_whatsapp DROP CONSTRAINT IF EXISTS mensagens_whatsapp_tipo_check;
    ALTER TABLE mensagens_whatsapp ADD CONSTRAINT mensagens_whatsapp_tipo_check
      CHECK (tipo IN ('confirmacao','retorno','marketing','lembrete_dia','lembrete_30m'));
  `);
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_msg_unica
      ON mensagens_whatsapp (cliente_id, tipo, referencia);
  `);
}

async function proximaPendente() {
  // Prioriza confirmações de agendamento, lembretes de 30 min e lembretes do dia na fila, mantendo o range limit
  const r = await query(`
    UPDATE mensagens_whatsapp SET status='enviando'
    WHERE id = (
      SELECT id FROM mensagens_whatsapp
      WHERE status='pendente'
      ORDER BY
        CASE tipo
          WHEN 'confirmacao'  THEN 1
          WHEN 'lembrete_30m' THEN 2
          WHEN 'lembrete_dia' THEN 3
          WHEN 'retorno'      THEN 4
          ELSE 5
        END ASC,
        id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    ) RETURNING *`);
  return r.rows[0];
}

function agendarProximoCiclo(ms) {
  if (timerAtual) clearTimeout(timerAtual);
  timerAtual = setTimeout(ciclo, ms);
}

async function ciclo() {
  if (processando) return;
  processando = true;
  let espera = 5000;

  try {
    const enviadas = await query(
      `SELECT COUNT(*)::int AS n FROM mensagens_whatsapp
       WHERE status='enviada' AND enviado_em > NOW() - INTERVAL '24 hours'`
    );

    if (enviadas.rows[0].n >= LIMITE_24H) {
      espera = 10 * 60 * 1000; // bateu o limite diário, tenta de novo em 10 min
    } else {
      const msg = await proximaPendente();
      if (msg) {
        try {
          const st = await waha.statusSessao();
          if (st !== 'WORKING') throw new Error('SESSAO_OFF:' + st);

          await waha.enviarTexto(msg.telefone, msg.texto);
          await query(
            `UPDATE mensagens_whatsapp SET status='enviada', enviado_em=NOW(), erro=NULL WHERE id=$1`,
            [msg.id]
          );
          // Range limit aleatório entre DELAY_MIN e DELAY_MAX segundos para evitar banimento
          const segundosAleatorios = Math.round(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
          espera = segundosAleatorios * 1000;
          console.log(`✿ [WAHA] Mensagem #${msg.id} enviada (${msg.telefone}). Próximo envio em ${segundosAleatorios}s`);
        } catch (e) {
          if (String(e.message).startsWith('SESSAO_OFF')) {
            // WhatsApp desconectado: devolve pra fila e espera 1 min
            await query(`UPDATE mensagens_whatsapp SET status='pendente' WHERE id=$1`, [msg.id]);
            espera = 60 * 1000;
            console.warn('⚠ WAHA desconectado, pausando fila:', e.message);
          } else {
            await query(
              `UPDATE mensagens_whatsapp SET status='erro', erro=$2 WHERE id=$1`,
              [msg.id, e.message]
            );
            espera = 5000;
          }
        }
      }
    }
  } catch (e) {
    console.error('Erro no worker WhatsApp:', e.message);
    espera = 30 * 1000;
  } finally {
    processando = false;
    agendarProximoCiclo(espera);
  }
}

function acordarFila() {
  if (!processando) {
    agendarProximoCiclo(500);
  }
}

async function iniciar() {
  try {
    await garantirTabela();
    // Se o servidor reiniciou no meio de um envio, volta pra fila
    await query(`UPDATE mensagens_whatsapp SET status='pendente' WHERE status='enviando'`);
    console.log(
      `✿ Worker WhatsApp (WAHA) iniciado (range limit: ${DELAY_MIN}s a ${DELAY_MAX}s | limite 24h: ${LIMITE_24H})`
    );
    ciclo();
  } catch (e) {
    console.error('Erro ao iniciar worker WhatsApp:', e.message);
  }
}

module.exports = { iniciar, acordarFila, obterConfigFila };
