// Todo dia às 10h (horário de Brasília) enfileira lembretes únicos de retorno vencido/do dia
const cron = require('node-cron');
const { query } = require('../database');
const { listar } = require('../models/Retorno');
const { gerarMensagemUnicaRetorno } = require('../services/contextoRetorno');
const { acordarFila } = require('../services/filaWhatsapp');

const MAX_ATRASO = Number(process.env.WA_RETORNO_MAX_ATRASO_DIAS || 7);
const CRON_HORARIO = process.env.WA_RETORNO_CRON || '0 10 * * *';

function montarReferencia(servicoId, ultimoAtendimento) {
  const dataIso = new Date(ultimoAtendimento).toISOString().slice(0, 10);
  return `srv${servicoId || 0}-${dataIso}`;
}

/**
 * Enfileira mensagens únicas geradas pelo Gemini (com clima, datas comemorativas
 * e momento da semana) para clientes com retorno vencendo no dia ou em atraso.
 */
async function enfileirarRetornos({ filtro = null, clienteIds = null } = {}) {
  const ehAutomatico = !filtro && (!Array.isArray(clienteIds) || clienteIds.length === 0);

  if (ehAutomatico) {
    // Se hoje estiver marcado como dia indisponível / folga, não dispara retorno automático hoje
    const diaBloqueado = await query(`
      SELECT motivo FROM dias_indisponiveis
      WHERE data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
      LIMIT 1
    `).catch(() => ({ rowCount: 0 }));

    if (diaBloqueado.rowCount > 0) {
      console.log(`✿ [Retorno WAHA] Hoje está marcado como indisponível (${diaBloqueado.rows[0].motivo}). Disparo automático pulado.`);
      return { enfileiradas: 0, ignoradas: 0, totalAnalisadas: 0, diaIndisponivel: true };
    }
  }

  const [bloqueados, agendadasFuturo] = await Promise.all([
    query(`SELECT id FROM clientes WHERE aceita_whatsapp = FALSE`),
    query(`
      SELECT DISTINCT cliente_id
      FROM agendamentos
      WHERE status = 'agendado'
        AND data_hora::date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
    `),
  ]);

  const naoQuer = new Set(bloqueados.rows.map((r) => r.id));
  const jaTemAgendamentoFuturo = new Set(agendadasFuturo.rows.map((r) => r.cliente_id));

  const lista = await listar(filtro || 'todas');
  let candidatos = lista.filter((row) => !jaTemAgendamentoFuturo.has(row.id));

  if (Array.isArray(clienteIds) && clienteIds.length > 0) {
    const idsSet = new Set(clienteIds.map(Number));
    candidatos = candidatos.filter((row) => idsSet.has(row.id));
  } else if (!filtro) {
    // Execução automática diária: foca em quem vence hoje (0) ou venceu recentemente (até MAX_ATRASO dias)
    candidatos = candidatos.filter(
      (row) => row.dias_para_retorno <= 0 && row.dias_para_retorno >= -MAX_ATRASO
    );
  }

  let novos = 0;
  let jaEnfileirados = 0;

  for (let i = 0; i < candidatos.length; i++) {
    const row = candidatos[i];
    if (naoQuer.has(row.id) || jaTemAgendamentoFuturo.has(row.id)) continue;

    const ref = montarReferencia(row.servico_id, row.ultimo_atendimento);

    // Verifica se já foi gerada/enfileirada mensagem para este atendimento
    const existente = await query(
      `SELECT 1 FROM mensagens_whatsapp WHERE cliente_id=$1 AND tipo='retorno' AND referencia=$2 LIMIT 1`,
      [row.id, ref]
    );
    if (existente.rowCount > 0) {
      jaEnfileirados++;
      continue;
    }

    // Gera mensagem única no Gemini considerando clima da cidade, datas comemorativas, dia da semana e disponibilidade da agenda
    const { mensagem } = await gerarMensagemUnicaRetorno({
      nome: row.nome,
      servico: row.servico_nome,
      diasAtraso: row.dias_vencidos || (row.dias_para_retorno < 0 ? Math.abs(row.dias_para_retorno) : 0),
      indiceVariacao: i,
    });

    const statusInicial = ehAutomatico ? 'aprovacao' : 'pendente';

    const r = await query(
      `INSERT INTO mensagens_whatsapp (cliente_id, telefone, tipo, referencia, texto, status)
       VALUES ($1, $2, 'retorno', $3, $4, $5)
       ON CONFLICT (cliente_id, tipo, referencia) DO NOTHING`,
      [row.id, row.telefone, ref, mensagem, statusInicial]
    );
    novos += r.rowCount;
  }

  if (novos > 0 && !ehAutomatico) {
    acordarFila();
  }

  console.log(
    ehAutomatico
      ? `✿ [Retorno WAHA] ${novos} mensagem(ns) preparada(s) aguardando confirmação no app | Já existentes: ${jaEnfileirados}`
      : `✿ [Retorno WAHA] Enfileirados: ${novos} | Já enviados/na fila: ${jaEnfileirados}`
  );
  return {
    enfileiradas: novos,
    aguardandoAprovacao: ehAutomatico ? novos : 0,
    ignoradas: jaEnfileirados,
    totalAnalisadas: candidatos.length,
  };
}

function iniciar() {
  cron.schedule(
    CRON_HORARIO,
    () => enfileirarRetornos().catch((err) => console.error('Erro no cron de retorno:', err)),
    { timezone: 'America/Sao_Paulo' }
  );
  console.log(`✿ Job de Retorno Automático agendado (${CRON_HORARIO} - America/Sao_Paulo)`);
}

module.exports = { iniciar, enfileirarRetornos, montarReferencia };
