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

function exigirSessaoWaha(req, res) {
  const sessao = String(req.usuario?.waha_session || '').trim();
  if (!sessao) {
    res.status(400).json({
      erro: 'Sessão do WhatsApp (WAHA) não configurada para esta conta.',
    });
    return null;
  }
  return sessao;
}

// GET /api/whatsapp/status
router.get('/status', async (req, res) => {
  const sessaoNome = String(req.usuario?.waha_session || '').trim();
  if (!sessaoNome) {
    return res.json({
      sessao: 'NAO_CONFIGURADA',
      configurada: false,
      config: obterConfigFila(),
    });
  }

  try {
    const sessao = await waha.statusSessao(sessaoNome);
    res.json({ sessao, configurada: true, config: obterConfigFila() });
  } catch (e) {
    res.status(503).json({
      sessao: 'INDISPONIVEL',
      configurada: true,
      erro: e.message,
      config: obterConfigFila(),
    });
  }
});

// POST /api/whatsapp/reconectar
router.post('/reconectar', async (req, res) => {
  const sessaoNome = exigirSessaoWaha(req, res);
  if (!sessaoNome) return;

  try {
    await waha.reiniciarSessao(sessaoNome);
    acordarFila();
    const sessao = await waha.statusSessao(sessaoNome).catch(() => 'REINICIANDO');
    res.json({ ok: true, sessao, mensagem: 'Reinicialização da sessão WAHA executada.' });
  } catch (e) {
    res.status(500).json({ ok: false, erro: e.message });
  }
});

// GET /api/whatsapp/fila
router.get('/fila', async (req, res, next) => {
  try {
    const [r, aprov] = await Promise.all([
      query(
        `SELECT status, COUNT(*)::int AS total
         FROM mensagens_whatsapp
         WHERE usuario_id = $1
         GROUP BY status`,
        [req.usuarioId]
      ),
      query(
        `SELECT m.id, m.cliente_id, c.nome AS cliente_nome, m.telefone, m.texto, m.referencia, m.criado_em
         FROM mensagens_whatsapp m
         JOIN clientes c ON c.id = m.cliente_id
         WHERE m.usuario_id = $1
           AND m.status = 'aprovacao'
           AND m.tipo = 'retorno'
           AND NOT EXISTS (
             SELECT 1 FROM agendamentos a
             WHERE a.usuario_id = $1
               AND a.cliente_id = m.cliente_id
               AND a.status = 'agendado'
               AND a.data_hora::date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
           )
         ORDER BY c.nome ASC`,
        [req.usuarioId]
      ),
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

// POST /api/whatsapp/retorno/aprovar
router.post('/retorno/aprovar', async (req, res, next) => {
  try {
    const { ids } = req.body || {};
    let aprovadas = 0;

    if (Array.isArray(ids) && ids.length > 0) {
      const idsNum = ids.map((id) => parseInt(id, 10)).filter(Boolean);
      const r = await query(
        `UPDATE mensagens_whatsapp
         SET status = 'pendente'
         WHERE usuario_id = $1 AND status = 'aprovacao' AND tipo = 'retorno' AND id = ANY($2::int[])`,
        [req.usuarioId, idsNum]
      );
      aprovadas = r.rowCount;
      await query(
        `DELETE FROM mensagens_whatsapp
         WHERE usuario_id = $1 AND status = 'aprovacao' AND tipo = 'retorno'`,
        [req.usuarioId]
      );
    } else {
      const r = await query(
        `UPDATE mensagens_whatsapp
         SET status = 'pendente'
         WHERE usuario_id = $1 AND status = 'aprovacao' AND tipo = 'retorno'`,
        [req.usuarioId]
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

// POST /api/whatsapp/retorno/rejeitar
router.post('/retorno/rejeitar', async (req, res, next) => {
  try {
    const r = await query(
      `DELETE FROM mensagens_whatsapp
       WHERE usuario_id = $1 AND status = 'aprovacao' AND tipo = 'retorno'`,
      [req.usuarioId]
    );
    res.json({ ok: true, removidas: r.rowCount });
  } catch (e) { next(e); }
});

// POST /api/whatsapp/retorno
router.post('/retorno', async (req, res, next) => {
  try {
    if (!exigirSessaoWaha(req, res)) return;

    const { clienteId, texto, servicoId, ultimoAtendimento } = req.body;
    if (!clienteId || !texto) {
      return res.status(400).json({ erro: 'clienteId e texto são obrigatórios' });
    }

    const cli = await query(
      `SELECT id, nome, telefone FROM clientes WHERE id=$1 AND usuario_id=$2`,
      [parseInt(clienteId, 10), req.usuarioId]
    );
    if (cli.rowCount === 0) {
      return res.status(404).json({ erro: 'Cliente não encontrada' });
    }

    const cliente = cli.rows[0];

    const jaAgendada = await query(
      `SELECT data_hora FROM agendamentos
       WHERE usuario_id = $1
         AND cliente_id = $2
         AND status = 'agendado'
         AND data_hora::date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
       ORDER BY data_hora ASC
       LIMIT 1`,
      [req.usuarioId, cliente.id]
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
      `INSERT INTO mensagens_whatsapp (usuario_id, cliente_id, telefone, tipo, referencia, texto, status, erro)
       VALUES ($1, $2, $3, 'retorno', $4, $5, 'pendente', NULL)
       ON CONFLICT (cliente_id, tipo, referencia)
       DO UPDATE SET texto = EXCLUDED.texto, status = 'pendente', erro = NULL`,
      [req.usuarioId, cliente.id, cliente.telefone, ref, texto.trim()]
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
router.post('/retorno/disparar', async (req, res, next) => {
  try {
    if (!exigirSessaoWaha(req, res)) return;

    const { filtro, clienteIds } = req.body || {};
    const resultado = await enfileirarRetornos({
      usuarioId: req.usuarioId,
      filtro,
      clienteIds,
    });
    res.status(202).json({
      ...resultado,
      config: obterConfigFila(),
    });
  } catch (e) { next(e); }
});

// POST /api/whatsapp/campanha
router.post('/campanha', async (req, res, next) => {
  try {
    if (!exigirSessaoWaha(req, res)) return;

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
       WHERE usuario_id = $1 AND id = ANY($2::int[]) AND COALESCE(aceita_whatsapp, TRUE) = TRUE
       ORDER BY nome`,
      [req.usuarioId, idsNumericos]
    );

    const campanha = 'camp-' + Date.now();
    let enfileiradas = 0;

    for (const c of clientes.rows) {
      const textoFinal = personalizarMensagem(mensagem.trim(), c.nome);
      const r = await query(
        `INSERT INTO mensagens_whatsapp (usuario_id, cliente_id, telefone, tipo, referencia, texto)
         VALUES ($1, $2, $3, 'marketing', $4, $5)
         ON CONFLICT DO NOTHING`,
        [req.usuarioId, c.id, c.telefone, campanha, textoFinal]
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
