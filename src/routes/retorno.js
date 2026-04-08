const express = require('express');
const router  = express.Router();
const { listar } = require('../models/Retorno');

// GET /api/retorno?filtro=hoje
router.get('/', async (req, res, next) => {
  try {
    res.json(await listar(req.query.filtro || 'todas'));
  } catch(e) { next(e); }
});

module.exports = router;
