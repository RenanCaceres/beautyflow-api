const express = require('express');
const router  = express.Router();
const Consumo = require('../models/Consumo');

router.get('/', async (req, res, next) => {
  try { res.json(await Consumo.listar(req.usuarioId, req.query)); } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try { res.status(201).json(await Consumo.criar(req.usuarioId, req.body)); } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await Consumo.excluir(req.usuarioId, req.params.id);
    ok ? res.status(204).end() : res.status(404).json({ erro: 'Não encontrado' });
  } catch (e) { next(e); }
});

module.exports = router;
