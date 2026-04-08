const express  = require('express');
const router   = express.Router();
const Servicos = require('../models/Servicos');

router.get('/',       async (req, res, next) => { try { res.json(await Servicos.listar());                     } catch(e){next(e)} });
router.get('/:id',    async (req, res, next) => { try { const s=await Servicos.buscarPorId(req.params.id); s?res.json(s):res.status(404).json({erro:'Não encontrado'}); } catch(e){next(e)} });
router.post('/',      async (req, res, next) => { try { res.status(201).json(await Servicos.criar(req.body));  } catch(e){next(e)} });
router.put('/:id',    async (req, res, next) => { try { res.json(await Servicos.atualizar(req.params.id,req.body)); } catch(e){next(e)} });
router.delete('/:id', async (req, res, next) => { try { await Servicos.excluir(req.params.id); res.status(204).end(); } catch(e){next(e)} });

module.exports = router;
