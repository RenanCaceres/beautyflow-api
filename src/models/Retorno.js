const { query } = require('../database');

const SQL_BASE = `
  WITH servicos_realizados AS (
    SELECT a.cliente_id, a.data_hora, ags.servico_id
    FROM agendamentos a
    JOIN agendamento_servicos ags ON ags.agendamento_id = a.id
    WHERE a.status = 'realizado'
    UNION
    SELECT a.cliente_id, a.data_hora, a.servico_id
    FROM agendamentos a
    WHERE a.status = 'realizado' AND a.servico_id IS NOT NULL
  ),
  ultimo_por_servico AS (
    SELECT DISTINCT ON (sr.cliente_id, sr.servico_id)
      sr.cliente_id,
      sr.servico_id,
      s.nome AS servico_nome,
      s.intervalo_retorno_dias,
      sr.data_hora AS ultimo_atendimento,
      (sr.data_hora::date + s.intervalo_retorno_dias) AS data_retorno_ideal,
      ((sr.data_hora::date + s.intervalo_retorno_dias) - CURRENT_DATE) AS dias_para_retorno
    FROM servicos_realizados sr
    JOIN servicos s ON s.id = sr.servico_id
    ORDER BY sr.cliente_id, sr.servico_id, sr.data_hora DESC
  )
`;

function normalizarServicos(servicos = []) {
  return servicos.map((s) => {
    const dias = parseInt(s.dias_para_retorno, 10);
    return {
      ...s,
      dias_para_retorno: dias,
      dias_vencidos: dias < 0 ? Math.abs(dias) : 0,
    };
  });
}

async function listar(filtro = 'todas') {
  const r = await query(`
    ${SQL_BASE}
    SELECT
      c.id,
      c.nome,
      c.telefone,
      mais_vencido.servico_id,
      mais_vencido.servico_nome,
      mais_vencido.intervalo_retorno_dias,
      mais_vencido.ultimo_atendimento,
      mais_vencido.data_retorno_ideal,
      mais_vencido.dias_para_retorno,
      (
        SELECT COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'servico_id', u.servico_id,
              'servico_nome', u.servico_nome,
              'intervalo_retorno_dias', u.intervalo_retorno_dias,
              'ultimo_atendimento', u.ultimo_atendimento,
              'data_retorno_ideal', u.data_retorno_ideal,
              'dias_para_retorno', u.dias_para_retorno,
              'dias_vencidos', CASE WHEN u.dias_para_retorno < 0 THEN ABS(u.dias_para_retorno) ELSE 0 END
            )
            ORDER BY u.dias_para_retorno ASC, u.ultimo_atendimento DESC
          ),
          '[]'::json
        )
        FROM ultimo_por_servico u
        WHERE u.cliente_id = c.id
      ) AS servicos
    FROM clientes c
    JOIN LATERAL (
      SELECT *
      FROM ultimo_por_servico u
      WHERE u.cliente_id = c.id
      ORDER BY u.dias_para_retorno ASC, u.ultimo_atendimento DESC
      LIMIT 1
    ) mais_vencido ON true
    ORDER BY mais_vencido.dias_para_retorno ASC, c.nome ASC
  `);

  let rows = r.rows.map((row) => {
    const dias = parseInt(row.dias_para_retorno, 10);
    const servicos = normalizarServicos(row.servicos || []);
    return {
      ...row,
      dias_para_retorno: dias,
      dias_vencidos: dias < 0 ? Math.abs(dias) : 0,
      total_servicos: servicos.length,
      servicos,
    };
  });

  if (filtro === 'hoje')     rows = rows.filter((r) => r.dias_para_retorno === 0);
  if (filtro === '3dias')    rows = rows.filter((r) => r.dias_para_retorno > 0 && r.dias_para_retorno <= 3);
  if (filtro === '7dias')    rows = rows.filter((r) => r.dias_para_retorno > 3 && r.dias_para_retorno <= 7);
  if (filtro === 'vencidas') rows = rows.filter((r) => r.dias_para_retorno < 0);

  return rows;
}

async function buscarPorCliente(clienteId) {
  const r = await query(
    `
    ${SQL_BASE}
    SELECT
      u.servico_id,
      u.servico_nome,
      u.intervalo_retorno_dias,
      u.ultimo_atendimento,
      u.data_retorno_ideal,
      u.dias_para_retorno
    FROM ultimo_por_servico u
    WHERE u.cliente_id = $1
    ORDER BY u.dias_para_retorno ASC, u.ultimo_atendimento DESC
    `,
    [parseInt(clienteId, 10)]
  );
  return normalizarServicos(r.rows);
}

module.exports = { listar, buscarPorCliente };
