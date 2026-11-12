const { query } = require('../database');

const Clientes = {
  async listar(usuarioId) {
    const r = await query(
      `SELECT c.id, c.nome, c.telefone, c.aceita_whatsapp, c.criado_em,
        (SELECT s.nome FROM agendamentos a JOIN servicos s ON s.id=a.servico_id
         WHERE a.cliente_id=c.id AND a.usuario_id=$1 AND a.status='realizado'
         ORDER BY a.data_hora DESC LIMIT 1) AS ultimo_servico,
        (SELECT a.data_hora FROM agendamentos a
         WHERE a.cliente_id=c.id AND a.usuario_id=$1 AND a.status='realizado'
         ORDER BY a.data_hora DESC LIMIT 1) AS ultimo_atendimento
      FROM clientes c
      WHERE c.usuario_id = $1
      ORDER BY c.nome`,
      [usuarioId]
    );
    return r.rows;
  },

  async buscar(usuarioId, q) {
    const r = await query(
      `SELECT id, nome, telefone
       FROM clientes
       WHERE usuario_id = $1 AND (nome ILIKE $2 OR telefone ILIKE $2)
       ORDER BY nome`,
      [usuarioId, `%${q}%`]
    );
    return r.rows;
  },

  async buscarPorId(usuarioId, id) {
    const r = await query(
      `SELECT * FROM clientes WHERE id = $1 AND usuario_id = $2`,
      [parseInt(id, 10), usuarioId]
    );
    return r.rows[0];
  },

  async criar(usuarioId, { nome, telefone }) {
    const r = await query(
      `INSERT INTO clientes(usuario_id, nome, telefone) VALUES($1, $2, $3) RETURNING *`,
      [usuarioId, nome, telefone]
    );
    return r.rows[0];
  },

  async atualizar(usuarioId, id, { nome, telefone }) {
    const r = await query(
      `UPDATE clientes SET nome=$1, telefone=$2 WHERE id=$3 AND usuario_id=$4 RETURNING *`,
      [nome, telefone, parseInt(id, 10), usuarioId]
    );
    return r.rows[0];
  },

  async excluir(usuarioId, id) {
    const r = await query(
      `DELETE FROM clientes WHERE id=$1 AND usuario_id=$2`,
      [parseInt(id, 10), usuarioId]
    );
    return r.rowCount > 0;
  },
};

module.exports = Clientes;
