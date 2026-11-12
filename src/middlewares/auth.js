const jwt = require('jsonwebtoken');
const Usuarios = require('../models/Usuarios');

let avisouSecret = false;

function getJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) {
    return process.env.JWT_SECRET.trim();
  }
  if (!avisouSecret) {
    avisouSecret = true;
    console.warn(
      '⚠ [AUTH] JWT_SECRET não definido no .env! Usando chave temporária de desenvolvimento. Defina JWT_SECRET antes de publicar em produção.'
    );
  }
  return 'beautyflow-dev-secret-troque-em-producao';
}

function gerarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      username: usuario.username,
      role: usuario.role,
    },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

async function autenticar(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    return res.status(401).json({ erro: 'Autenticação necessária. Faça login para continuar.' });
  }

  let payload;
  try {
    payload = jwt.verify(match[1], getJwtSecret());
  } catch {
    return res.status(401).json({ erro: 'Sessão expirada ou token inválido. Faça login novamente.' });
  }

  try {
    const usuario = await Usuarios.buscarPorId(payload.sub);
    if (!usuario) {
      return res.status(401).json({ erro: 'Conta não encontrada.' });
    }
    if (!usuario.ativo) {
      return res.status(403).json({ erro: 'Esta conta está desativada. Contate o administrador.' });
    }

    req.usuario = usuario;
    req.usuarioId = usuario.id;
    next();
  } catch (err) {
    next(err);
  }
}

function exigirAdmin(req, res, next) {
  if (!req.usuario || req.usuario.role !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  }
  next();
}

module.exports = { autenticar, exigirAdmin, gerarToken };
