const express  = require('express');
const router   = express.Router();
const Clientes = require('../models/Clientes');

router.get('/',           async (req, res, next) => { try { res.json(await Clientes.listar());              } catch(e){next(e)} });
router.get('/search',     async (req, res, next) => { try { res.json(await Clientes.buscar(req.query.q||'')); } catch(e){next(e)} });
router.get('/:id',        async (req, res, next) => { try { const c=await Clientes.buscarPorId(req.params.id); c?res.json(c):res.status(404).json({erro:'Não encontrado'}); } catch(e){next(e)} });
router.post('/',          async (req, res, next) => { try { res.status(201).json(await Clientes.criar(req.body));              } catch(e){next(e)} });
router.put('/:id',        async (req, res, next) => { try { res.json(await Clientes.atualizar(req.params.id, req.body));       } catch(e){next(e)} });
router.delete('/:id',     async (req, res, next) => { try { await Clientes.excluir(req.params.id); res.status(204).end();      } catch(e){next(e)} });

module.exports = router;
