const express = require('express');
const router  = express.Router();
const { queryEntradas, querySaidas, queryTotais, queryAtendimentosPorMes } = require('../models/Caixa');

// GET /api/caixa?periodo=mes&mes=3&ano=2025
router.get('/', async (req, res, next) => {
  try {
    const agora   = new Date();
    const periodo = req.query.periodo || 'mes';
    const params  = {
      usuarioId: req.usuarioId,
      dia: req.query.dia || agora.toISOString().slice(0, 10),
      mes: parseInt(req.query.mes || agora.getMonth() + 1, 10),
      ano: parseInt(req.query.ano || agora.getFullYear(), 10),
    };
    const [entradas, saidas, totais, atendimentosPorMes] = await Promise.all([
      queryEntradas(periodo, params),
      querySaidas(periodo, params),
      queryTotais(periodo, params),
      queryAtendimentosPorMes(params.ano, req.usuarioId),
    ]);
    res.json({ entradas, saidas, totais, atendimentosPorMes, periodo, params: { dia: params.dia, mes: params.mes, ano: params.ano } });
  } catch (e) { next(e); }
});

module.exports = router;
