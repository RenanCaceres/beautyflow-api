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

async function validarServicosDoUsuario(usuarioId, ids) {
  const unicos = [...new Set(ids.map((n) => parseInt(n, 10)).filter(Boolean))];
  if (unicos.length === 0) {
    const err = new Error('Selecione ao menos um serviço válido.');
    err.status = 400;
    throw err;
  }
  const r = await query(
    `SELECT id FROM servicos WHERE usuario_id = $1 AND id = ANY($2::int[])`,
    [usuarioId, unicos]
  );
  if (r.rowCount !== unicos.length) {
    const err = new Error('Um ou mais serviços não pertencem a esta conta.');
    err.status = 403;
    throw err;
  }
  return unicos;
}

async function enfileirarConfirmacaoWhatsapp(usuarioId, ag, ehAtualizacao = false) {
  if (!ag || !ag.cliente_id || !ag.cliente_telefone) return;

  const userRes = await query(
    `SELECT waha_session FROM usuarios WHERE id = $1`,
    [usuarioId]
  );
  const wahaSession = userRes.rows[0]?.waha_session;
  if (!wahaSession || !String(wahaSession).trim()) return;

  const cli = await query(
    `SELECT COALESCE(aceita_whatsapp, TRUE) AS aceita FROM clientes WHERE id = $1 AND usuario_id = $2`,
    [ag.cliente_id, usuarioId]
  );
  if (cli.rowCount === 0 || cli.rows[0].aceita === false) return;

  const primeiroNome = String(ag.cliente_nome || '').trim().split(' ')[0] || 'Cliente';
  const { dataBr, hora, chave } = extrairPartesDataHora(ag.data_hora);
  const listaServicos = formatarListaServicos(ag.servicos, ag.servico_nome);
  const ref = `ag-conf-${ag.id}-${chave}`;

  const texto = ehAtualizacao
    ? `Olá, ${primeiroNome}! ✨ Seu agendamento foi atualizado para o dia ${dataBr}, às ${hora}, para fazer ${listaServicos}. Qualquer dúvida estamos à disposição!`
    : `Olá, ${primeiroNome}! ✨ Passando para confirmar que seu horário foi agendado para o dia ${dataBr}, às ${hora}, para fazer ${listaServicos}. Te esperamos!`;

  await query(
    `INSERT INTO mensagens_whatsapp (usuario_id, cliente_id, telefone, tipo, referencia, texto, status, erro)
     VALUES ($1, $2, $3, 'confirmacao', $4, $5, 'pendente', NULL)
     ON CONFLICT (cliente_id, tipo, referencia)
     DO UPDATE SET texto = EXCLUDED.texto, status = 'pendente', erro = NULL`,
    [usuarioId, ag.cliente_id, ag.cliente_telefone, ref, texto]
  );

  acordarFila();
}

const Agendamentos = {

  async listarPorData(usuarioId, data) {
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
      WHERE a.usuario_id = $1
        AND a.data_hora::date = $2::date
      GROUP BY a.id, c.id, sl.id
      ORDER BY a.data_hora`, [usuarioId, data]);
    return r.rows;
  },

  async buscarPorId(usuarioId, id) {
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
      WHERE a.id = $1 AND a.usuario_id = $2
      GROUP BY a.id, c.id, sl.id`, [parseInt(id, 10), usuarioId]);
    return r.rows[0];
  },

  async criar(usuarioId, { cliente_id, servico_id, servico_ids, data_hora, observacao }) {
    const cli = await query(
      `SELECT id FROM clientes WHERE id = $1 AND usuario_id = $2`,
      [parseInt(cliente_id, 10), usuarioId]
    );
    if (cli.rowCount === 0) {
      const err = new Error('Cliente não encontrada para esta conta.');
      err.status = 404;
      throw err;
    }

    const rawIds = Array.isArray(servico_ids) && servico_ids.length > 0
      ? servico_ids
      : [servico_id];
    const ids = await validarServicosDoUsuario(usuarioId, rawIds);
    const primaryId = ids[0];

    const r = await query(
      `INSERT INTO agendamentos(usuario_id, cliente_id, servico_id, data_hora, observacao)
       VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [usuarioId, parseInt(cliente_id, 10), primaryId, data_hora, observacao || null]
    );
    const agId = r.rows[0].id;

    for (const sid of ids) {
      await query(
        'INSERT INTO agendamento_servicos(agendamento_id, servico_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [agId, sid]
      );
    }

    const agendamentoCriado = await this.buscarPorId(usuarioId, agId);

    // Como a cliente acabou de agendar um horário, remove qualquer mensagem de retorno pendente para ela
    await query(
      `DELETE FROM mensagens_whatsapp
       WHERE usuario_id = $1 AND cliente_id = $2 AND tipo = 'retorno' AND status = 'pendente'`,
      [usuarioId, parseInt(cliente_id, 10)]
    ).catch(() => {});

    // Enfileira mensagem de confirmação no WhatsApp (caso a conta tenha sessão WAHA configurada)
    await enfileirarConfirmacaoWhatsapp(usuarioId, agendamentoCriado, false).catch((e) => {
      console.error('Aviso: não foi possível enfileirar confirmação de agendamento:', e.message);
    });

    return agendamentoCriado;
  },

  async atualizar(usuarioId, id, { servico_id, servico_ids, data_hora, observacao }) {
    const agId = parseInt(id, 10);
    const existente = await this.buscarPorId(usuarioId, agId);
    if (!existente) {
      const err = new Error('Agendamento não encontrado.');
      err.status = 404;
      throw err;
    }

    const rawIds = Array.isArray(servico_ids) && servico_ids.length > 0
      ? servico_ids
      : [servico_id];
    const ids = await validarServicosDoUsuario(usuarioId, rawIds);
    const primaryId = ids[0];

    await query(
      `UPDATE agendamentos SET servico_id=$1, data_hora=$2, observacao=$3
       WHERE id=$4 AND usuario_id=$5`,
      [primaryId, data_hora, observacao || null, agId, usuarioId]
    );

    await query('DELETE FROM agendamento_servicos WHERE agendamento_id=$1', [agId]);
    for (const sid of ids) {
      await query(
        'INSERT INTO agendamento_servicos(agendamento_id, servico_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [agId, sid]
      );
    }

    await query(
      `DELETE FROM mensagens_whatsapp
       WHERE usuario_id = $1
         AND status IN ('pendente', 'aprovacao', 'erro')
         AND (referencia LIKE $2 OR referencia LIKE $3 OR referencia LIKE $4)`,
      [usuarioId, `ag-conf-${agId}-%`, `ag-dia-${agId}-%`, `ag-30m-${agId}-%`]
    ).catch(() => {});

    const agendamentoAtualizado = await this.buscarPorId(usuarioId, agId);

    await enfileirarConfirmacaoWhatsapp(usuarioId, agendamentoAtualizado, true).catch((e) => {
      console.error('Aviso: não foi possível enfileirar atualização de agendamento:', e.message);
    });

    return agendamentoAtualizado;
  },

  async darBaixa(usuarioId, id, { status, observacao, servico_ids, valor_final }) {
    const agId = parseInt(id, 10);
    const existente = await this.buscarPorId(usuarioId, agId);
    if (!existente) {
      const err = new Error('Agendamento não encontrado.');
      err.status = 404;
      throw err;
    }

    let ids = null;
    if (Array.isArray(servico_ids) && servico_ids.length > 0) {
      ids = await validarServicosDoUsuario(usuarioId, servico_ids);
    }

    await query(
      `UPDATE agendamentos SET status=$1, observacao=$2, valor_final=$3
       WHERE id=$4 AND usuario_id=$5`,
      [status, observacao || null, valor_final || null, agId, usuarioId]
    );

    if (ids) {
      await query('DELETE FROM agendamento_servicos WHERE agendamento_id=$1', [agId]);
      for (const sid of ids) {
        await query(
          'INSERT INTO agendamento_servicos(agendamento_id, servico_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [agId, sid]
        );
      }
      await query(
        'UPDATE agendamentos SET servico_id=$1 WHERE id=$2 AND usuario_id=$3',
        [ids[0], agId, usuarioId]
      );
    }

    await query(
      `DELETE FROM mensagens_whatsapp
       WHERE usuario_id = $1
         AND status IN ('pendente', 'aprovacao', 'erro')
         AND (referencia LIKE $2 OR referencia LIKE $3 OR referencia LIKE $4)`,
      [usuarioId, `ag-conf-${agId}-%`, `ag-dia-${agId}-%`, `ag-30m-${agId}-%`]
    ).catch(() => {});

    return this.buscarPorId(usuarioId, agId);
  },

  async excluir(usuarioId, id) {
    const agId = parseInt(id, 10);
    const r = await query(
      'DELETE FROM agendamentos WHERE id=$1 AND usuario_id=$2',
      [agId, usuarioId]
    );
    await query(
      `DELETE FROM mensagens_whatsapp
       WHERE usuario_id = $1
         AND status <> 'enviada'
         AND (referencia LIKE $2 OR referencia LIKE $3 OR referencia LIKE $4)`,
      [usuarioId, `ag-conf-${agId}-%`, `ag-dia-${agId}-%`, `ag-30m-${agId}-%`]
    ).catch(() => {});
    return r.rowCount > 0;
  },

  async listarParaNotificacoes(usuarioId) {
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
      WHERE a.usuario_id = $1
        AND a.status = 'agendado'
        AND a.data_hora::date >= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '14 days')
        AND a.data_hora::date <= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date + INTERVAL '30 days')
      GROUP BY a.id, c.id, sl.id
      ORDER BY a.data_hora ASC
    `, [usuarioId]);
    return r.rows;
  },

  async listarDiasIndisponiveis(usuarioId) {
    const r = await query(`
      SELECT TO_CHAR(data, 'YYYY-MM-DD') AS data, motivo
      FROM dias_indisponiveis
      WHERE usuario_id = $1
        AND data >= ((NOW() AT TIME ZONE 'America/Sao_Paulo')::date - INTERVAL '30 days')
      ORDER BY data ASC
    `, [usuarioId]);
    return r.rows;
  },

  async marcarDiaIndisponivel(usuarioId, data, motivo) {
    const dataIso = String(data || '').slice(0, 10);
    await query(
      `INSERT INTO dias_indisponiveis (usuario_id, data, motivo)
       VALUES ($1, $2::date, $3)
       ON CONFLICT (usuario_id, data) DO UPDATE SET motivo = EXCLUDED.motivo`,
      [usuarioId, dataIso, motivo || 'Indisponível / Folga']
    );
    return { data: dataIso, motivo: motivo || 'Indisponível / Folga' };
  },

  async removerDiaIndisponivel(usuarioId, data) {
    const dataIso = String(data || '').slice(0, 10);
    await query(
      `DELETE FROM dias_indisponiveis WHERE usuario_id = $1 AND data = $2::date`,
      [usuarioId, dataIso]
    );
  },
};

module.exports = Agendamentos;
