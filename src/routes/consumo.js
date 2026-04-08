const express = require('express');
const router  = express.Router();
const Consumo = require('../models/Consumo');

router.get('/', async (req, res, next) => {
  try { res.json(await Consumo.listar(req.query)); } catch(e) { next(e); }
});
router.post('/', async (req, res, next) => {
  try { res.status(201).json(await Consumo.criar(req.body)); } catch(e) { next(e); }
});
router.delete('/:id', async (req, res, next) => {
  try { await Consumo.excluir(req.params.id); res.status(204).end(); } catch(e) { next(e); }
});

module.exports = router;
