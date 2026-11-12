const { query } = require('../database');

const Servicos = {
  async listar(usuarioId) {
    const r = await query(
      `SELECT * FROM servicos WHERE usuario_id = $1 ORDER BY nome`,
      [usuarioId]
    );
    return r.rows;
  },

  async buscarPorId(usuarioId, id) {
    const r = await query(
      `SELECT * FROM servicos WHERE id = $1 AND usuario_id = $2`,
      [parseInt(id, 10), usuarioId]
    );
    return r.rows[0];
  },

  async criar(usuarioId, { nome, valor, intervalo_retorno_dias }) {
    const r = await query(
      `INSERT INTO servicos(usuario_id, nome, valor, intervalo_retorno_dias) VALUES($1,$2,$3,$4) RETURNING *`,
      [usuarioId, nome, parseFloat(valor), parseInt(intervalo_retorno_dias, 10)]
    );
    return r.rows[0];
  },

  async atualizar(usuarioId, id, { nome, valor, intervalo_retorno_dias }) {
    const r = await query(
      `UPDATE servicos SET nome=$1, valor=$2, intervalo_retorno_dias=$3
       WHERE id=$4 AND usuario_id=$5 RETURNING *`,
      [nome, parseFloat(valor), parseInt(intervalo_retorno_dias, 10), parseInt(id, 10), usuarioId]
    );
    return r.rows[0];
  },

  async excluir(usuarioId, id) {
    const r = await query(
      `DELETE FROM servicos WHERE id=$1 AND usuario_id=$2`,
      [parseInt(id, 10), usuarioId]
    );
    return r.rowCount > 0;
  },
};

module.exports = Servicos;
