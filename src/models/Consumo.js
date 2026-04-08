const { query } = require('../database');

const Consumo = {
  async listar({ mes, ano } = {}) {
    let text = 'SELECT * FROM consumo';
    const params = [];
    if (mes && ano) {
      text += ' WHERE EXTRACT(MONTH FROM data)=$1 AND EXTRACT(YEAR FROM data)=$2';
      params.push(parseInt(mes), parseInt(ano));
    }
    text += ' ORDER BY data DESC, criado_em DESC';
    const r = await query(text, params);
    return r.rows;
  },

  async criar({ produto, valor, data }) {
    const r = await query(
      'INSERT INTO consumo(produto,valor,data) VALUES($1,$2,$3) RETURNING *',
      [produto, parseFloat(valor), data]
    );
    return r.rows[0];
  },

  async excluir(id) {
    await query('DELETE FROM consumo WHERE id=$1', [id]);
  },
};
module.exports = Consumo;
