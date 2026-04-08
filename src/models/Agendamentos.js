const { query } = require('../database');

const Agendamentos = {
  async listarPorData(data) {
    const r = await query(`
      SELECT a.id, a.data_hora, a.status, a.observacao,
             c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
             s.id AS servico_id, s.nome AS servico_nome, s.valor AS servico_valor
      FROM agendamentos a
      JOIN clientes c ON c.id=a.cliente_id
      JOIN servicos s ON s.id=a.servico_id
      WHERE a.data_hora::date = $1::date
      ORDER BY a.data_hora`, [data]);
    return r.rows;
  },

  async buscarPorId(id) {
    const r = await query(`
      SELECT a.*, c.nome AS cliente_nome, s.nome AS servico_nome, s.valor AS servico_valor
      FROM agendamentos a
      JOIN clientes c ON c.id=a.cliente_id
      JOIN servicos s ON s.id=a.servico_id
      WHERE a.id=$1`, [id]);
    return r.rows[0];
  },

  async criar({ cliente_id, servico_id, data_hora, observacao }) {
    const r = await query(
      'INSERT INTO agendamentos(cliente_id,servico_id,data_hora,observacao) VALUES($1,$2,$3,$4) RETURNING id',
      [parseInt(cliente_id), parseInt(servico_id), new Date(data_hora), observacao || null]
    );
    return this.buscarPorId(r.rows[0].id);
  },

  async darBaixa(id, { status, observacao }) {
    await query(
      'UPDATE agendamentos SET status=$1, observacao=$2 WHERE id=$3',
      [status, observacao || null, parseInt(id)]
    );
    return this.buscarPorId(id);
  },

  async excluir(id) {
    await query('DELETE FROM agendamentos WHERE id=$1', [id]);
  },
};
module.exports = Agendamentos;
