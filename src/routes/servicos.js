const express  = require('express');
const router   = express.Router();
const Servicos = require('../models/Servicos');

router.get('/', async (req, res, next) => {
  try { res.json(await Servicos.listar(req.usuarioId)); } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const s = await Servicos.buscarPorId(req.usuarioId, req.params.id);
    s ? res.json(s) : res.status(404).json({ erro: 'Não encontrado' });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try { res.status(201).json(await Servicos.criar(req.usuarioId, req.body)); } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const s = await Servicos.atualizar(req.usuarioId, req.params.id, req.body);
    s ? res.json(s) : res.status(404).json({ erro: 'Não encontrado' });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ok = await Servicos.excluir(req.usuarioId, req.params.id);
    ok ? res.status(204).end() : res.status(404).json({ erro: 'Não encontrado' });
  } catch (e) { next(e); }
});

module.exports = router;
