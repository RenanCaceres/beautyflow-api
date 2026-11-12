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

async function enfileirarRetornosParaUsuario(usuario, { filtro = null, clienteIds = null } = {}) {
  const usuarioId = usuario.id;
  const ehAutomatico = !filtro && (!Array.isArray(clienteIds) || clienteIds.length === 0);

  if (ehAutomatico) {
    const diaBloqueado = await query(
      `SELECT motivo FROM dias_indisponiveis
       WHERE usuario_id = $1
         AND data = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
       LIMIT 1`,
      [usuarioId]
    ).catch(() => ({ rowCount: 0 }));

    if (diaBloqueado.rowCount > 0) {
      console.log(
        `✿ [Retorno WAHA | Usuário #${usuarioId}] Hoje indisponível (${diaBloqueado.rows[0].motivo}). Disparo automático pulado.`
      );
      return { enfileiradas: 0, ignoradas: 0, totalAnalisadas: 0, diaIndisponivel: true };
    }
  }

  const [bloqueados, agendadasFuturo] = await Promise.all([
    query(`SELECT id FROM clientes WHERE usuario_id = $1 AND aceita_whatsapp = FALSE`, [usuarioId]),
    query(
      `SELECT DISTINCT cliente_id
       FROM agendamentos
       WHERE usuario_id = $1
         AND status = 'agendado'
         AND data_hora::date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`,
      [usuarioId]
    ),
  ]);

  const naoQuer = new Set(bloqueados.rows.map((r) => r.id));
  const jaTemAgendamentoFuturo = new Set(agendadasFuturo.rows.map((r) => r.cliente_id));

  const lista = await listar(usuarioId, filtro || 'todas');
  let candidatos = lista.filter((row) => !jaTemAgendamentoFuturo.has(row.id));

  if (Array.isArray(clienteIds) && clienteIds.length > 0) {
    const idsSet = new Set(clienteIds.map(Number));
    candidatos = candidatos.filter((row) => idsSet.has(row.id));
  } else if (!filtro) {
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

    const existente = await query(
      `SELECT 1 FROM mensagens_whatsapp
       WHERE usuario_id = $1 AND cliente_id = $2 AND tipo = 'retorno' AND referencia = $3
       LIMIT 1`,
      [usuarioId, row.id, ref]
    );
    if (existente.rowCount > 0) {
      jaEnfileirados++;
      continue;
    }

    const { mensagem } = await gerarMensagemUnicaRetorno({
      usuarioId,
      cidade: usuario,
      nome: row.nome,
      servico: row.servico_nome,
      diasAtraso: row.dias_vencidos || (row.dias_para_retorno < 0 ? Math.abs(row.dias_para_retorno) : 0),
      indiceVariacao: i,
    });

    const statusInicial = ehAutomatico ? 'aprovacao' : 'pendente';

    const r = await query(
      `INSERT INTO mensagens_whatsapp (usuario_id, cliente_id, telefone, tipo, referencia, texto, status)
       VALUES ($1, $2, $3, 'retorno', $4, $5, $6)
       ON CONFLICT (cliente_id, tipo, referencia) DO NOTHING`,
      [usuarioId, row.id, row.telefone, ref, mensagem, statusInicial]
    );
    novos += r.rowCount;
  }

  if (novos > 0 && !ehAutomatico) {
    acordarFila();
  }

  console.log(
    ehAutomatico
      ? `✿ [Retorno WAHA | Usuário #${usuarioId}] ${novos} mensagem(ns) aguardando confirmação | Já existentes: ${jaEnfileirados}`
      : `✿ [Retorno WAHA | Usuário #${usuarioId}] Enfileirados: ${novos} | Já existentes: ${jaEnfileirados}`
  );
  return {
    enfileiradas: novos,
    aguardandoAprovacao: ehAutomatico ? novos : 0,
    ignoradas: jaEnfileirados,
    totalAnalisadas: candidatos.length,
  };
}

/**
 * Se passar `usuarioId`, processa apenas a conta daquele usuário.
 * Se não passar (execução automática do cron), processa todas as contas ativas com sessão WAHA configurada.
 */
async function enfileirarRetornos({ usuarioId = null, filtro = null, clienteIds = null } = {}) {
  if (usuarioId) {
    const r = await query(
      `SELECT id, cidade_nome, cidade_lat, cidade_lon, waha_session FROM usuarios WHERE id = $1`,
      [usuarioId]
    );
    if (r.rowCount === 0) {
      return { enfileiradas: 0, aguardandoAprovacao: 0, ignoradas: 0, totalAnalisadas: 0 };
    }
    return enfileirarRetornosParaUsuario(r.rows[0], { filtro, clienteIds });
  }

  const usuariosRes = await query(
    `SELECT id, cidade_nome, cidade_lat, cidade_lon, waha_session
     FROM usuarios
     WHERE ativo = TRUE AND COALESCE(TRIM(waha_session), '') <> ''
     ORDER BY id ASC`
  );

  const resumo = {
    enfileiradas: 0,
    aguardandoAprovacao: 0,
    ignoradas: 0,
    totalAnalisadas: 0,
  };

  for (const usuario of usuariosRes.rows) {
    try {
      const r = await enfileirarRetornosParaUsuario(usuario, { filtro, clienteIds });
      resumo.enfileiradas += r.enfileiradas || 0;
      resumo.aguardandoAprovacao += r.aguardandoAprovacao || 0;
      resumo.ignoradas += r.ignoradas || 0;
      resumo.totalAnalisadas += r.totalAnalisadas || 0;
    } catch (err) {
      console.error(`Erro no retorno automático do usuário #${usuario.id}:`, err.message);
    }
  }

  return resumo;
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
