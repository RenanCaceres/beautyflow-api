const { query } = require('../database');

async function listar(filtro = 'todas') {
  const r = await query(`
    SELECT c.id, c.nome, c.telefone,
           s.nome AS servico_nome, s.intervalo_retorno_dias,
           ult.data_hora AS ultimo_atendimento,
           (ult.data_hora::date + s.intervalo_retorno_dias) AS data_retorno_ideal,
           ((ult.data_hora::date + s.intervalo_retorno_dias) - CURRENT_DATE) AS dias_para_retorno
    FROM clientes c
    JOIN LATERAL (
      SELECT a.data_hora, a.servico_id FROM agendamentos a
      WHERE a.cliente_id=c.id AND a.status='realizado'
      ORDER BY a.data_hora DESC LIMIT 1
    ) ult ON true
    JOIN servicos s ON s.id=ult.servico_id
    ORDER BY dias_para_retorno`);

  let rows = r.rows.map(row => ({
    ...row,
    dias_para_retorno: parseInt(row.dias_para_retorno),
  }));

  if (filtro === 'hoje')     rows = rows.filter(r => r.dias_para_retorno === 0);
  if (filtro === '3dias')    rows = rows.filter(r => r.dias_para_retorno > 0 && r.dias_para_retorno <= 3);
  if (filtro === '7dias')    rows = rows.filter(r => r.dias_para_retorno > 3 && r.dias_para_retorno <= 7);
  if (filtro === 'vencidas') rows = rows.filter(r => r.dias_para_retorno < 0);
  return rows;
}

module.exports = { listar };
