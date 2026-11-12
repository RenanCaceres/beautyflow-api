// Cliente para a API do WAHA (https://waha.devlike.pro)
const BASE = process.env.WAHA_URL || 'http://localhost:3001';
const DEFAULT_SESSION = process.env.WAHA_SESSION || 'default';

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.WAHA_API_KEY) headers['X-Api-Key'] = process.env.WAHA_API_KEY;
  return headers;
}

function resolverSessao(session) {
  const s = String(session || DEFAULT_SESSION).trim();
  if (!s) throw new Error('Sessão WAHA não configurada');
  return s;
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

// "(11) 99999-0000" -> "5511999990000"
function normalizar(tel) {
  let d = String(tel).replace(/\D/g, '').replace(/^0+/, '');
  if (d.length <= 11) d = '55' + d;
  return d;
}

async function statusSessao(session) {
  const sName = resolverSessao(session);
  const s = await req(`/api/sessions/${encodeURIComponent(sName)}`);
  return s.status; // WORKING = conectado
}

async function reiniciarSessao(session) {
  const sName = resolverSessao(session);
  const enc = encodeURIComponent(sName);
  try {
    await req(`/api/sessions/${enc}/stop`, { method: 'POST' });
  } catch {}
  await sleep(1500);
  try {
    await req(`/api/sessions/${enc}`, {
      method: 'PUT',
      body: JSON.stringify({ name: sName, config: { noweb: { markOnline: false } } }),
    });
  } catch {
    try {
      await req(`/api/sessions/${enc}/start`, { method: 'POST' });
    } catch (e) {
      console.error(`Erro ao reiniciar sessão WAHA ${sName}:`, e.message);
    }
  }
}

// Confirma que o número tem WhatsApp e devolve o chatId certo
// (resolve o problema do 9º dígito dos números antigos no Brasil)
async function resolverChatId(tel, session) {
  const sName = resolverSessao(session);
  const n = normalizar(tel);
  const r = await req(`/api/contacts/check-exists?phone=${n}&session=${encodeURIComponent(sName)}`);
  if (!r.numberExists) throw new Error('Número sem WhatsApp');
  return r.chatId;
}

async function enviarTexto(tel, texto, session) {
  const sName = resolverSessao(session);
  const chatId = await resolverChatId(tel, sName);
  const body = (extra) => JSON.stringify({ session: sName, chatId, ...extra });

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

module.exports = { statusSessao, reiniciarSessao, enviarTexto, normalizar };
