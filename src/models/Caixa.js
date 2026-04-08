const { query } = require('../database');

async function queryEntradas(periodo, params) {
  let text, values;
  if (periodo === 'dia') {
    text = `SELECT a.data_hora::date AS periodo, SUM(s.valor) AS total
            FROM agendamentos a JOIN servicos s ON s.id=a.servico_id
            WHERE a.status='realizado' AND a.data_hora::date=$1::date
            GROUP BY a.data_hora::date`;
    values = [params.dia];
  } else if (periodo === 'mes') {
    text = `SELECT EXTRACT(DAY FROM a.data_hora)::int AS periodo, SUM(s.valor) AS total
            FROM agendamentos a JOIN servicos s ON s.id=a.servico_id
            WHERE a.status='realizado'
              AND EXTRACT(MONTH FROM a.data_hora)=$1
              AND EXTRACT(YEAR FROM a.data_hora)=$2
            GROUP BY EXTRACT(DAY FROM a.data_hora) ORDER BY 1`;
    values = [params.mes, params.ano];
  } else {
    text = `SELECT EXTRACT(MONTH FROM a.data_hora)::int AS periodo, SUM(s.valor) AS total
            FROM agendamentos a JOIN servicos s ON s.id=a.servico_id
            WHERE a.status='realizado' AND EXTRACT(YEAR FROM a.data_hora)=$1
            GROUP BY EXTRACT(MONTH FROM a.data_hora) ORDER BY 1`;
    values = [params.ano];
  }
  return (await query(text, values)).rows;
}

async function querySaidas(periodo, params) {
  let text, values;
  if (periodo === 'dia') {
    text = `SELECT data AS periodo, SUM(valor) AS total FROM consumo
            WHERE data=$1::date GROUP BY data`;
    values = [params.dia];
  } else if (periodo === 'mes') {
    text = `SELECT EXTRACT(DAY FROM data)::int AS periodo, SUM(valor) AS total FROM consumo
            WHERE EXTRACT(MONTH FROM data)=$1 AND EXTRACT(YEAR FROM data)=$2
            GROUP BY EXTRACT(DAY FROM data) ORDER BY 1`;
    values = [params.mes, params.ano];
  } else {
    text = `SELECT EXTRACT(MONTH FROM data)::int AS periodo, SUM(valor) AS total FROM consumo
            WHERE EXTRACT(YEAR FROM data)=$1
            GROUP BY EXTRACT(MONTH FROM data) ORDER BY 1`;
    values = [params.ano];
  }
  return (await query(text, values)).rows;
}

async function queryTotais(periodo, params) {
  let whereA, whereC, vA, vC;
  if (periodo === 'dia') {
    whereA = "AND a.data_hora::date=$1::date"; vA = [params.dia];
    whereC = "AND data=$1::date";              vC = [params.dia];
  } else if (periodo === 'mes') {
    whereA = "AND EXTRACT(MONTH FROM a.data_hora)=$1 AND EXTRACT(YEAR FROM a.data_hora)=$2"; vA = [params.mes, params.ano];
    whereC = "AND EXTRACT(MONTH FROM data)=$1 AND EXTRACT(YEAR FROM data)=$2";               vC = [params.mes, params.ano];
  } else {
    whereA = "AND EXTRACT(YEAR FROM a.data_hora)=$1"; vA = [params.ano];
    whereC = "AND EXTRACT(YEAR FROM data)=$1";        vC = [params.ano];
  }
  const r1 = await query(`SELECT COALESCE(SUM(s.valor),0) AS total FROM agendamentos a JOIN servicos s ON s.id=a.servico_id WHERE a.status='realizado' ${whereA}`, vA);
  const r2 = await query(`SELECT COALESCE(SUM(valor),0) AS total FROM consumo WHERE 1=1 ${whereC}`, vC);
  const entradas = parseFloat(r1.rows[0].total);
  const saidas   = parseFloat(r2.rows[0].total);
  return { entradas, saidas, lucro: entradas - saidas };
}

module.exports = { queryEntradas, querySaidas, queryTotais };
