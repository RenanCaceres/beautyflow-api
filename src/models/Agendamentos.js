const { query } = require('../database');
const { acordarFila } = require('../services/filaWhatsapp');

// Formata lista como "n, m e o"
function formatarListaServicos(servicos, servicoNomeFallback) {
  const nomes = Array.isArray(servicos) && servicos.length > 0
    ? servicos.map((s) => s.nome).filter(Boolean)
    : (servicoNomeFallback ? [servicoNomeFallback] : []);

  if (nomes.length === 0) return 'seu atendimento';
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

function extrairPartesDataHora(dataHora) {
  const iso = typeof dataHora === 'string' ? dataHora : new Date(dataHora).toISOString();
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  const hora = iso.slice(11, 16);
  const chave = iso.slice(0, 16);
  return { dataBr: `${dia}/${mes}/${ano}`, hora, chave };
}

async function enfileirarConfirmacaoWhatsapp(ag, ehAtualizacao = false) {
  if (!ag || !ag.cliente_id || !ag.cliente_telefone) return;

  const cli = await query(
    `SELECT COALESCE(aceita_whatsapp, TRUE) AS aceita FROM clientes WHERE id = $1`,
    [ag.cliente_id]
  );
  if (cli.rowCount > 0 && cli.rows[0].aceita === false) return;

  const primeiroNome = String(ag.cliente_nome || '').trim().split(' ')[0] || 'Cliente';
  const { dataBr, hora, chave } = extrairPartesDataHora(ag.data_hora);
  const listaServicos = formatarListaServicos(ag.servicos, ag.servico_nome);
  const ref = `ag-conf-${ag.id}-${chave}`;

  const texto = ehAtualizacao
    ? `Olá, ${primeiroNome}! ✨ Seu agendamento foi atualizado para o dia ${dataBr}, às ${hora}, para fazer ${listaServicos}. Qualquer dúvida estamos à disposição!`
    : `Olá, ${primeiroNome}! ✨ Passando para confirmar que seu horário foi agendado para o dia ${dataBr}, às ${hora}, para fazer ${listaServicos}. Te esperamos!`;

  await query(
    `INSERT INTO mensagens_whatsapp (cliente_id, telefone, tipo, referencia, texto, status, erro)
     VALUES ($1, $2, 'confirmacao', $3, $4, 'pendente', NULL)
     ON CONFLICT (cliente_id, tipo, referencia)
     DO UPDATE SET texto = EXCLUDED.texto, status = 'pendente', erro = NULL`,
    [ag.cliente_id, ag.cliente_telefone, ref, texto]
  );

  acordarFila();
}

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

    const agendamentoCriado = await this.buscarPorId(agId);

    // Enfileira mensagem de confirmação no WhatsApp (com range limit via WAHA)
    await enfileirarConfirmacaoWhatsapp(agendamentoCriado, false).catch((e) => {
      console.error('Aviso: não foi possível enfileirar confirmação de agendamento:', e.message);
    });

    return agendamentoCriado;
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

    // Remove lembretes/confirmações pendentes do horário antigo caso tenha mudado a data/hora
    await query(
      `DELETE FROM mensagens_whatsapp
       WHERE status = 'pendente'
         AND (referencia LIKE $1 OR referencia LIKE $2 OR referencia LIKE $3)`,
      [`ag-conf-${parseInt(id)}-%`, `ag-dia-${parseInt(id)}-%`, `ag-30m-${parseInt(id)}-%`]
    ).catch(() => {});

    const agendamentoAtualizado = await this.buscarPorId(id);

    await enfileirarConfirmacaoWhatsapp(agendamentoAtualizado, true).catch((e) => {
      console.error('Aviso: não foi possível enfileirar atualização de agendamento:', e.message);
    });

    return agendamentoAtualizado;
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

    // Se deu baixa (realizado ou cancelado), remove lembretes de agendamento ainda pendentes na fila
    await query(
      `DELETE FROM mensagens_whatsapp
       WHERE status = 'pendente'
         AND (referencia LIKE $1 OR referencia LIKE $2 OR referencia LIKE $3)`,
      [`ag-conf-${parseInt(id)}-%`, `ag-dia-${parseInt(id)}-%`, `ag-30m-${parseInt(id)}-%`]
    ).catch(() => {});

    return this.buscarPorId(id);
  },

  async excluir(id) {
    await query(
      `DELETE FROM mensagens_whatsapp
       WHERE status = 'pendente'
         AND (referencia LIKE $1 OR referencia LIKE $2 OR referencia LIKE $3)`,
      [`ag-conf-${parseInt(id)}-%`, `ag-dia-${parseInt(id)}-%`, `ag-30m-${parseInt(id)}-%`]
    ).catch(() => {});
    await query('DELETE FROM agendamentos WHERE id=$1', [parseInt(id)]);
  },

  async listarParaNotificacoes() {
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
      WHERE a.status = 'agendado'
        AND a.data_hora::date >= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '14 days')
        AND a.data_hora::date <= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date + INTERVAL '30 days')
      GROUP BY a.id, c.id, sl.id
      ORDER BY a.data_hora ASC
    `);
    return r.rows;
  },
};

module.exports = Agendamentos;

