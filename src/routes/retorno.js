const express = require('express');
const router  = express.Router();
const { listar, buscarPorCliente } = require('../models/Retorno');

// GET /api/retorno?filtro=hoje
router.get('/', async (req, res, next) => {
  try {
    res.json(await listar(req.query.filtro || 'todas'));
  } catch (e) { next(e); }
});

// GET /api/retorno/:clienteId/servicos
router.get('/:clienteId/servicos', async (req, res, next) => {
  try {
    res.json(await buscarPorCliente(req.params.clienteId));
  } catch (e) { next(e); }
});

module.exports = router;
