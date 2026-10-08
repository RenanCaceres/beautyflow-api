const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const router = express.Router();

// A chave é lida automaticamente da variável de ambiente GEMINI_API_KEY
const ai = new GoogleGenAI({});
const MODELO = 'gemini-3.1-flash-lite';

// POST /api/marketing/mensagem-retorno
// body: { nome, servico, diasAtraso }
router.post('/mensagem-retorno', async (req, res) => {
  const { nome, servico, diasAtraso } = req.body;

  if (!nome || !servico) {
    return res.status(400).json({ erro: 'nome e servico são obrigatórios' });
  }

  const prompt = `
Você é o assistente de marketing de um salão de beleza. Escreva uma mensagem
curta e simpática pra mandar no WhatsApp de uma cliente que precisa retornar.

Cliente: ${nome}
Último serviço: ${servico}
Dias desde o ideal de retorno: ${diasAtraso ?? 'não informado'}

Regras:
- No máximo 3 frases.
- Tom caloroso, não robótico, sem parecer spam.
- Pode usar 1 emoji, no máximo.
- Não invente promoções, preços ou descontos.
- Termine convidando a cliente a agendar.
`.trim();

  try {
    const resposta = await ai.models.generateContent({ model: MODELO, contents: prompt });
    res.json({ mensagem: resposta.text.trim() });
  } catch (err) {
    console.error('Erro ao gerar mensagem com Gemini:', err);
    res.status(500).json({ erro: 'Falha ao gerar mensagem' });
  }
});

// POST /api/marketing/chat
// body: { mensagens: [{ role: 'user'|'model', texto: '...' }, ...] }
// Chat iterativo pra montar uma mensagem-modelo de campanha (tela Marketing).
const INSTRUCAO_SISTEMA = `
Você ajuda a dona de um salão de beleza a escrever mensagens de marketing
(templates) pra mandar no WhatsApp de várias clientes de uma vez.

Regras importantes:
- A mensagem final SEMPRE deve conter o placeholder exato {{nome}} no lugar
  onde o nome da cliente vai entrar (ex: "Olá {{nome}}, ..."). Nunca use um
  nome de cliente específico, sempre {{nome}}.
- Curta: no máximo 3-4 frases.
- Tom caloroso e natural, nunca robótico ou "corporativo demais".
- No máximo 1 emoji.
- Só mencione promoções, descontos ou datas comemorativas se a usuária pedir
  explicitamente isso na conversa.
- Sempre convide a cliente a agendar no final.
- Responda APENAS com a mensagem pronta, sem explicações antes ou depois,
  sem aspas envolvendo o texto.
- Se a usuária pedir ajustes (mais curto, outro tom, trocar o tema, etc.),
  reescreva a mensagem inteira já com o ajuste, sempre mantendo {{nome}}.
`.trim();

router.post('/chat', async (req, res) => {
  const { mensagens } = req.body;

  if (!Array.isArray(mensagens) || mensagens.length === 0) {
    return res.status(400).json({ erro: 'mensagens é obrigatório e não pode ser vazio' });
  }

  const contents = mensagens.map((m) => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.texto }],
  }));

  try {
    const resposta = await ai.models.generateContent({
      model: MODELO,
      contents,
      config: { systemInstruction: INSTRUCAO_SISTEMA },
    });
    res.json({ resposta: resposta.text.trim() });
  } catch (err) {
    console.error('Erro no chat de marketing com Gemini:', err);
    res.status(500).json({ erro: 'Falha ao gerar resposta' });
  }
});

module.exports = router;
