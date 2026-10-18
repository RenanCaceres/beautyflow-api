const express = require('express');
const router  = express.Router();
const { query } = require('../database');
const waha = require('../services/waha');
const { acordarFila, obterConfigFila } = require('../services/filaWhatsapp');
const { enfileirarRetornos, montarReferencia } = require('../jobs/retornoAutomatico');

function personalizarMensagem(template, nomeCompleto) {
  const nomeLimpo = String(nomeCompleto || '').trim();
  const primeiroNome = nomeLimpo.split(' ')[0] || nomeLimpo;
  if (/\{\{\s*nome\s*\}\}/i.test(template)) {
    return template.replace(/\{\{\s*nome\s*\}\}/gi, primeiroNome);
  }
  return template;
}

// GET /api/whatsapp/status -> mostra se o WhatsApp está conectado + configuração do range limit
router.get('/status', async (req, res) => {
  try {
    const sessao = await waha.statusSessao();
    res.json({ sessao, config: obterConfigFila() });
  } catch (e) {
    res.status(503).json({
      sessao: 'INDISPONIVEL',
      erro: e.message,
      config: obterConfigFila(),
    });
  }
});

// POST /api/whatsapp/reconectar -> Tenta reconectar/reiniciar a sessão do WhatsApp caso tenha caído
router.post('/reconectar', async (req, res) => {
  try {
    await waha.reiniciarSessao();
    acordarFila();
    const sessao = await waha.statusSessao().catch(() => 'REINICIANDO');
    res.json({ ok: true, sessao, mensagem: 'Reinicialização da sessão WAHA executada.' });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// GET /api/whatsapp/fila -> resumo da fila (aprovacao / pendente / enviando / enviada / erro) + itens aguardando confirmação
router.get('/fila', async (req, res, next) => {
  try {
    const [r, aprov] = await Promise.all([
      query(`SELECT status, COUNT(*)::int AS total FROM mensagens_whatsapp GROUP BY status`),
      query(`
        SELECT m.id, m.cliente_id, c.nome AS cliente_nome, m.telefone, m.texto, m.referencia, m.criado_em
        FROM mensagens_whatsapp m
        JOIN clientes c ON c.id = m.cliente_id
        WHERE m.status = 'aprovacao'
          AND m.tipo = 'retorno'
          AND NOT EXISTS (
            SELECT 1 FROM agendamentos a
            WHERE a.cliente_id = m.cliente_id
              AND a.status = 'agendado'
              AND a.data_hora::date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
          )
        ORDER BY c.nome ASC
      `),
    ]);
    const contadores = { aprovacao: 0, pendente: 0, enviando: 0, enviada: 0, erro: 0 };
    for (const row of r.rows) {
      contadores[row.status] = row.total;
    }
    res.json({
      contadores,
      aguardandoAprovacao: aprov.rows,
      itens: r.rows,
      config: obterConfigFila(),
    });
  } catch (e) { next(e); }
});

// POST /api/whatsapp/retorno/aprovar -> Confirma o envio das mensagens automáticas de retorno
// body: { ids?: [1, 2, 3] } (se passar ids, aprova apenas as selecionadas e descarta as desmarcadas)
router.post('/retorno/aprovar', async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    let aprovadas = 0;

    if (Array.isArray(ids) && ids.length > 0) {
      const idsNum = ids.map((id) => parseInt(id, 10)).filter(Boolean);
      const r = await query(
        `UPDATE mensagens_whatsapp
         SET status = 'pendente'
         WHERE status = 'aprovacao' AND tipo = 'retorno' AND id = ANY($1::int[])`,
        [idsNum]
      );
      aprovadas = r.rowCount;
      // Remove as que foram desmarcadas pela usuária neste lote
      await query(
        `DELETE FROM mensagens_whatsapp WHERE status = 'aprovacao' AND tipo = 'retorno'`
      );
    } else {
      const r = await query(
        `UPDATE mensagens_whatsapp SET status = 'pendente' WHERE status = 'aprovacao' AND tipo = 'retorno'`
      );
      aprovadas = r.rowCount;
    }

    if (aprovadas > 0) {
      acordarFila();
    }

    res.json({
      ok: true,
      aprovadas,
      config: obterConfigFila(),
    });
  } catch (e) { next(e); }
});

// POST /api/whatsapp/retorno/rejeitar -> Cancela o lote de retorno que estava aguardando confirmação
router.post('/retorno/rejeitar', async (req, res, next) => {
  try {
    const r = await query(
      `DELETE FROM mensagens_whatsapp WHERE status = 'aprovacao' AND tipo = 'retorno'`
    );
    res.json({ ok: true, removidas: r.rowCount });
  } catch (e) { next(e); }
});

// POST /api/whatsapp/retorno
// Enfileira no WAHA a mensagem de retorno de uma cliente específica (após revisar/gerar com IA)
// body: { clienteId, texto, servicoId, ultimoAtendimento }
router.post('/retorno', async (req, res, next) => {
  try {
    const { clienteId, texto, servicoId, ultimoAtendimento } = req.body;
    if (!clienteId || !texto) {
      return res.status(400).json({ erro: 'clienteId e texto são obrigatórios' });
    }

    const cli = await query(`SELECT id, nome, telefone FROM clientes WHERE id=$1`, [
      parseInt(clienteId, 10),
    ]);
    if (cli.rowCount === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrada' });
    }

    const cliente = cli.rows[0];

    // Verifica se a cliente já possui agendamento marcado para hoje ou futuro
    const jaAgendada = await query(
      `SELECT data_hora FROM agendamentos
       WHERE cliente_id = $1
         AND status = 'agendado'
         AND data_hora::date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
       ORDER BY data_hora ASC
       LIMIT 1`,
      [cliente.id]
    );
    if (jaAgendada.rowCount > 0) {
      return res.status(409).json({
        erro: 'Esta cliente já possui um horário agendado no futuro e não precisa de mensagem de retorno.',
      });
    }

    const ref = ultimoAtendimento
      ? montarReferencia(servicoId, ultimoAtendimento)
      : `manual-${Date.now()}`;

    await query(
      `INSERT INTO mensagens_whatsapp (cliente_id, telefone, tipo, referencia, texto, status, erro)
       VALUES ($1, $2, 'retorno', $3, $4, 'pendente', NULL)
       ON CONFLICT (cliente_id, tipo, referencia)
       DO UPDATE SET texto = EXCLUDED.texto, status = 'pendente', erro = NULL`,
      [cliente.id, cliente.telefone, ref, texto.trim()]
    );

    acordarFila();
    res.status(202).json({
      ok: true,
      enfileirada: true,
      config: obterConfigFila(),
    });
  } catch (e) { next(e); }
});

// POST /api/whatsapp/retorno/disparar
// Gera uma mensagem única no Gemini (com clima, data comemorativa e dia da semana)
// para cada cliente do filtro/seleção e coloca na fila do WAHA com range limit.
// body: { filtro: 'hoje'|'vencidas'|..., clienteIds?: [1,2] }
router.post('/retorno/disparar', async (req, res, next) => {
  try {
    const { filtro, clienteIds } = req.body || {};
    const resultado = await enfileirarRetornos({ filtro, clienteIds });
    res.status(202).json({
      ...resultado,
      config: obterConfigFila(),
    });
  } catch (e) { next(e); }
});

// POST /api/whatsapp/campanha
// Usado na aba Marketing: recebe a mensagem e os IDs das clientes marcadas no checkbox,
// e dispara aos poucos no WhatsApp respeitando o range limit.
// body: { mensagem: "Olá {{nome}}, ...", clienteIds: [1,2,3] }
router.post('/campanha', async (req, res, next) => {
  try {
    const { mensagem, clienteIds } = req.body;
    if (!mensagem || !String(mensagem).trim()) {
      return res.status(400).json({ erro: 'A mensagem é obrigatória' });
    }
    if (!Array.isArray(clienteIds) || clienteIds.length === 0) {
      return res.status(400).json({ erro: 'Selecione pelo menos uma cliente' });
    }

    const idsNumericos = clienteIds.map((id) => parseInt(id, 10)).filter(Boolean);
    const clientes = await query(
      `SELECT id, nome, telefone FROM clientes
       WHERE id = ANY($1::int[]) AND COALESCE(aceita_whatsapp, TRUE) = TRUE
       ORDER BY nome`,
      [idsNumericos]
    );

    const campanha = 'camp-' + Date.now();
    let enfileiradas = 0;

    for (const c of clientes.rows) {
      const textoFinal = personalizarMensagem(mensagem.trim(), c.nome);
      const r = await query(
        `INSERT INTO mensagens_whatsapp (cliente_id, telefone, tipo, referencia, texto)
         VALUES ($1, $2, 'marketing', $3, $4)
         ON CONFLICT DO NOTHING`,
        [c.id, c.telefone, campanha, textoFinal]
      );
      enfileiradas += r.rowCount;
    }

    if (enfileiradas > 0) {
      acordarFila();
    }

    res.status(202).json({
      campanha,
      enfileiradas,
      config: obterConfigFila(),
    });
  } catch (e) { next(e); }
});

module.exports = router;
