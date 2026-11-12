process.env.TZ = 'UTC';
require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const { autenticar, exigirAdmin } = require('./middlewares/auth');
const { garantirSchemaSaas } = require('./database/migracaoSaas');

const app = express();

// ── CORS ──────────────────────────────────────────────────────
const origens = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, cb) => {
    // Permite requisições sem origin (app mobile / Postman / Ngrok / mesmo domínio)
    if (!origin || origens.includes(origin)) return cb(null, true);
    cb(new Error('CORS bloqueado: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parser ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check (público) ────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: new Date() }));

// ── Painel Web Administrativo (/admin) ────────────────────────
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

// ── Autenticação ──────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

// ── Rotas administrativas SaaS ────────────────────────────────
app.use('/api/admin/financeiro', autenticar, exigirAdmin, require('./routes/adminFinanceiro'));

// ── Rotas protegidas (isoladas por req.usuarioId) ────────────
app.use('/api/clientes',     autenticar, require('./routes/clientes'));
app.use('/api/servicos',     autenticar, require('./routes/servicos'));
app.use('/api/agendamentos', autenticar, require('./routes/agendamentos'));
app.use('/api/consumo',      autenticar, require('./routes/consumo'));
app.use('/api/caixa',        autenticar, require('./routes/caixa'));
app.use('/api/retorno',      autenticar, require('./routes/retorno'));
app.use('/api/marketing',    autenticar, require('./routes/marketing'));
app.use('/api/whatsapp',     autenticar, require('./routes/whatsapp'));

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ erro: err.message });
});

const PORT = process.env.PORT || 3000;

async function iniciarServidor() {
  try {
    await garantirSchemaSaas();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✿ BeautyFlow API (SaaS Multi-Tenant) rodando em http://0.0.0.0:${PORT}`);
      console.log(`✿ Painel Admin Web disponível em http://0.0.0.0:${PORT}/admin`);
      require('./services/filaWhatsapp').iniciar();
      require('./jobs/retornoAutomatico').iniciar();
      require('./jobs/lembretesAgendamento').iniciar();
    });
  } catch (err) {
    console.error('Erro fatal ao preparar esquema SaaS no banco:', err);
    process.exit(1);
  }
}

iniciarServidor();
