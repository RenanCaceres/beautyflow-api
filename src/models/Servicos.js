const { query } = require('../database');

const Servicos = {
  async listar() {
    const r = await query('SELECT * FROM servicos ORDER BY nome');
    return r.rows;
  },
  async buscarPorId(id) {
    const r = await query('SELECT * FROM servicos WHERE id=$1', [id]);
    return r.rows[0];
  },
  async criar({ nome, valor, intervalo_retorno_dias }) {
    const r = await query(
      'INSERT INTO servicos(nome,valor,intervalo_retorno_dias) VALUES($1,$2,$3) RETURNING *',
      [nome, parseFloat(valor), parseInt(intervalo_retorno_dias)]
    );
    return r.rows[0];
  },
  async atualizar(id, { nome, valor, intervalo_retorno_dias }) {
    const r = await query(
      'UPDATE servicos SET nome=$1,valor=$2,intervalo_retorno_dias=$3 WHERE id=$4 RETURNING *',
      [nome, parseFloat(valor), parseInt(intervalo_retorno_dias), id]
    );
    return r.rows[0];
  },
  async excluir(id) {
    await query('DELETE FROM servicos WHERE id=$1', [id]);
  },
};
module.exports = Servicos;
