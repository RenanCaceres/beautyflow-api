require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();

// ── CORS ──────────────────────────────────────────────────────
const origens = (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, cb) => {
    // Permite requisições sem origin (app mobile / Postman / Ngrok)
    if (!origin || origens.includes(origin)) return cb(null, true);
    cb(new Error('CORS bloqueado: ' + origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body parser ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, timestamp: new Date() }));

// ── Rotas ─────────────────────────────────────────────────────
app.use('/api/clientes',     require('./routes/clientes'));
app.use('/api/servicos',     require('./routes/servicos'));
app.use('/api/agendamentos', require('./routes/agendamentos'));
app.use('/api/consumo',      require('./routes/consumo'));
app.use('/api/caixa',        require('./routes/caixa'));
app.use('/api/retorno',      require('./routes/retorno'));

// ── Error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ erro: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✿ BeautyFlow API rodando em http://0.0.0.0:${PORT}`);
});
