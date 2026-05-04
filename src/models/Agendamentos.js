const { query } = require('../database');

const Agendamentos = {

  async listarPorData(data) {
    // Busca agendamentos com seus serviços via agendamento_servicos
    const r = await query(`
      SELECT a.id, a.data_hora, a.status, a.observacao, a.valor_final,
             c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
             -- serviço legado (retrocompatibilidade)
             a.servico_id,
             sl.nome  AS servico_nome,
             sl.valor AS servico_valor,
             -- múltiplos serviços como JSON
             COALESCE(
               JSON_AGG(
                 JSON_BUILD_OBJECT('id', sv.id, 'nome', sv.nome, 'valor', sv.valor)
                 ORDER BY sv.nome
               ) FILTER (WHERE sv.id IS NOT NULL),
               '[]'
             ) AS servicos
      FROM agendamentos a
      JOIN clientes c ON c.id = a.cliente_id
      LEFT JOIN servicos sl ON sl.id = a.servico_id
      LEFT JOIN agendamento_servicos ags ON ags.agendamento_id = a.id
      LEFT JOIN servicos sv ON sv.id = ags.servico_id
      WHERE a.data_hora::date = $1::date
      GROUP BY a.id, c.id, sl.id
      ORDER BY a.data_hora`, [data]);
    return r.rows;
  },

  async buscarPorId(id) {
    const r = await query(`
      SELECT a.id, a.data_hora, a.status, a.observacao, a.valor_final,
             c.id AS cliente_id, c.nome AS cliente_nome, c.telefone AS cliente_telefone,
             a.servico_id,
             sl.nome  AS servico_nome,
             sl.valor AS servico_valor,
             COALESCE(
               JSON_AGG(
                 JSON_BUILD_OBJECT('id', sv.id, 'nome', sv.nome, 'valor', sv.valor)
                 ORDER BY sv.nome
               ) FILTER (WHERE sv.id IS NOT NULL),
               '[]'
             ) AS servicos
      FROM agendamentos a
      JOIN clientes c ON c.id = a.cliente_id
      LEFT JOIN servicos sl ON sl.id = a.servico_id
      LEFT JOIN agendamento_servicos ags ON ags.agendamento_id = a.id
      LEFT JOIN servicos sv ON sv.id = ags.servico_id
      WHERE a.id = $1
      GROUP BY a.id, c.id, sl.id`, [id]);
    return r.rows[0];
  },

  async criar({ cliente_id, servico_id, servico_ids, data_hora, observacao }) {
    // Usa servico_ids se fornecido, senão usa servico_id
    const ids = Array.isArray(servico_ids) && servico_ids.length > 0
      ? servico_ids.map(Number)
      : [parseInt(servico_id)];

    const primaryId = ids[0];

    const r = await query(
      'INSERT INTO agendamentos(cliente_id, servico_id, data_hora, observacao) VALUES($1,$2,$3,$4) RETURNING id',
      // CORREÇÃO: passa data_hora como string com offset para pg interpretar corretamente
      [parseInt(cliente_id), primaryId, data_hora, observacao || null]
    );
    const agId = r.rows[0].id;

    // Insere na tabela de múltiplos serviços
    for (const sid of ids) {
      await query(
        'INSERT INTO agendamento_servicos(agendamento_id, servico_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [agId, sid]
      );
    }

    return this.buscarPorId(agId);
  },

  async atualizar(id, { servico_id, servico_ids, data_hora, observacao }) {
    const ids = Array.isArray(servico_ids) && servico_ids.length > 0
      ? servico_ids.map(Number)
      : [parseInt(servico_id)];

    const primaryId = ids[0];

    await query(
      'UPDATE agendamentos SET servico_id=$1, data_hora=$2, observacao=$3 WHERE id=$4',
      // CORREÇÃO: passa data_hora como string com offset
      [primaryId, data_hora, observacao || null, parseInt(id)]
    );

    // Atualiza serviços: apaga e reinseré
    await query('DELETE FROM agendamento_servicos WHERE agendamento_id=$1', [parseInt(id)]);
    for (const sid of ids) {
      await query(
        'INSERT INTO agendamento_servicos(agendamento_id, servico_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [parseInt(id), sid]
      );
    }

    return this.buscarPorId(id);
  },

  async darBaixa(id, { status, observacao, servico_ids, valor_final }) {
    await query(
      'UPDATE agendamentos SET status=$1, observacao=$2, valor_final=$3 WHERE id=$4',
      [status, observacao || null, valor_final || null, parseInt(id)]
    );

    // Atualiza serviços se fornecidos
    if (Array.isArray(servico_ids) && servico_ids.length > 0) {
      const ids = servico_ids.map(Number);
      await query('DELETE FROM agendamento_servicos WHERE agendamento_id=$1', [parseInt(id)]);
      for (const sid of ids) {
        await query(
          'INSERT INTO agendamento_servicos(agendamento_id, servico_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [parseInt(id), sid]
        );
      }
      // Atualiza servico_id principal
      await query('UPDATE agendamentos SET servico_id=$1 WHERE id=$2', [ids[0], parseInt(id)]);
    }

    return this.buscarPorId(id);
  },

  async excluir(id) {
    await query('DELETE FROM agendamentos WHERE id=$1', [parseInt(id)]);
  },
};

module.exports = Agendamentos;
