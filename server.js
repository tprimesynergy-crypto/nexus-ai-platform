/**
 * ═══════════════════════════════════════════════════════════════════════
 *  NEXUS AI PLATFORM — Serveur Principal v2.0
 *  TANGER NEXUS EXPO & SUMMIT 2026 | Prime Synergy Group
 *  Supervision No-Code de 12 Agents IA
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');

// Middleware
const { apiLimiter, triggerLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound }     = require('./middleware/errorHandler');

// Routes
const workflowRoutes  = require('./routes/workflows');
const targetRoutes    = require('./routes/targets');
const campaignRoutes  = require('./routes/campaigns');
const kpiRoutes       = require('./routes/kpis');
const approvalRoutes  = require('./routes/approvals');

// Database
const { connectDB } = require('./config/database');

// ── App Setup ─────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const PORT   = parseInt(process.env.PORT || '3000');

// ── WebSocket Server ──────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`🔌 WS connected: ${ip} (${wss.clients.size} total)`);

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // État initial
  ws.send(JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'Nexus AI Platform — real-time connected'
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch (e) { /* ignore */ }
  });

  ws.on('close', () => console.log(`🔌 WS disconnected (${wss.clients.size} remaining)`));
  ws.on('error', (err) => console.error('WS error:', err.message));
});

// Heartbeat toutes les 30s
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// Broadcast helper
const broadcast = (data) => {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
};

// ── In-memory store (fallback sans DB) ───────────────────────────────────
const store = { runs: [], targets: [], logs: [], kpis: {} };

// ── Middleware Setup ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "ws:", "wss:"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'https://platform.primesynergy.ma'
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/', apiLimiter);

// ── Routes API ────────────────────────────────────────────────────────────

// Health check (public, sans auth)
app.get('/api/status', (req, res) => {
  const uptime = process.uptime();
  res.json({
    success: true,
    platform: 'Nexus AI Platform',
    version: '2.0.0',
    project: 'TANGER NEXUS 2026',
    status: 'operational',
    uptime_seconds: Math.round(uptime),
    uptime_human: formatUptime(uptime),
    websocket_clients: wss.clients.size,
    database: !!app.locals.db,
    n8n_url: process.env.N8N_BASE_URL || 'not configured',
    timestamp: new Date().toISOString(),
    endpoints: {
      workflows: 'GET /api/workflows',
      trigger:   'POST /api/workflows/trigger/:wfId',
      targets:   'GET/POST /api/targets',
      campaigns: 'GET/POST /api/campaigns',
      kpis:      'GET /api/kpis',
      approvals: 'GET /api/approvals'
    }
  });
});

// Trigger agents (rate-limité strict)
app.use('/api/workflows/trigger', triggerLimiter);

// Routes modulaires
app.use('/api/workflows',  workflowRoutes);
app.use('/api/targets',    targetRoutes);
app.use('/api/campaigns',  campaignRoutes);
app.use('/api/kpis',       kpiRoutes);
app.use('/api/approvals',  approvalRoutes);

// Callback n8n (sans auth — appelé par n8n)
app.post('/api/callback/:runId', (req, res) => {
  const { runId } = req.params;
  const { status, result, error } = req.body;

  const run = store.runs.find(r => r.runId === runId);
  if (run) {
    run.status = status;
    run.result = result;
    run.error = error;
    run.completedAt = new Date().toISOString();
  }

  broadcast({ type: 'run_completed', runId, status, result, error });
  res.json({ success: true, runId, status });
});

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Gestionnaires d'erreur
app.use(notFound);
app.use(errorHandler);

// ── Helpers ───────────────────────────────────────────────────────────────
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

// ── Démarrage ─────────────────────────────────────────────────────────────
const start = async () => {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('   NEXUS AI PLATFORM v2.0 — TANGER NEXUS 2026');
  console.log('   Prime Synergy Group | 12 Agents IA No-Code');
  console.log('══════════════════════════════════════════════════════\n');

  // Connexion base de données
  const db = await connectDB();
  if (db) {
    app.locals.db = db;
    console.log('✅ PostgreSQL connecté\n');
  } else {
    console.warn('⚠️  Mode mémoire activé — configurez PG_* dans .env\n');
  }

  // Partager ressources globales avec les routes
  app.locals.store     = store;
  app.locals.wss       = wss;
  app.locals.broadcast = broadcast;

  server.listen(PORT, () => {
    console.log(`🚀 Plateforme démarrée → http://localhost:${PORT}`);
    console.log(`📡 WebSocket         → ws://localhost:${PORT}/ws`);
    console.log(`🔑 API Status        → http://localhost:${PORT}/api/status`);
    console.log(`\n   12 agents IA prêts | Dashboard no-code actif\n`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Arrêt propre en cours...');
    clearInterval(heartbeat);
    wss.close();
    server.close(async () => {
      if (app.locals.db) await app.locals.db.end().catch(() => {});
      console.log('✅ Serveur arrêté');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start().catch(err => {
  console.error('❌ Erreur démarrage:', err.message);
  process.exit(1);
});

module.exports = { app, server, wss, broadcast };
