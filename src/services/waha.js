// Cliente para a API do WAHA (https://waha.devlike.pro)
const BASE    = process.env.WAHA_URL     || 'http://localhost:3001';
const SESSION = process.env.WAHA_SESSION || 'default';

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.WAHA_API_KEY) headers['X-Api-Key'] = process.env.WAHA_API_KEY;
  return headers;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(path, opts = {}) {
  const r = await fetch(BASE + path, {
    ...opts,
    headers: { ...getHeaders(), ...(opts.headers || {}) },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`WAHA ${r.status}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

// "(43) 9 9123-4567" -> "5543991234567"
function normalizar(tel) {
  let d = String(tel).replace(/\D/g, '').replace(/^0+/, '');
  if (d.length <= 11) d = '55' + d;
  return d;
}

async function statusSessao() {
  const s = await req(`/api/sessions/${SESSION}`);
  return s.status; // WORKING = conectado
}

// Confirma que o número tem WhatsApp e devolve o chatId certo
// (resolve o problema do 9º dígito dos números antigos no Brasil)
async function resolverChatId(tel) {
  const n = normalizar(tel);
  const r = await req(`/api/contacts/check-exists?phone=${n}&session=${SESSION}`);
  if (!r.numberExists) throw new Error('Número sem WhatsApp');
  return r.chatId;
}

async function enviarTexto(tel, texto) {
  const chatId = await resolverChatId(tel);
  const body = (extra) => JSON.stringify({ session: SESSION, chatId, ...extra });

  // Simula "digitando..." por 2 a 5 segundos para parecer humano e reduzir risco de banimento
  try {
    await req('/api/startTyping', { method: 'POST', body: body() });
    await sleep(2000 + Math.random() * 3000);
    await req('/api/stopTyping', { method: 'POST', body: body() });
  } catch {
    // Se a engine do WAHA não suportar typing indicator, segue normalmente para o envio
  }

  return req('/api/sendText', { method: 'POST', body: body({ text: texto }) });
}

module.exports = { statusSessao, enviarTexto, normalizar };
