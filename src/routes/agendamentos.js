const express         = require('express');
const router          = express.Router();
const Agendamentos    = require('../models/Agendamentos');
const { queryTotais } = require('../models/Caixa');
const { query }       = require('../database');

// GET /api/agendamentos?data=2025-03-30
router.get('/', async (req, res, next) => {
  try {
    const data = req.query.data || new Date().toISOString().slice(0, 10);
    res.json(await Agendamentos.listarPorData(req.usuarioId, data));
  } catch (e) { next(e); }
});

// GET /api/agendamentos/sincronizar-notificacoes
router.get('/sincronizar-notificacoes', async (req, res, next) => {
  try {
    const agoraBr = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
    );
    const mesAtual = agoraBr.getMonth() + 1;
    const anoAtual = agoraBr.getFullYear();

    const mesAnt = mesAtual === 1 ? 12 : mesAtual - 1;
    const anoAnt = mesAtual === 1 ? anoAtual - 1 : anoAtual;

    const [agendamentos, totaisAtual, totaisAnterior, aprovRes] = await Promise.all([
      Agendamentos.listarParaNotificacoes(req.usuarioId),
      queryTotais('mes', { usuarioId: req.usuarioId, mes: mesAtual, ano: anoAtual }),
      queryTotais('mes', { usuarioId: req.usuarioId, mes: mesAnt, ano: anoAnt }),
      query(
        `SELECT COUNT(*)::int AS total
         FROM mensagens_whatsapp
         WHERE usuario_id = $1 AND status = 'aprovacao' AND tipo = 'retorno'`,
        [req.usuarioId]
      ).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    res.json({
      agendamentos,
      retornosAguardandoAprovacao: aprovRes?.rows?.[0]?.total || 0,
      fechamentoMesAtual: {
        mes: mesAtual,
        ano: anoAtual,
        ...totaisAtual,
      },
      fechamentoMesAnterior: {
        mes: mesAnt,
        ano: anoAnt,
        ...totaisAnterior,
      },
    });
  } catch (e) { next(e); }
});

// GET /api/agendamentos/indisponiveis
router.get('/indisponiveis', async (req, res, next) => {
  try {
    res.json(await Agendamentos.listarDiasIndisponiveis(req.usuarioId));
  } catch (e) { next(e); }
});

// POST /api/agendamentos/indisponiveis
router.post('/indisponiveis', async (req, res, next) => {
  try {
    const { data, motivo } = req.body || {};
    if (!data) return res.status(400).json({ erro: 'Data é obrigatória' });
    res.status(201).json(await Agendamentos.marcarDiaIndisponivel(req.usuarioId, data, motivo));
  } catch (e) { next(e); }
});

// DELETE /api/agendamentos/indisponiveis/:data
router.delete('/indisponiveis/:data', async (req, res, next) => {
  try {
    await Agendamentos.removerDiaIndisponivel(req.usuarioId, req.params.data);
    res.status(204).end();
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const a = await Agendamentos.buscarPorId(req.usuarioId, req.params.id);
    a ? res.json(a) : res.status(404).json({ erro: 'Não encontrado' });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await Agendamentos.criar(req.usuarioId, req.body));
  } catch (e) { next(e); }
});

// PUT /api/agendamentos/:id — editar agendamento
router.put('/:id', async (req, res, next) => {
  try {
    res.json(await Agendamentos.atualizar(req.usuarioId, req.params.id, req.body));
  } catch (e) { next(e); }
});

// PATCH /api/agendamentos/:id/baixa
router.patch('/:id/baixa', async (req, res, next) => {
  try {
    res.json(await Agendamentos.darBaixa(req.usuarioId, req.params.id, req.body));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await Agendamentos.excluir(req.usuarioId, req.params.id);
    ok ? res.status(204).end() : res.status(404).json({ erro: 'Não encontrado' });
  } catch (e) { next(e); }
});

module.exports = router;
