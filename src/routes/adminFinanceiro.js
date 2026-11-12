const express = require('express');
const FinanceiroSaas = require('../models/FinanceiroSaas');

const router = express.Router();

// GET /api/admin/financeiro?competencia=2026-11
router.get('/', async (req, res, next) => {
  try {
    res.json(await FinanceiroSaas.resumoCompetencia(req.query.competencia));
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/financeiro/pagamentos
router.post('/pagamentos', async (req, res, next) => {
  try {
    const { usuario_id, competencia } = req.body || {};
    if (!usuario_id || !competencia) {
      return res.status(400).json({ erro: 'usuario_id e competencia são obrigatórios.' });
    }
    res.status(201).json(await FinanceiroSaas.registrarPagamento(req.body));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/financeiro/pagamentos/:id
router.delete('/pagamentos/:id', async (req, res, next) => {
  try {
    const ok = await FinanceiroSaas.removerPagamento(req.params.id);
    ok ? res.status(204).end() : res.status(404).json({ erro: 'Lançamento não encontrado.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/financeiro/despesas
router.post('/despesas', async (req, res, next) => {
  try {
    res.status(201).json(await FinanceiroSaas.criarDespesa(req.body || {}));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/financeiro/despesas/:id
router.delete('/despesas/:id', async (req, res, next) => {
  try {
    const ok = await FinanceiroSaas.excluirDespesa(req.params.id);
    ok ? res.status(204).end() : res.status(404).json({ erro: 'Despesa não encontrada.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
