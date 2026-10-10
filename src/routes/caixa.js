const express = require('express');
const router  = express.Router();
const { queryEntradas, querySaidas, queryTotais, queryAtendimentosPorMes } = require('../models/Caixa');

// GET /api/caixa?periodo=mes&mes=3&ano=2025
router.get('/', async (req, res, next) => {
  try {
    const agora   = new Date();
    const periodo = req.query.periodo || 'mes';
    const params  = {
      dia: req.query.dia || agora.toISOString().slice(0, 10),
      mes: parseInt(req.query.mes || agora.getMonth() + 1),
      ano: parseInt(req.query.ano || agora.getFullYear()),
    };
    const [entradas, saidas, totais, atendimentosPorMes] = await Promise.all([
      queryEntradas(periodo, params),
      querySaidas(periodo, params),
      queryTotais(periodo, params),
      queryAtendimentosPorMes(params.ano),
    ]);
    res.json({ entradas, saidas, totais, atendimentosPorMes, periodo, params });
  } catch (e) { next(e); }
});

module.exports = router;
