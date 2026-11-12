const { query } = require('../database');

function competenciaAtual() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

function validarCompetencia(comp) {
  const str = String(comp || '').trim();
  if (/^\d{4}-\d{2}$/.test(str)) return str;
  return competenciaAtual();
}

function ultimasCompetencias(baseComp, qtd = 6) {
  const [ano, mes] = baseComp.split('-').map(Number);
  const lista = [];
  for (let i = qtd - 1; i >= 0; i--) {
    const dt = new Date(ano, mes - 1 - i, 1);
    const a = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    lista.push(`${a}-${m}`);
  }
  return lista;
}

const FinanceiroSaas = {
  async resumoCompetencia(comp) {
    const competencia = validarCompetencia(comp);
    const [ano, mes] = competencia.split('-').map(Number);
    const mesesHistorico = ultimasCompetencias(competencia, 6);

    const [contasRes, despesasRes, histPagRes, histDespRes] = await Promise.all([
      query(
        `SELECT
           u.id AS usuario_id,
           u.username,
           u.nome,
           u.nome_salao,
           u.role,
           u.ativo,
           u.plano,
           u.valor_mensal,
           u.dia_vencimento,
           p.id AS pagamento_id,
           p.valor AS valor_lancado,
           p.status AS status_pagamento,
           p.data_pagamento,
           p.forma_pagamento,
           p.observacao
         FROM usuarios u
         LEFT JOIN pagamentos_saas p
           ON p.usuario_id = u.id AND p.competencia = $1
         ORDER BY u.id ASC`,
        [competencia]
      ),
      query(
        `SELECT * FROM despesas_saas
         WHERE EXTRACT(YEAR FROM data) = $1 AND EXTRACT(MONTH FROM data) = $2
         ORDER BY data DESC, id DESC`,
        [ano, mes]
      ),
      query(
        `SELECT competencia, COALESCE(SUM(valor), 0) AS total
         FROM pagamentos_saas
         WHERE status = 'pago' AND competencia = ANY($1::text[])
         GROUP BY competencia`,
        [mesesHistorico]
      ),
      query(
        `SELECT TO_CHAR(data, 'YYYY-MM') AS competencia, COALESCE(SUM(valor), 0) AS total
         FROM despesas_saas
         WHERE TO_CHAR(data, 'YYYY-MM') = ANY($1::text[])
         GROUP BY TO_CHAR(data, 'YYYY-MM')`,
        [mesesHistorico]
      ),
    ]);

    let mrrPrevisto = 0;
    let recebidoMes = 0;
    let aReceberMes = 0;
    let contasPagas = 0;
    let contasPendentes = 0;

    const mensalidades = contasRes.rows.map((row) => {
      const valorMensal = parseFloat(row.valor_mensal || 0);
      const valorEfetivo = row.valor_lancado != null ? parseFloat(row.valor_lancado) : valorMensal;
      const status = row.status_pagamento || (valorMensal > 0 && row.ativo ? 'pendente' : 'isento');

      if (row.ativo && valorMensal > 0) {
        mrrPrevisto += valorMensal;
      }

      if (status === 'pago') {
        recebidoMes += valorEfetivo;
        contasPagas++;
      } else if (status === 'pendente' && valorEfetivo > 0) {
        aReceberMes += valorEfetivo;
        contasPendentes++;
      }

      return {
        usuario_id: row.usuario_id,
        username: row.username,
        nome: row.nome,
        nome_salao: row.nome_salao,
        role: row.role,
        ativo: row.ativo,
        plano: row.plano,
        valor_mensal: valorMensal,
        dia_vencimento: row.dia_vencimento,
        pagamento_id: row.pagamento_id,
        valor: valorEfetivo,
        status,
        data_pagamento: row.data_pagamento,
        forma_pagamento: row.forma_pagamento,
        observacao: row.observacao,
      };
    });

    const despesasMes = despesasRes.rows.reduce((acc, d) => acc + parseFloat(d.valor || 0), 0);

    const mapPag = new Map(histPagRes.rows.map((r) => [r.competencia, parseFloat(r.total || 0)]));
    const mapDesp = new Map(histDespRes.rows.map((r) => [r.competencia, parseFloat(r.total || 0)]));
    const historico = mesesHistorico.map((c) => {
      const rec = mapPag.get(c) || 0;
      const desp = mapDesp.get(c) || 0;
      return {
        competencia: c,
        recebido: rec,
        despesas: desp,
        lucro: rec - desp,
      };
    });

    return {
      competencia,
      kpis: {
        mrrPrevisto,
        recebidoMes,
        aReceberMes,
        despesasMes,
        lucroLiquido: recebidoMes - despesasMes,
        contasPagas,
        contasPendentes,
      },
      mensalidades,
      despesas: despesasRes.rows,
      historico,
    };
  },

  async registrarPagamento({
    usuario_id,
    competencia,
    valor,
    status = 'pago',
    data_pagamento = null,
    forma_pagamento = 'Pix',
    observacao = null,
  }) {
    const uid = parseInt(usuario_id, 10);
    const comp = validarCompetencia(competencia);
    const statusLimpo = ['pago', 'pendente', 'isento'].includes(status) ? status : 'pago';
    const valorNum = parseFloat(valor || 0) || 0;
    const dataPag = statusLimpo === 'pago'
      ? (data_pagamento || new Date().toISOString().slice(0, 10))
      : null;

    const r = await query(
      `INSERT INTO pagamentos_saas (usuario_id, competencia, valor, status, data_pagamento, forma_pagamento, observacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (usuario_id, competencia)
       DO UPDATE SET
         valor = EXCLUDED.valor,
         status = EXCLUDED.status,
         data_pagamento = EXCLUDED.data_pagamento,
         forma_pagamento = EXCLUDED.forma_pagamento,
         observacao = EXCLUDED.observacao
       RETURNING *`,
      [
        uid,
        comp,
        valorNum,
        statusLimpo,
        dataPag,
        forma_pagamento ? String(forma_pagamento).trim() : null,
        observacao ? String(observacao).trim() : null,
      ]
    );
    return r.rows[0];
  },

  async removerPagamento(id) {
    const r = await query(`DELETE FROM pagamentos_saas WHERE id = $1`, [parseInt(id, 10)]);
    return r.rowCount > 0;
  },

  async criarDespesa({ descricao, categoria = 'Infraestrutura', valor, data, observacao = null }) {
    if (!descricao || valor === undefined || valor === null) {
      const err = new Error('Descrição e valor são obrigatórios.');
      err.status = 400;
      throw err;
    }
    const r = await query(
      `INSERT INTO despesas_saas (descricao, categoria, valor, data, observacao)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        String(descricao).trim(),
        String(categoria || 'Infraestrutura').trim(),
        parseFloat(valor),
        data || new Date().toISOString().slice(0, 10),
        observacao ? String(observacao).trim() : null,
      ]
    );
    return r.rows[0];
  },

  async excluirDespesa(id) {
    const r = await query(`DELETE FROM despesas_saas WHERE id = $1`, [parseInt(id, 10)]);
    return r.rowCount > 0;
  },
};

module.exports = FinanceiroSaas;
