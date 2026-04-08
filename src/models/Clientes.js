const { query } = require('../database');

const Clientes = {
  async listar() {
    const r = await query(`
      SELECT c.id, c.nome, c.telefone, c.criado_em,
        (SELECT s.nome FROM agendamentos a JOIN servicos s ON s.id=a.servico_id
         WHERE a.cliente_id=c.id AND a.status='realizado'
         ORDER BY a.data_hora DESC LIMIT 1) AS ultimo_servico,
        (SELECT a.data_hora FROM agendamentos a
         WHERE a.cliente_id=c.id AND a.status='realizado'
         ORDER BY a.data_hora DESC LIMIT 1) AS ultimo_atendimento
      FROM clientes c ORDER BY c.nome`);
    return r.rows;
  },
  async buscar(q) {
    const r = await query(
      "SELECT id, nome, telefone FROM clientes WHERE nome ILIKE $1 OR telefone ILIKE $1 ORDER BY nome",
      [`%${q}%`]
    );
    return r.rows;
  },
  async buscarPorId(id) {
    const r = await query('SELECT * FROM clientes WHERE id=$1', [id]);
    return r.rows[0];
  },
  async criar({ nome, telefone }) {
    const r = await query('INSERT INTO clientes(nome,telefone) VALUES($1,$2) RETURNING *', [nome, telefone]);
    return r.rows[0];
  },
  async atualizar(id, { nome, telefone }) {
    const r = await query('UPDATE clientes SET nome=$1,telefone=$2 WHERE id=$3 RETURNING *', [nome, telefone, id]);
    return r.rows[0];
  },
  async excluir(id) {
    await query('DELETE FROM clientes WHERE id=$1', [id]);
  },
};
module.exports = Clientes;
