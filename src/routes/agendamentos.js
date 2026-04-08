const express      = require('express');
const router       = express.Router();
const Agendamentos = require('../models/Agendamentos');

// GET /api/agendamentos?data=2025-03-30
router.get('/', async (req, res, next) => {
  try {
    const data = req.query.data || new Date().toISOString().slice(0, 10);
    res.json(await Agendamentos.listarPorData(data));
  } catch(e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const a = await Agendamentos.buscarPorId(req.params.id);
    a ? res.json(a) : res.status(404).json({ erro: 'Não encontrado' });
  } catch(e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json(await Agendamentos.criar(req.body));
  } catch(e) { next(e); }
});

// PATCH /api/agendamentos/:id/baixa  { status, observacao }
router.patch('/:id/baixa', async (req, res, next) => {
  try {
    res.json(await Agendamentos.darBaixa(req.params.id, req.body));
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await Agendamentos.excluir(req.params.id);
    res.status(204).end();
  } catch(e) { next(e); }
});

module.exports = router;
