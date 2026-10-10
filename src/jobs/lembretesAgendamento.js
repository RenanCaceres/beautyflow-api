// Jobs automáticos para lembrar a cliente no WhatsApp (via WAHA com range limit):
// 1. No dia do agendamento (a partir das 07:30 da manhã)
// 2. Meia hora (30 minutos) antes do horário marcado
const cron = require('node-cron');
const { query } = require('../database');
const { acordarFila } = require('../services/filaWhatsapp');

function extrairHora(dataHora) {
  const iso = typeof dataHora === 'string' ? dataHora : new Date(dataHora).toISOString();
  return iso.slice(11, 16);
}

function chaveDataHora(dataHora) {
  const iso = typeof dataHora === 'string' ? dataHora : new Date(dataHora).toISOString();
  return iso.slice(0, 16); // YYYY-MM-DDTHH:MM
}

function formatarListaNomes(nomesString) {
  const nomes = String(nomesString || '')
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean);
  if (nomes.length === 0) return 'seu atendimento';
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

const SQL_AGENDAMENTOS_COM_SERVICOS = `
  SELECT
    a.id,
    a.data_hora,
    a.status,
    c.id AS cliente_id,
    c.nome AS cliente_nome,
    c.telefone AS cliente_telefone,
    COALESCE(
      NULLIF(
        STRING_AGG(sv.nome, '||' ORDER BY sv.nome),
        ''
      ),
      sl.nome,
      'seu atendimento'
    ) AS servicos_nomes
  FROM agendamentos a
  JOIN clientes c ON c.id = a.cliente_id
  LEFT JOIN servicos sl ON sl.id = a.servico_id
  LEFT JOIN agendamento_servicos ags ON ags.agendamento_id = a.id
  LEFT JOIN servicos sv ON sv.id = ags.servico_id
`;

/**
 * 1. Lembrete no dia do agendamento (para agendamentos de hoje que ainda estão a > 45 min
 *    e que não acabaram de ser agendados hoje mesmo com mensagem de confirmação)
 */
async function enfileirarLembretesDoDia() {
  const r = await query(`
    ${SQL_AGENDAMENTOS_COM_SERVICOS}
    WHERE a.status = 'agendado'
      AND COALESCE(c.aceita_whatsapp, TRUE) = TRUE
      AND a.data_hora::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
      AND a.data_hora > (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '45 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM mensagens_whatsapp m
        WHERE m.cliente_id = c.id
          AND m.tipo = 'confirmacao'
          AND m.referencia LIKE ('ag-conf-' || a.id || '-%')
          AND (m.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
      )
    GROUP BY a.id, c.id, sl.id
    ORDER BY a.data_hora ASC
  `);

  let novos = 0;
  for (const ag of r.rows) {
    const primeiroNome = ag.cliente_nome.trim().split(' ')[0];
    const hora = extrairHora(ag.data_hora);
    const listaServicos = formatarListaNomes(ag.servicos_nomes);
    const ref = `ag-dia-${ag.id}-${chaveDataHora(ag.data_hora)}`;

    const texto =
      `Olá, ${primeiroNome}! Passando para lembrar do seu agendamento hoje às ${hora} ` +
      `para fazer ${listaServicos} ✨ Estamos te esperando!`;

    const ins = await query(
      `INSERT INTO mensagens_whatsapp (cliente_id, telefone, tipo, referencia, texto)
       VALUES ($1, $2, 'lembrete_dia', $3, $4)
       ON CONFLICT (cliente_id, tipo, referencia) DO NOTHING`,
      [ag.cliente_id, ag.cliente_telefone, ref, texto]
    );
    novos += ins.rowCount;
  }

  if (novos > 0) {
    console.log(`✿ [WAHA Lembrete do Dia] ${novos} lembrete(s) enfileirado(s) com range limit`);
    acordarFila();
  }
  return novos;
}

/**
 * 2. Lembrete 30 minutos antes do agendamento (janela entre 15 e 35 min antes do horário)
 */
async function enfileirarLembretes30Min() {
  const r = await query(`
    ${SQL_AGENDAMENTOS_COM_SERVICOS}
    WHERE a.status = 'agendado'
      AND COALESCE(c.aceita_whatsapp, TRUE) = TRUE
      AND a.data_hora >= (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '15 minutes'
      AND a.data_hora <= (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '35 minutes'
    GROUP BY a.id, c.id, sl.id
    ORDER BY a.data_hora ASC
  `);

  let novos = 0;
  for (const ag of r.rows) {
    const primeiroNome = ag.cliente_nome.trim().split(' ')[0];
    const hora = extrairHora(ag.data_hora);
    const listaServicos = formatarListaNomes(ag.servicos_nomes);
    const ref = `ag-30m-${ag.id}-${chaveDataHora(ag.data_hora)}`;

    const texto =
      `Oi, ${primeiroNome}! Seu horário para fazer ${listaServicos} é daqui a 30 minutinhos ` +
      `(às ${hora}) ⏰ Já estamos te esperando!`;

    const ins = await query(
      `INSERT INTO mensagens_whatsapp (cliente_id, telefone, tipo, referencia, texto)
       VALUES ($1, $2, 'lembrete_30m', $3, $4)
       ON CONFLICT (cliente_id, tipo, referencia) DO NOTHING`,
      [ag.cliente_id, ag.cliente_telefone, ref, texto]
    );
    novos += ins.rowCount;
  }

  if (novos > 0) {
    console.log(`✿ [WAHA Lembrete 30min] ${novos} lembrete(s) enfileirado(s) com range limit`);
    acordarFila();
  }
  return novos;
}

function iniciar() {
  // Verifica a cada 1 minuto os lembretes de 30 minutos antes
  cron.schedule(
    '* * * * *',
    () => enfileirarLembretes30Min().catch((err) => console.error('Erro lembrete 30min:', err.message)),
    { timezone: 'America/Sao_Paulo' }
  );

  // Verifica às 07:30 da manhã (e a cada 5 min das 07h às 20h para novos agendamentos do dia)
  cron.schedule(
    '*/5 7-20 * * *',
    () => {
      const horaBr = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
      );
      if (horaBr.getHours() === 7 && horaBr.getMinutes() < 30) return;
      enfileirarLembretesDoDia().catch((err) => console.error('Erro lembrete do dia:', err.message));
    },
    { timezone: 'America/Sao_Paulo' }
  );

  console.log('✿ Jobs de Lembrete de Agendamento WhatsApp iniciados (No dia + 30min antes)');
}

module.exports = { iniciar, enfileirarLembretesDoDia, enfileirarLembretes30Min };
