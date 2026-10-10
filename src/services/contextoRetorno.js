const { GoogleGenAI } = require('@google/genai');

let aiInstance = null;
function getAI() {
  if (!aiInstance) aiInstance = new GoogleGenAI({});
  return aiInstance;
}
const MODELO_PADRAO = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

const CIDADE_NOME = process.env.CIDADE_NOME || 'Cornélio Procópio - PR';
const CIDADE_LAT  = process.env.CIDADE_LAT  || '-23.1811';
const CIDADE_LON  = process.env.CIDADE_LON  || '-50.6469';

// Cache de clima por 30 minutos para evitar chamadas repetidas em disparos em lote
let cacheClima = { ts: 0, texto: null };

function traduzirWeatherCode(code, temp) {
  let condicao = 'tempo agradável';
  if (code === 0) condicao = 'céu limpo e ensolarado';
  else if ([1, 2].includes(code)) condicao = 'sol entre poucas nuvens';
  else if (code === 3) condicao = 'tempo nublado';
  else if ([45, 48].includes(code)) condicao = 'tempo com neblina';
  else if (code >= 51 && code <= 67) condicao = 'tempo chuvoso/garoa';
  else if (code >= 80 && code <= 82) condicao = 'pancadas de chuva';
  else if (code >= 95) condicao = 'chuva forte com trovoadas';

  let sensacao = 'ameno';
  if (temp >= 29) sensacao = 'bem quente';
  else if (temp >= 24) sensacao = 'quentinho e agradável';
  else if (temp <= 15) sensacao = 'friozinho';
  else if (temp <= 19) sensacao = 'fresquinho';

  return `${Math.round(temp)}°C (${sensacao}, ${condicao})`;
}

async function obterClimaCidade() {
  const agora = Date.now();
  if (cacheClima.texto && agora - cacheClima.ts < 30 * 60 * 1000) {
    return cacheClima.texto;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${CIDADE_LAT}&longitude=${CIDADE_LON}` +
      `&current=temperature_2m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&timezone=America%2FSao_Paulo&forecast_days=1`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const tempAtual = data?.current?.temperature_2m;
    const code      = data?.current?.weather_code ?? 0;
    const max       = data?.daily?.temperature_2m_max?.[0];
    const min       = data?.daily?.temperature_2m_min?.[0];
    const chuvaProb = data?.daily?.precipitation_probability_max?.[0];

    const resumoAtual = traduzirWeatherCode(code, tempAtual ?? 24);
    const detalhesDia =
      min != null && max != null
        ? `, mínima de ${Math.round(min)}°C e máxima de ${Math.round(max)}°C` +
          (chuvaProb != null && chuvaProb >= 40 ? `, ${chuvaProb}% de chance de chuva` : '')
        : '';

    const texto = `${CIDADE_NOME}: ${resumoAtual}${detalhesDia}`;
    cacheClima = { ts: agora, texto };
    return texto;
  } catch (e) {
    return `${CIDADE_NOME} (clima não consultado no momento)`;
  } finally {
    clearTimeout(timer);
  }
}

function obterDataBrasil() {
  const str = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  return new Date(str);
}

function obterMomentoSemana(data = obterDataBrasil()) {
  const diasNomes = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
  ];
  const dow = data.getDay();
  const diaNome = diasNomes[dow];

  let periodo = 'meio de semana';
  if (dow === 1 || dow === 2) periodo = 'início de semana';
  else if (dow === 3 || dow === 4) periodo = 'meio de semana';
  else periodo = 'fim de semana';

  return { diaNome, periodo, descricao: `${diaNome} (${periodo})` };
}

function nEsimoDiaSemanaMes(ano, mesZeroBased, diaSemana, n) {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(ano, mesZeroBased, d);
    if (dt.getMonth() !== mesZeroBased) break;
    if (dt.getDay() === diaSemana) {
      count++;
      if (count === n) return d;
    }
  }
  return null;
}

function obterDatasComemorativasProximas(data = obterDataBrasil()) {
  const ano = data.getFullYear();
  const datasFixas = [
    { mes: 1,  dia: 1,  nome: 'Ano Novo' },
    { mes: 3,  dia: 8,  nome: 'Dia Internacional da Mulher' },
    { mes: 4,  dia: 21, nome: 'Feriado de Tiradentes' },
    { mes: 5,  dia: 1,  nome: 'Dia do Trabalhador' },
    { mes: 6,  dia: 12, nome: 'Dia dos Namorados' },
    { mes: 6,  dia: 24, nome: 'São João / Festas Juninas' },
    { mes: 7,  dia: 20, nome: 'Dia do Amigo' },
    { mes: 9,  dia: 7,  nome: 'Feriado da Independência' },
    { mes: 9,  dia: 15, nome: 'Dia do Cliente' },
    { mes: 9,  dia: 22, nome: 'Início da Primavera' },
    { mes: 10, dia: 12, nome: 'Feriado de 12 de Outubro (Nossa Sra. Aparecida / Dia das Crianças)' },
    { mes: 10, dia: 31, nome: 'Halloween' },
    { mes: 11, dia: 2,  nome: 'Feriado de Finados' },
    { mes: 11, dia: 15, nome: 'Feriado da Proclamação da República' },
    { mes: 11, dia: 20, nome: 'Feriado da Consciência Negra' },
    { mes: 12, dia: 24, nome: 'Véspera de Natal' },
    { mes: 12, dia: 25, nome: 'Natal' },
    { mes: 12, dia: 31, nome: 'Réveillon / Virada de Ano' },
  ];

  // Datas móveis importantes para salão
  const diaMaes = nEsimoDiaSemanaMes(ano, 4, 0, 2); // 2º domingo de maio
  if (diaMaes) datasFixas.push({ mes: 5, dia: diaMaes, nome: 'Dia das Mães' });

  const diaPais = nEsimoDiaSemanaMes(ano, 7, 0, 2); // 2º domingo de agosto
  if (diaPais) datasFixas.push({ mes: 8, dia: diaPais, nome: 'Dia dos Pais' });

  const blackFriday = nEsimoDiaSemanaMes(ano, 10, 5, 4); // 4ª sexta de novembro
  if (blackFriday) datasFixas.push({ mes: 11, dia: blackFriday, nome: 'Black Friday' });

  const hojeMeiaNoite = new Date(ano, data.getMonth(), data.getDate());
  const encontradas = [];

  for (const item of datasFixas) {
    const dtEvento = new Date(ano, item.mes - 1, item.dia);
    const diffDias = Math.round((dtEvento - hojeMeiaNoite) / (1000 * 60 * 60 * 24));
    if (diffDias === 0) {
      encontradas.push(`Hoje é ${item.nome}`);
    } else if (diffDias === 1) {
      encontradas.push(`Amanhã é ${item.nome}`);
    } else if (diffDias > 1 && diffDias <= 7) {
      encontradas.push(`${item.nome} está chegando (daqui a ${diffDias} dias)`);
    }
  }

  // Temas mensais sazonais
  const mesAtual = data.getMonth() + 1;
  if (mesAtual === 10 && encontradas.length === 0) {
    encontradas.push('Mês do Outubro Rosa (cuidado e autoestima feminina)');
  } else if (mesAtual === 12 && encontradas.length === 0) {
    encontradas.push('Clima de festas de fim de ano');
  }

  return encontradas.length > 0 ? encontradas.join('; ') : 'Nenhuma data comemorativa imediata nos próximos dias';
}

async function montarContextoDia() {
  const data = obterDataBrasil();
  const clima = await obterClimaCidade();
  const semana = obterMomentoSemana(data);
  const datasComemorativas = obterDatasComemorativasProximas(data);

  return {
    clima,
    diaSemana: semana.descricao,
    periodoSemana: semana.periodo,
    datasComemorativas,
  };
}

const ANGULOS_CRIATIVOS = [
  'Comece comentando de forma leve sobre o clima de hoje na cidade e conecte com o cuidado pessoal.',
  'Comece mencionando o momento da semana (início, meio ou fim de semana) como um ótimo pretexto para se cuidar.',
  'Se houver data comemorativa ou feriado próximo, use isso como gancho principal; caso contrário, combine o dia da semana com o clima.',
  'Use um tom bem acolhedor de quem lembrou da cliente com carinho hoje, citando sutilmente o dia da semana ou o tempo lá fora.',
  'Destaque como é bom tirar uma pausa na rotina desta semana (mencionando o clima ou o dia) para renovar o procedimento.',
];

async function gerarConteudoGemini(prompt) {
  const ai = getAI();
  try {
    const r = await ai.models.generateContent({ model: MODELO_PADRAO, contents: prompt });
    return r.text.trim();
  } catch (e) {
    // Fallback para gemini-2.5-flash se o modelo padrão falhar
    if (MODELO_PADRAO !== 'gemini-2.5-flash') {
      const r2 = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      return r2.text.trim();
    }
    throw e;
  }
}

/**
 * Gera uma mensagem única de retorno no Gemini usando:
 * - Nome da cliente registrado na agenda
 * - Serviço mais vencido (e dias de atraso)
 * - Clima atual da cidade
 * - Datas comemorativas próximas
 * - Momento da semana (início / meio / fim de semana)
 */
async function gerarMensagemUnicaRetorno({ nome, servico, diasAtraso = 0, indiceVariacao = null }) {
  const ctx = await montarContextoDia();
  const nomeAgenda = String(nome || '').trim();
  const primeiroNome = nomeAgenda.split(' ')[0] || nomeAgenda;

  const idx =
    indiceVariacao != null
      ? indiceVariacao % ANGULOS_CRIATIVOS.length
      : Math.floor(Math.random() * ANGULOS_CRIATIVOS.length);
  const angulo = ANGULOS_CRIATIVOS[idx];
  const sementeAleatoria = Math.floor(1000 + Math.random() * 9000);

  const situacaoPrazo =
    diasAtraso > 0
      ? `venceu há ${diasAtraso} dia(s)`
      : 'vence exatamente hoje';

  const prompt = `
Você é o assistente de relacionamento de um salão de beleza e estética.
Gere uma mensagem ÚNICA, autêntica e acolhedora para enviar no WhatsApp de uma cliente cujo retorno de procedimento está no prazo ou vencido.

DADOS DA CLIENTE NA AGENDA:
- Nome registrado na agenda: ${nomeAgenda} (pode chamá-la por "${nomeAgenda}" ou "${primeiroNome}", mas o nome DEVE aparecer na mensagem)
- Serviço vencido / para retornar: ${servico} (${situacaoPrazo})

CONTEXTO REAL DE HOJE:
- Clima na cidade: ${ctx.clima}
- Momento da semana: ${ctx.diaSemana}
- Datas comemorativas / feriados próximos: ${ctx.datasComemorativas}

DIRETRIZ DE VARIAÇÃO ÚNICA (ID #${sementeAleatoria}):
- ${angulo}

REGRAS OBRIGATÓRIAS:
1. Inclua obrigatoriamente o nome da cliente ("${primeiroNome}" ou "${nomeAgenda}") logo na saudação.
2. Mencione de forma natural pelo menos um elemento do contexto de hoje (o clima na cidade, o momento da semana ou a data comemorativa próxima) conectado ao retorno de "${servico}".
3. Seja breve: no máximo 3 frases curtas.
4. Tom caloroso, humano e simpático (nunca pareça mensagem automática/robótica nem spam).
5. Use no máximo 1 ou 2 emojis.
6. NÃO invente descontos, promoções ou preços.
7. Termine convidando-a para escolher um horário na agenda.
8. Responda APENAS com o texto final da mensagem, sem aspas e sem explicações.
`.trim();

  try {
    let mensagem = await gerarConteudoGemini(prompt);
    mensagem = mensagem.replace(/^["']|["']$/g, '').trim();

    // Garante que o nome da cliente registrado na agenda esteja na mensagem
    if (
      !mensagem.toLowerCase().includes(primeiroNome.toLowerCase()) &&
      !mensagem.toLowerCase().includes(nomeAgenda.toLowerCase())
    ) {
      mensagem = `Oi, ${nomeAgenda}! ${mensagem}`;
    }

    return { mensagem, contexto: ctx };
  } catch (err) {
    console.error('Erro ao gerar mensagem única no Gemini, usando fallback contextual:', err.message);
    const msgFallback =
      `Oi, ${nomeAgenda}! Tudo bem? Nesse ${ctx.periodoSemana}, passei para lembrar que já deu o prazo do seu retorno de ${servico} ✨ ` +
      `Que tal separarmos um horário na agenda para você se cuidar?`;
    return { mensagem: msgFallback, contexto: ctx, fallback: true };
  }
}

module.exports = {
  obterClimaCidade,
  obterMomentoSemana,
  obterDatasComemorativasProximas,
  montarContextoDia,
  gerarMensagemUnicaRetorno,
};
