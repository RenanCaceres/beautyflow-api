const { query } = require('../database');

async function queryEntradas(periodo, params) {
  const { usuarioId } = params;
  let text, values;
  if (periodo === 'dia') {
    text = `
      SELECT a.data_hora::date AS periodo,
             COALESCE(SUM(COALESCE(a.valor_final, sv.valor)), 0) AS total
      FROM agendamentos a
      LEFT JOIN agendamento_servicos ags ON ags.agendamento_id = a.id
      LEFT JOIN servicos sv ON sv.id = ags.servico_id
      WHERE a.usuario_id = $1
        AND a.status = 'realizado'
        AND a.data_hora::date = $2::date
      GROUP BY a.data_hora::date`;
    values = [usuarioId, params.dia];
  } else if (periodo === 'mes') {
    text = `
      SELECT EXTRACT(DAY FROM a.data_hora)::int AS periodo,
             COALESCE(SUM(COALESCE(a.valor_final, sv.valor)), 0) AS total
      FROM agendamentos a
      LEFT JOIN agendamento_servicos ags ON ags.agendamento_id = a.id
      LEFT JOIN servicos sv ON sv.id = ags.servico_id
      WHERE a.usuario_id = $1
        AND a.status = 'realizado'
        AND EXTRACT(MONTH FROM a.data_hora) = $2
        AND EXTRACT(YEAR  FROM a.data_hora) = $3
      GROUP BY EXTRACT(DAY FROM a.data_hora)
      ORDER BY 1`;
    values = [usuarioId, params.mes, params.ano];
  } else {
    text = `
      SELECT EXTRACT(MONTH FROM a.data_hora)::int AS periodo,
             COALESCE(SUM(COALESCE(a.valor_final, sv.valor)), 0) AS total
      FROM agendamentos a
      LEFT JOIN agendamento_servicos ags ON ags.agendamento_id = a.id
      LEFT JOIN servicos sv ON sv.id = ags.servico_id
      WHERE a.usuario_id = $1
        AND a.status = 'realizado'
        AND EXTRACT(YEAR FROM a.data_hora) = $2
      GROUP BY EXTRACT(MONTH FROM a.data_hora)
      ORDER BY 1`;
    values = [usuarioId, params.ano];
  }
  return (await query(text, values)).rows;
}

async function querySaidas(periodo, params) {
  const { usuarioId } = params;
  let text, values;
  if (periodo === 'dia') {
    text = `SELECT data AS periodo, SUM(valor) AS total FROM consumo
            WHERE usuario_id=$1 AND data=$2::date GROUP BY data`;
    values = [usuarioId, params.dia];
  } else if (periodo === 'mes') {
    text = `SELECT EXTRACT(DAY FROM data)::int AS periodo, SUM(valor) AS total FROM consumo
            WHERE usuario_id=$1 AND EXTRACT(MONTH FROM data)=$2 AND EXTRACT(YEAR FROM data)=$3
            GROUP BY EXTRACT(DAY FROM data) ORDER BY 1`;
    values = [usuarioId, params.mes, params.ano];
  } else {
    text = `SELECT EXTRACT(MONTH FROM data)::int AS periodo, SUM(valor) AS total FROM consumo
            WHERE usuario_id=$1 AND EXTRACT(YEAR FROM data)=$2
            GROUP BY EXTRACT(MONTH FROM data) ORDER BY 1`;
    values = [usuarioId, params.ano];
  }
  return (await query(text, values)).rows;
}

async function queryTotais(periodo, params) {
  const { usuarioId } = params;
  let whereA, whereC, vA, vC;
  if (periodo === 'dia') {
    whereA = 'AND a.data_hora::date=$2::date'; vA = [usuarioId, params.dia];
    whereC = 'AND data=$2::date';              vC = [usuarioId, params.dia];
  } else if (periodo === 'mes') {
    whereA = 'AND EXTRACT(MONTH FROM a.data_hora)=$2 AND EXTRACT(YEAR FROM a.data_hora)=$3'; vA = [usuarioId, params.mes, params.ano];
    whereC = 'AND EXTRACT(MONTH FROM data)=$2 AND EXTRACT(YEAR FROM data)=$3';               vC = [usuarioId, params.mes, params.ano];
  } else {
    whereA = 'AND EXTRACT(YEAR FROM a.data_hora)=$2'; vA = [usuarioId, params.ano];
    whereC = 'AND EXTRACT(YEAR FROM data)=$2';        vC = [usuarioId, params.ano];
  }

  const r1 = await query(`
    SELECT COALESCE(SUM(
      COALESCE(a.valor_final, (
        SELECT SUM(sv2.valor)
        FROM agendamento_servicos ags2
        JOIN servicos sv2 ON sv2.id = ags2.servico_id
        WHERE ags2.agendamento_id = a.id
      ), s.valor)
    ), 0) AS total
    FROM agendamentos a
    LEFT JOIN servicos s ON s.id = a.servico_id
    WHERE a.usuario_id = $1 AND a.status = 'realizado' ${whereA}`, vA);

  const r2 = await query(
    `SELECT COALESCE(SUM(valor),0) AS total FROM consumo WHERE usuario_id = $1 ${whereC}`,
    vC
  );

  const entradas = parseFloat(r1.rows[0].total);
  const saidas   = parseFloat(r2.rows[0].total);
  return { entradas, saidas, lucro: entradas - saidas };
}

async function queryAtendimentosPorMes(ano, usuarioId) {
  const r = await query(
    `SELECT
       EXTRACT(MONTH FROM a.data_hora)::int AS mes,
       COUNT(a.id)::int AS atendimentos,
       COUNT(DISTINCT a.cliente_id)::int AS clientes
     FROM agendamentos a
     WHERE a.usuario_id = $1
       AND a.status = 'realizado'
       AND EXTRACT(YEAR FROM a.data_hora) = $2
     GROUP BY EXTRACT(MONTH FROM a.data_hora)
     ORDER BY 1`,
    [usuarioId, ano]
  );
  return r.rows;
}

module.exports = { queryEntradas, querySaidas, queryTotais, queryAtendimentosPorMes };
