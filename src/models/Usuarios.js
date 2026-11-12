const bcrypt = require('bcryptjs');
const { query } = require('../database');

const COLUNAS_PUBLICAS = `
  id, username, nome, nome_salao, email, role, ativo,
  waha_session, cidade_nome, cidade_lat, cidade_lon,
  plano, valor_mensal, dia_vencimento, observacao_admin,
  criado_em, atualizado_em
`;

function normalizarUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function normalizarEmail(email) {
  const limpo = String(email || '').trim().toLowerCase();
  return limpo || null;
}

function validarUsername(username) {
  const limpo = normalizarUsername(username);
  if (!/^[a-z0-9._-]{3,60}$/.test(limpo)) {
    const err = new Error(
      'O usuário deve ter entre 3 e 60 caracteres e conter apenas letras, números, ponto, hífen ou underline.'
    );
    err.status = 400;
    throw err;
  }
  return limpo;
}

const Usuarios = {
  async buscarPorLoginComSenha(login) {
    const ident = String(login || '').trim().toLowerCase();
    if (!ident) return null;
    const r = await query(
      `SELECT ${COLUNAS_PUBLICAS}, senha_hash
       FROM usuarios
       WHERE username = $1 OR (email IS NOT NULL AND email = $1)
       LIMIT 1`,
      [ident]
    );
    return r.rows[0] || null;
  },

  async buscarPorId(id) {
    const r = await query(
      `SELECT ${COLUNAS_PUBLICAS} FROM usuarios WHERE id = $1`,
      [parseInt(id, 10)]
    );
    return r.rows[0] || null;
  },

  async listar() {
    const r = await query(`SELECT ${COLUNAS_PUBLICAS} FROM usuarios ORDER BY id ASC`);
    return r.rows;
  },

  async listarComMetricas() {
    const r = await query(`
      SELECT
        u.id, u.username, u.nome, u.nome_salao, u.email, u.role, u.ativo,
        u.waha_session, u.cidade_nome, u.cidade_lat, u.cidade_lon,
        u.plano, u.valor_mensal, u.dia_vencimento, u.observacao_admin,
        u.criado_em, u.atualizado_em,
        (SELECT COUNT(*)::int FROM clientes c WHERE c.usuario_id = u.id) AS total_clientes,
        (SELECT COUNT(*)::int FROM agendamentos a WHERE a.usuario_id = u.id) AS total_agendamentos
      FROM usuarios u
      ORDER BY u.id ASC
    `);
    return r.rows;
  },

  async criar({
    username,
    nome,
    nome_salao = null,
    email = null,
    senha,
    role = 'user',
    ativo = true,
    waha_session = null,
    cidade_nome = null,
    cidade_lat = null,
    cidade_lon = null,
    plano = 'Profissional',
    valor_mensal = 0,
    dia_vencimento = 10,
    observacao_admin = null,
  }) {
    if (!nome || !username || !senha) {
      const err = new Error('Usuário, nome e senha são obrigatórios.');
      err.status = 400;
      throw err;
    }
    const usernameLimpo = validarUsername(username);
    const emailLimpo = normalizarEmail(email);

    if (String(senha).length < 6) {
      const err = new Error('A senha deve ter pelo menos 6 caracteres.');
      err.status = 400;
      throw err;
    }

    const dupUser = await query(`SELECT id FROM usuarios WHERE username = $1`, [usernameLimpo]);
    if (dupUser.rowCount > 0) {
      const err = new Error('Já existe uma conta cadastrada com este usuário.');
      err.status = 409;
      throw err;
    }

    if (emailLimpo) {
      const dupEmail = await query(`SELECT id FROM usuarios WHERE email = $1`, [emailLimpo]);
      if (dupEmail.rowCount > 0) {
        const err = new Error('Já existe uma conta cadastrada com este e-mail.');
        err.status = 409;
        throw err;
      }
    }

    const senhaHash = await bcrypt.hash(String(senha), 10);
    const diaVenc = Math.min(28, Math.max(1, parseInt(dia_vencimento || 10, 10) || 10));
    const valorMensalNum = parseFloat(valor_mensal || 0) || 0;

    const r = await query(
      `INSERT INTO usuarios (
        username, nome, nome_salao, email, senha_hash, role, ativo,
        waha_session, cidade_nome, cidade_lat, cidade_lon,
        plano, valor_mensal, dia_vencimento, observacao_admin
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING ${COLUNAS_PUBLICAS}`,
      [
        usernameLimpo,
        String(nome).trim(),
        nome_salao ? String(nome_salao).trim() : null,
        emailLimpo,
        senhaHash,
        role === 'admin' ? 'admin' : 'user',
        Boolean(ativo),
        waha_session ? String(waha_session).trim() : null,
        cidade_nome ? String(cidade_nome).trim() : null,
        cidade_lat ? String(cidade_lat).trim() : null,
        cidade_lon ? String(cidade_lon).trim() : null,
        plano ? String(plano).trim() : 'Profissional',
        valorMensalNum,
        diaVenc,
        observacao_admin ? String(observacao_admin).trim() : null,
      ]
    );
    return r.rows[0];
  },

  async atualizarPerfil(id, { nome, nome_salao, email, waha_session, cidade_nome, cidade_lat, cidade_lon }) {
    const atual = await this.buscarPorId(id);
    if (!atual) return null;

    const emailLimpo = email !== undefined ? normalizarEmail(email) : atual.email;
    if (emailLimpo && emailLimpo !== atual.email) {
      const dup = await query(
        `SELECT id FROM usuarios WHERE email = $1 AND id <> $2`,
        [emailLimpo, parseInt(id, 10)]
      );
      if (dup.rowCount > 0) {
        const err = new Error('Este e-mail já está em uso por outra conta.');
        err.status = 409;
        throw err;
      }
    }

    const r = await query(
      `UPDATE usuarios SET
         nome = $1,
         nome_salao = $2,
         email = $3,
         waha_session = $4,
         cidade_nome = $5,
         cidade_lat = $6,
         cidade_lon = $7,
         atualizado_em = NOW()
       WHERE id = $8
       RETURNING ${COLUNAS_PUBLICAS}`,
      [
        nome !== undefined ? String(nome).trim() : atual.nome,
        nome_salao !== undefined ? (nome_salao ? String(nome_salao).trim() : null) : atual.nome_salao,
        emailLimpo,
        waha_session !== undefined ? (waha_session ? String(waha_session).trim() : null) : atual.waha_session,
        cidade_nome !== undefined ? (cidade_nome ? String(cidade_nome).trim() : null) : atual.cidade_nome,
        cidade_lat !== undefined ? (cidade_lat ? String(cidade_lat).trim() : null) : atual.cidade_lat,
        cidade_lon !== undefined ? (cidade_lon ? String(cidade_lon).trim() : null) : atual.cidade_lon,
        parseInt(id, 10),
      ]
    );
    return r.rows[0];
  },

  async alterarSenha(id, novaSenha) {
    if (!novaSenha || String(novaSenha).length < 6) {
      const err = new Error('A nova senha deve ter pelo menos 6 caracteres.');
      err.status = 400;
      throw err;
    }
    const senhaHash = await bcrypt.hash(String(novaSenha), 10);
    await query(
      `UPDATE usuarios SET senha_hash = $1, atualizado_em = NOW() WHERE id = $2`,
      [senhaHash, parseInt(id, 10)]
    );
  },

  async atualizarAdmin(id, campos = {}) {
    const userId = parseInt(id, 10);
    const atual = await this.buscarPorId(userId);
    if (!atual) return null;

    let novoUsername = atual.username;
    if (campos.username !== undefined && campos.username !== atual.username) {
      novoUsername = validarUsername(campos.username);
      const dup = await query(
        `SELECT id FROM usuarios WHERE username = $1 AND id <> $2`,
        [novoUsername, userId]
      );
      if (dup.rowCount > 0) {
        const err = new Error('Já existe uma conta com este usuário.');
        err.status = 409;
        throw err;
      }
    }

    const emailLimpo = campos.email !== undefined ? normalizarEmail(campos.email) : atual.email;
    if (emailLimpo && emailLimpo !== atual.email) {
      const dupEmail = await query(
        `SELECT id FROM usuarios WHERE email = $1 AND id <> $2`,
        [emailLimpo, userId]
      );
      if (dupEmail.rowCount > 0) {
        const err = new Error('Já existe uma conta com este e-mail.');
        err.status = 409;
        throw err;
      }
    }

    if (campos.senha) {
      await this.alterarSenha(userId, campos.senha);
    }

    const diaVenc = campos.dia_vencimento !== undefined
      ? Math.min(28, Math.max(1, parseInt(campos.dia_vencimento, 10) || 10))
      : atual.dia_vencimento;

    const r = await query(
      `UPDATE usuarios SET
         username = $1,
         nome = $2,
         nome_salao = $3,
         email = $4,
         role = $5,
         ativo = $6,
         waha_session = $7,
         cidade_nome = $8,
         cidade_lat = $9,
         cidade_lon = $10,
         plano = $11,
         valor_mensal = $12,
         dia_vencimento = $13,
         observacao_admin = $14,
         atualizado_em = NOW()
       WHERE id = $15
       RETURNING ${COLUNAS_PUBLICAS}`,
      [
        novoUsername,
        campos.nome !== undefined ? String(campos.nome).trim() : atual.nome,
        campos.nome_salao !== undefined ? (campos.nome_salao ? String(campos.nome_salao).trim() : null) : atual.nome_salao,
        emailLimpo,
        campos.role !== undefined ? (campos.role === 'admin' ? 'admin' : 'user') : atual.role,
        campos.ativo !== undefined ? Boolean(campos.ativo) : atual.ativo,
        campos.waha_session !== undefined ? (campos.waha_session ? String(campos.waha_session).trim() : null) : atual.waha_session,
        campos.cidade_nome !== undefined ? (campos.cidade_nome ? String(campos.cidade_nome).trim() : null) : atual.cidade_nome,
        campos.cidade_lat !== undefined ? (campos.cidade_lat ? String(campos.cidade_lat).trim() : null) : atual.cidade_lat,
        campos.cidade_lon !== undefined ? (campos.cidade_lon ? String(campos.cidade_lon).trim() : null) : atual.cidade_lon,
        campos.plano !== undefined ? (String(campos.plano || 'Profissional').trim()) : atual.plano,
        campos.valor_mensal !== undefined ? (parseFloat(campos.valor_mensal || 0) || 0) : atual.valor_mensal,
        diaVenc,
        campos.observacao_admin !== undefined ? (campos.observacao_admin ? String(campos.observacao_admin).trim() : null) : atual.observacao_admin,
        userId,
      ]
    );
    return r.rows[0];
  },

  async excluir(id) {
    const r = await query(`DELETE FROM usuarios WHERE id = $1`, [parseInt(id, 10)]);
    return r.rowCount > 0;
  },
};

module.exports = Usuarios;
