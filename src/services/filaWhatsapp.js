// Worker: pega 1 mensagem pendente por vez e envia com intervalo aleatório (range limit anti-ban)
const { query } = require('../database');
const waha = require('./waha');

const DELAY_MIN  = Number(process.env.WA_DELAY_MIN_S  || 25);  // segundos mínimos entre envios
const DELAY_MAX  = Number(process.env.WA_DELAY_MAX_S  || 60);  // segundos máximos entre envios
const LIMITE_24H = Number(process.env.WA_LIMITE_24H   || 100); // máximo de mensagens em 24h por usuário

let timerAtual = null;
let processando = false;

function obterConfigFila() {
  return {
    delayMinSegundos: DELAY_MIN,
    delayMaxSegundos: DELAY_MAX,
    limite24h: LIMITE_24H,
  };
}

async function limparFilaObsoleta() {
  // Limpa da fila eventuais mensagens de retorno pendentes/em aprovação de clientes que já têm horário agendado no futuro
  await query(`
    DELETE FROM mensagens_whatsapp m
    WHERE m.status IN ('pendente', 'aprovacao')
      AND m.tipo = 'retorno'
      AND EXISTS (
        SELECT 1 FROM agendamentos a
        WHERE a.usuario_id = m.usuario_id
          AND a.cliente_id = m.cliente_id
          AND a.status = 'agendado'
          AND a.data_hora::date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
      )
  `);
}

async function proximaPendente() {
  // Prioriza confirmações de agendamento, lembretes de 30 min e lembretes do dia na fila,
  // respeitando o limite de 24h por usuário/conta e apenas contas com waha_session configurada.
  const r = await query(
    `WITH escolhida AS (
       SELECT m.id, u.waha_session
       FROM mensagens_whatsapp m
       JOIN usuarios u ON u.id = m.usuario_id
       WHERE m.status = 'pendente'
         AND u.ativo = TRUE
         AND COALESCE(TRIM(u.waha_session), '') <> ''
         AND (
           SELECT COUNT(*)::int
           FROM mensagens_whatsapp m2
           WHERE m2.usuario_id = m.usuario_id
             AND m2.status = 'enviada'
             AND m2.enviado_em > NOW() - INTERVAL '24 hours'
         ) < $1
       ORDER BY
         CASE m.tipo
           WHEN 'confirmacao'  THEN 1
           WHEN 'lembrete_30m' THEN 2
           WHEN 'lembrete_dia' THEN 3
           WHEN 'retorno'      THEN 4
           ELSE 5
         END ASC,
         m.id ASC
       LIMIT 1
       FOR UPDATE OF m SKIP LOCKED
     )
     UPDATE mensagens_whatsapp m
     SET status = 'enviando'
     FROM escolhida e
     WHERE m.id = e.id
     RETURNING m.*, e.waha_session`,
    [LIMITE_24H]
  );
  return r.rows[0];
}

function agendarProximoCiclo(ms) {
  if (timerAtual) clearTimeout(timerAtual);
  timerAtual = setTimeout(ciclo, ms);
}

async function agendamentoAindaValido(msg) {
  const m = /^ag-(conf|dia|30m)-(\d+)-(.+)$/.exec(String(msg.referencia || ''));
  if (!m) return true;

  const agId = parseInt(m[2], 10);
  const refChave = m[3];
  const r = await query(
    `SELECT id, status, data_hora FROM agendamentos WHERE id = $1 AND usuario_id = $2 LIMIT 1`,
    [agId, msg.usuario_id]
  );

  // Agendamento foi excluído do banco
  if (r.rowCount === 0) return false;

  const ag = r.rows[0];
  // Lembretes (do dia / 30min) só devem sair se o agendamento continuar 'agendado'
  if (msg.tipo !== 'confirmacao' && ag.status !== 'agendado') return false;

  // Se o horário foi remarcado, descarta mensagens do horário antigo
  if (refChave && ag.data_hora) {
    const chaveAtual = new Date(ag.data_hora).toISOString().slice(0, 16);
    if (chaveAtual !== refChave) return false;
  }

  return true;
}

async function ciclo() {
  if (processando) return;
  processando = true;
  let espera = 5000;

  try {
    const msg = await proximaPendente();
    if (msg) {
      try {
        // Garante que confirmações e lembretes não sejam enviados para agendamentos removidos/cancelados/remarcados
        if (['confirmacao', 'lembrete_dia', 'lembrete_30m'].includes(msg.tipo)) {
          const valido = await agendamentoAindaValido(msg);
          if (!valido) {
            await query(`DELETE FROM mensagens_whatsapp WHERE id = $1`, [msg.id]);
            console.log(`✿ [WAHA] Mensagem #${msg.id} (${msg.tipo}) descartada: agendamento removido/alterado.`);
            espera = 1000;
            return;
          }
        }

        // Antes de enviar mensagem de retorno, confere se a cliente não tem agendamento futuro marcado
        if (msg.tipo === 'retorno') {
          const temFuturo = await query(
            `SELECT 1 FROM agendamentos
             WHERE usuario_id = $1
               AND cliente_id = $2
               AND status = 'agendado'
               AND data_hora::date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
             LIMIT 1`,
            [msg.usuario_id, msg.cliente_id]
          );
          if (temFuturo.rowCount > 0) {
            await query(`DELETE FROM mensagens_whatsapp WHERE id = $1`, [msg.id]);
            console.log(`✿ [WAHA] Retorno #${msg.id} cancelado: cliente #${msg.cliente_id} já possui agendamento futuro.`);
            espera = 1000;
            return;
          }
        }

        const st = await waha.statusSessao(msg.waha_session);
        if (st !== 'WORKING') throw new Error('SESSAO_OFF:' + st);

        await waha.enviarTexto(msg.telefone, msg.texto, msg.waha_session);
        await query(
          `UPDATE mensagens_whatsapp SET status='enviada', enviado_em=NOW(), erro=NULL WHERE id=$1`,
          [msg.id]
        );
        const segundosAleatorios = Math.round(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
        espera = segundosAleatorios * 1000;
        console.log(
          `✿ [WAHA:${msg.waha_session}] Mensagem #${msg.id} enviada (${msg.telefone}). Próximo envio em ${segundosAleatorios}s`
        );
      } catch (e) {
        if (String(e.message).startsWith('SESSAO_OFF')) {
          const statusOff = String(e.message).replace('SESSAO_OFF:', '').trim();
          if (statusOff === 'FAILED' || statusOff === 'STOPPED') {
            console.warn(`⚠ Sessão WAHA '${msg.waha_session}' em '${statusOff}'. Tentando reconectar...`);
            waha.reiniciarSessao(msg.waha_session).catch((err) =>
              console.error('Falha ao tentar auto-recuperar sessão WAHA:', err.message)
            );
          }
          await query(`UPDATE mensagens_whatsapp SET status='pendente' WHERE id=$1`, [msg.id]);
          espera = 30 * 1000;
          console.warn(`⚠ WAHA (${msg.waha_session}) desconectado, pausando fila:`, e.message);
        } else {
          await query(
            `UPDATE mensagens_whatsapp SET status='erro', erro=$2 WHERE id=$1`,
            [msg.id, e.message]
          );
          espera = 5000;
        }
      }
    } else {
      // Sem mensagens elegíveis agora (fila vazia ou usuários no limite de 24h)
      espera = 10 * 1000;
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
    await limparFilaObsoleta();
    // Se o servidor reiniciou no meio de um envio, volta pra fila
    await query(`UPDATE mensagens_whatsapp SET status='pendente' WHERE status='enviando'`);
    console.log(
      `✿ Worker WhatsApp (WAHA) iniciado (range limit: ${DELAY_MIN}s a ${DELAY_MAX}s | limite 24h/conta: ${LIMITE_24H})`
    );

    try {
      const sessoes = await query(
        `SELECT DISTINCT TRIM(waha_session) AS sessao
         FROM usuarios
         WHERE ativo = TRUE AND COALESCE(TRIM(waha_session), '') <> ''`
      );
      for (const row of sessoes.rows) {
        try {
          const st = await waha.statusSessao(row.sessao);
          if (st === 'FAILED' || st === 'STOPPED') {
            console.log(`✿ Sessão WAHA '${row.sessao}' encontrada em '${st}'. Acionando reinício...`);
            await waha.reiniciarSessao(row.sessao);
          }
        } catch (err) {
          console.warn(`Aviso: não foi possível checar sessão WAHA '${row.sessao}':`, err.message);
        }
      }
    } catch (e) {
      console.warn('Aviso: falha ao listar sessões WAHA na inicialização:', e.message);
    }

    ciclo();
  } catch (e) {
    console.error('Erro ao iniciar worker WhatsApp:', e.message);
  }
}

module.exports = { iniciar, acordarFila, obterConfigFila };
