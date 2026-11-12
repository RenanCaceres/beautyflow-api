const express = require('express');
const bcrypt = require('bcryptjs');
const Usuarios = require('../models/Usuarios');
const { autenticar, exigirAdmin, gerarToken } = require('../middlewares/auth');

const router = express.Router();

// POST /api/auth/login -> Autentica com usuário (ou e-mail) e senha
router.post('/login', async (req, res, next) => {
  try {
    const { usuario, username, login, email, senha } = req.body || {};
    const identificador = usuario || username || login || email;
    if (!identificador || !senha) {
      return res.status(400).json({ erro: 'Informe usuário e senha.' });
    }

    const user = await Usuarios.buscarPorLoginComSenha(identificador);
    if (!user) {
      return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    }
    if (!user.ativo) {
      return res.status(403).json({ erro: 'Conta desativada. Contate o administrador.' });
    }

    const senhaConfere = await bcrypt.compare(String(senha), user.senha_hash);
    if (!senhaConfere) {
      return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
    }

    const { senha_hash, ...usuarioSemSenha } = user;
    const token = gerarToken(usuarioSemSenha);
    res.json({ token, usuario: usuarioSemSenha });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me -> Retorna os dados do usuário autenticado
router.get('/me', autenticar, async (req, res) => {
  res.json({ usuario: req.usuario });
});

// PUT /api/auth/perfil -> Atualiza dados do próprio perfil (e senha opcionalmente)
router.put('/perfil', autenticar, async (req, res, next) => {
  try {
    const {
      nome,
      nome_salao,
      email,
      waha_session,
      cidade_nome,
      cidade_lat,
      cidade_lon,
      senha_atual,
      nova_senha,
    } = req.body || {};

    if (nova_senha) {
      const userComSenha = await Usuarios.buscarPorLoginComSenha(req.usuario.username);
      if (!senha_atual) {
        return res.status(400).json({ erro: 'Informe a senha atual para definir uma nova senha.' });
      }
      const confere = await bcrypt.compare(String(senha_atual), userComSenha.senha_hash);
      if (!confere) {
        return res.status(400).json({ erro: 'Senha atual incorreta.' });
      }
      await Usuarios.alterarSenha(req.usuarioId, nova_senha);
    }

    const atualizado = await Usuarios.atualizarPerfil(req.usuarioId, {
      nome,
      nome_salao,
      email,
      waha_session,
      cidade_nome,
      cidade_lat,
      cidade_lon,
    });
    res.json({ usuario: atualizado });
  } catch (err) {
    next(err);
  }
});

// ── Rotas administrativas (criação/gestão de contas SaaS) ───────────────────
router.get('/usuarios', autenticar, exigirAdmin, async (req, res, next) => {
  try {
    res.json(await Usuarios.listarComMetricas());
  } catch (err) {
    next(err);
  }
});

router.post('/usuarios', autenticar, exigirAdmin, async (req, res, next) => {
  try {
    const criado = await Usuarios.criar(req.body || {});
    res.status(201).json(criado);
  } catch (err) {
    next(err);
  }
});

router.patch('/usuarios/:id', autenticar, exigirAdmin, async (req, res, next) => {
  try {
    const atualizado = await Usuarios.atualizarAdmin(req.params.id, req.body || {});
    if (!atualizado) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json(atualizado);
  } catch (err) {
    next(err);
  }
});

router.delete('/usuarios/:id', autenticar, exigirAdmin, async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.usuarioId) {
      return res.status(400).json({ erro: 'Você não pode excluir sua própria conta de administrador.' });
    }
    const ok = await Usuarios.excluir(targetId);
    if (!ok) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
