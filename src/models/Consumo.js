const { query } = require('../database');

const Consumo = {
  async listar(usuarioId, { mes, ano } = {}) {
    let text = 'SELECT * FROM consumo WHERE usuario_id = $1';
    const params = [usuarioId];
    if (mes && ano) {
      text += ' AND EXTRACT(MONTH FROM data)=$2 AND EXTRACT(YEAR FROM data)=$3';
      params.push(parseInt(mes, 10), parseInt(ano, 10));
    }
    text += ' ORDER BY data DESC, criado_em DESC';
    const r = await query(text, params);
    return r.rows;
  },

  async criar(usuarioId, { produto, valor, data }) {
    const r = await query(
      'INSERT INTO consumo(usuario_id, produto, valor, data) VALUES($1,$2,$3,$4) RETURNING *',
      [usuarioId, produto, parseFloat(valor), data]
    );
    return r.rows[0];
  },

  async excluir(usuarioId, id) {
    const r = await query(
      'DELETE FROM consumo WHERE id=$1 AND usuario_id=$2',
      [parseInt(id, 10), usuarioId]
    );
    return r.rowCount > 0;
  },
};

module.exports = Consumo;
