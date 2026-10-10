const express        = require('express');
const router         = express.Router();
const Agendamentos   = require('../models/Agendamentos');
const { queryTotais } = require('../models/Caixa');

// GET /api/agendamentos?data=2025-03-30
router.get('/', async (req, res, next) => {
  try {
    const data = req.query.data || new Date().toISOString().slice(0, 10);
    res.json(await Agendamentos.listarPorData(data));
  } catch (e) { next(e); }
});

// GET /api/agendamentos/sincronizar-notificacoes
// Retorna todos os agendamentos pendentes ('agendado') dos últimos 14 dias até os próximos 30 dias
// + o resumo financeiro do mês atual e anterior para as notificações locais do app mobile.
router.get('/sincronizar-notificacoes', async (req, res, next) => {
  try {
    const agoraBr = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
    );
    const mesAtual = agoraBr.getMonth() + 1;
    const anoAtual = agoraBr.getFullYear();

    const mesAnt = mesAtual === 1 ? 12 : mesAtual - 1;
    const anoAnt = mesAtual === 1 ? anoAtual - 1 : anoAtual;

    const [agendamentos, totaisAtual, totaisAnterior] = await Promise.all([
      Agendamentos.listarParaNotificacoes(),
      queryTotais('mes', { mes: mesAtual, ano: anoAtual }),
      queryTotais('mes', { mes: mesAnt, ano: anoAnt }),
    ]);

    res.json({
      agendamentos,
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

router.get('/:id', async (req, res, next) => {
  try {
    const a = await Agendamentos.buscarPorId(req.params.id);
    a ? res.json(a) : res.status(404).json({ erro: 'Não encontrado' });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await Agendamentos.criar(req.body));
  } catch (e) { next(e); }
});

// PUT /api/agendamentos/:id — editar agendamento
router.put('/:id', async (req, res, next) => {
  try {
    res.json(await Agendamentos.atualizar(req.params.id, req.body));
  } catch (e) { next(e); }
});

// PATCH /api/agendamentos/:id/baixa
router.patch('/:id/baixa', async (req, res, next) => {
  try {
    res.json(await Agendamentos.darBaixa(req.params.id, req.body));
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await Agendamentos.excluir(req.params.id);
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
