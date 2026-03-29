/**
 * NEXUS AI PLATFORM — Server
 * Plateforme No-Code de Supervision des Agents IA
 * Prime Synergy Group — TANGER NEXUS 2026
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const axios = require('axios');
const { WebSocketServer } = require('ws');
const http = require('http');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

// ─── WebSocket pour mises à jour temps réel ─────────────────────────────────
const wss = new WebSocketServer({ server });
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
  ws.send(JSON.stringify({ type: 'connected', message: 'Nexus AI Platform connecté' }));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wsClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(msg);
  });
}

// ─── PostgreSQL Pool (optionnel, graceful if no DB) ──────────────────────────
let pool = null;
if (process.env.PG_HOST) {
  pool = new Pool({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
  });
  pool.on('error', (err) => console.warn('PostgreSQL error (non-fatal):', err.message));
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:', process.env.N8N_BASE_URL || '*'],
    },
  },
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/', limiter);

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-Memory Store (used when no PostgreSQL) ───────────────────────────────
const store = {
  runs: [],         // Historique des exécutions workflows
  targets: [],      // Cibles CRM en mémoire
  logs: [],         // Logs d'activité
  kpis: {
    cibles_identifiees: 0,
    fiches_creees: 0,
    emails_envoyes: 0,
    rdv_obtenus: 0,
    sponsors_confirmes: 0,
    exposants_confirmes: 0,
    newsletters_envoyees: 0,
    workflows_actifs: 0
  }
};

// ─── Workflows Configuration ──────────────────────────────────────────────────
const WORKFLOWS = {
  'WF-01': {
    id: 'WF-01', name: 'Intake & Arborescence', category: 'setup',
    description: 'Crée l\'arborescence projet et déclenche WF-02',
    icon: '📁', color: '#6366f1', webhook: process.env.WEBHOOK_WF01,
    fields: [
      { key: 'project_name', label: 'Nom du projet', type: 'text', required: true },
      { key: 'project_type', label: 'Type', type: 'select', options: ['event', 'consulting', 'media'], required: true },
      { key: 'deadline', label: 'Date limite', type: 'date', required: true }
    ]
  },
  'WF-02': {
    id: 'WF-02', name: 'Fiche Contexte Marché', category: 'research',
    description: 'Analyse marché via OpenAI + Gemini (fraîcheur web)',
    icon: '🌍', color: '#8b5cf6', webhook: process.env.WEBHOOK_WF02,
    fields: [
      { key: 'project_name', label: 'Projet', type: 'text', required: true },
      { key: 'goal', label: 'Objectif principal', type: 'textarea', required: true }
    ]
  },
  'WF-03': {
    id: 'WF-03', name: 'Recherche Cible', category: 'research',
    description: 'Fiche cible complète : identité, décideurs, signaux business',
    icon: '🔍', color: '#3b82f6', webhook: process.env.WEBHOOK_WF03,
    fields: [
      { key: 'company_name', label: 'Nom de l\'entreprise', type: 'text', required: true },
      { key: 'website', label: 'Site web', type: 'url', required: false },
      { key: 'sector', label: 'Secteur supposé', type: 'text', required: true },
      { key: 'desired_offer', label: 'Offre envisagée', type: 'select', options: ['Sponsor Platine', 'Sponsor Or', 'Sponsor Argent', 'Exposant', 'Institutionnel', 'Média', 'Speaker'], required: true }
    ]
  },
  'WF-04': {
    id: 'WF-04', name: 'Email Personnalisé', category: 'commercial',
    description: 'Génère email de prospection ultra-personnalisé → Gate WF-12',
    icon: '✉️', color: '#10b981', webhook: process.env.WEBHOOK_WF04,
    fields: [
      { key: 'company_name', label: 'Entreprise cible', type: 'text', required: true },
      { key: 'target_type', label: 'Type de cible', type: 'select', options: ['sponsor', 'exposant', 'institutionnel', 'media', 'speaker'], required: true },
      { key: 'offer_name', label: 'Offre proposée', type: 'text', required: true }
    ]
  },
  'WF-05': {
    id: 'WF-05', name: 'Newsletter Factory', category: 'marketing',
    description: 'Crée newsletter HTML + liste Brevo + template SMTP complet',
    icon: '📧', color: '#f59e0b', webhook: process.env.WEBHOOK_WF05,
    fields: [
      { key: 'segment_name', label: 'Segment cible', type: 'select', options: ['Exposants', 'Sponsors', 'Visiteurs Pro', 'Institutionnels', 'Speakers'], required: true },
      { key: 'campaign_goal', label: 'Objectif campagne', type: 'text', required: true },
      { key: 'offer_name', label: 'Offre mise en avant', type: 'text', required: true }
    ]
  },
  'WF-06': {
    id: 'WF-06', name: 'Pack Social Media', category: 'marketing',
    description: 'Génère posts LinkedIn / Instagram / X à partir d\'un contenu source',
    icon: '📱', color: '#ec4899', webhook: process.env.WEBHOOK_WF06,
    fields: [
      { key: 'source_content', label: 'Contenu source', type: 'textarea', required: true },
      { key: 'platforms', label: 'Plateformes', type: 'select', options: ['LinkedIn', 'Instagram', 'Twitter/X', 'Toutes'], required: true }
    ]
  },
  'WF-07': {
    id: 'WF-07', name: 'Veille Concurrentielle', category: 'intelligence',
    description: 'Digest hebdo automatique — lundi 7h00 (aussi déclenche manuellement)',
    icon: '📡', color: '#06b6d4', webhook: process.env.WEBHOOK_WF07,
    fields: [
      { key: 'keywords', label: 'Mots-clés additionnels', type: 'text', required: false },
      { key: 'focus', label: 'Focus particulier', type: 'text', required: false }
    ]
  },
  'WF-08': {
    id: 'WF-08', name: 'Notes Réunion', category: 'ops',
    description: 'Transforme une note brute en compte rendu actionnable avec actions',
    icon: '📋', color: '#84cc16', webhook: process.env.WEBHOOK_WF08,
    fields: [
      { key: 'meeting_context', label: 'Contexte réunion', type: 'text', required: true },
      { key: 'raw_meeting_note', label: 'Note brute', type: 'textarea', required: true }
    ]
  },
  'WF-09': {
    id: 'WF-09', name: 'Pipeline Commercial', category: 'commercial',
    description: 'Gestion CRM quotidienne : relances J+7 / alertes / follow-up',
    icon: '🎯', color: '#ef4444', webhook: process.env.WEBHOOK_WF09,
    schedule: 'Quotidien 9h00',
    fields: [
      { key: 'force_run', label: 'Forcer l\'exécution', type: 'hidden', value: 'true' }
    ]
  },
  'WF-10': {
    id: 'WF-10', name: 'Dashboard Direction', category: 'reporting',
    description: 'Note hebdomadaire COMEX + KPIs + 5 décisions — lundi 8h00',
    icon: '📊', color: '#7c3aed', webhook: process.env.WEBHOOK_WF10,
    schedule: 'Lundi 8h00',
    fields: [
      { key: 'force_run', label: 'Forcer l\'exécution', type: 'hidden', value: 'true' }
    ]
  },
  'WF-11': {
    id: 'WF-11', name: 'Archivage & Mémoire', category: 'ops',
    description: 'Archive les livrables validés dans la base de connaissance',
    icon: '🗄️', color: '#64748b', webhook: process.env.WEBHOOK_WF11,
    fields: [
      { key: 'target', label: 'Dossier à archiver', type: 'text', required: true }
    ]
  },
  'WF-12': {
    id: 'WF-12', name: 'Gate Validation', category: 'governance',
    description: 'Blocage humain avant tout envoi — approbation requise',
    icon: '🔐', color: '#dc2626', webhook: process.env.WEBHOOK_WF12,
    fields: [
      { key: 'deliverable_id', label: 'ID livrable', type: 'text', required: true },
      { key: 'action', label: 'Action', type: 'select', options: ['approve', 'reject', 'revise'], required: true },
      { key: 'comment', label: 'Commentaire', type: 'textarea', required: false }
    ]
  }
};

// ─── API: Status ──────────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    platform: 'Nexus AI Platform v1.0',
    project: 'TANGER NEXUS 2026',
    status: 'operational',
    n8n_url: process.env.N8N_BASE_URL || 'non configuré',
    db_connected: pool !== null,
    workflows_count: Object.keys(WORKFLOWS).length,
    timestamp: new Date().toISOString()
  });
});

// ─── API: Workflows list ──────────────────────────────────────────────────────
app.get('/api/workflows', (req, res) => {
  const list = Object.values(WORKFLOWS).map(wf => ({
    id: wf.id,
    name: wf.name,
    category: wf.category,
    description: wf.description,
    icon: wf.icon,
    color: wf.color,
    schedule: wf.schedule || null,
    has_webhook: !!wf.webhook,
    fields: wf.fields
  }));
  res.json({ workflows: list, total: list.length });
});

// ─── API: Trigger a workflow ──────────────────────────────────────────────────
app.post('/api/trigger/:wfId', async (req, res) => {
  const { wfId } = req.params;
  const wf = WORKFLOWS[wfId];

  if (!wf) return res.status(404).json({ error: 'Workflow non trouvé', wfId });

  const runId = `RUN-${Date.now()}-${wfId}`;
  const payload = {
    run_id: runId,
    workflow_id: wfId,
    workflow_name: wf.name,
    project_name: 'TANGER NEXUS 2026',
    triggered_by: 'nexus-platform',
    triggered_at: new Date().toISOString(),
    ...req.body
  };

  // Log the trigger
  const logEntry = {
    run_id: runId,
    workflow_id: wfId,
    workflow_name: wf.name,
    status: 'triggered',
    payload: payload,
    started_at: new Date().toISOString(),
    result: null
  };
  store.runs.unshift(logEntry);
  if (store.runs.length > 500) store.runs.pop();

  // Broadcast to WebSocket clients
  broadcast({ type: 'workflow_triggered', data: logEntry });

  // If no webhook configured, simulate
  if (!wf.webhook || wf.webhook.includes('undefined')) {
    logEntry.status = 'demo_mode';
    logEntry.result = { message: 'Mode démo — configurez WEBHOOK_' + wfId.replace('-', '') + ' dans .env' };
    broadcast({ type: 'workflow_result', data: logEntry });
    return res.json({ success: true, run_id: runId, mode: 'demo', message: 'Mode démo actif — webhook non configuré', data: logEntry });
  }

  // Call n8n webhook
  try {
    const n8nResponse = await axios.post(wf.webhook, payload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.N8N_API_KEY && { 'X-N8N-API-KEY': process.env.N8N_API_KEY })
      }
    });

    logEntry.status = 'success';
    logEntry.result = n8nResponse.data;
    logEntry.completed_at = new Date().toISOString();
    broadcast({ type: 'workflow_result', data: logEntry });

    res.json({ success: true, run_id: runId, n8n_response: n8nResponse.data });
  } catch (err) {
    logEntry.status = 'error';
    logEntry.error = err.message;
    logEntry.completed_at = new Date().toISOString();
    broadcast({ type: 'workflow_error', data: logEntry });

    res.status(500).json({ success: false, run_id: runId, error: err.message });
  }
});

// ─── API: Run history ─────────────────────────────────────────────────────────
app.get('/api/runs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ runs: store.runs.slice(0, limit), total: store.runs.length });
});

// ─── API: KPIs ────────────────────────────────────────────────────────────────
app.get('/api/kpis', async (req, res) => {
  let kpis = { ...store.kpis };

  if (pool) {
    try {
      const r = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status != 'lost') AS cibles_identifiees,
          COUNT(*) FILTER (WHERE status = 'contacted') AS emails_envoyes,
          COUNT(*) FILTER (WHERE status = 'meeting_scheduled') AS rdv_obtenus,
          COUNT(*) FILTER (WHERE status = 'won') AS sponsors_confirmes
        FROM targets WHERE project_id = 'TNG-NEXUS-2026'
      `);
      kpis = { ...kpis, ...r.rows[0] };
    } catch (e) { /* graceful */ }
  }

  const objectives = {
    cibles_identifiees: { q2: 100, q3: 300 },
    fiches_creees: { q2: 50, q3: 200 },
    emails_envoyes: { q2: 30, q3: 150 },
    rdv_obtenus: { q2: 8, q3: 30 },
    sponsors_confirmes: { q2: 3, q3: 10 },
    exposants_confirmes: { q2: 15, q3: 50 },
    newsletters_envoyees: { q2: 3, q3: 12 },
    workflows_actifs: { q2: 6, q3: 12 }
  };

  res.json({ kpis, objectives, updated_at: new Date().toISOString() });
});

// ─── API: CRM Targets ─────────────────────────────────────────────────────────
app.get('/api/targets', async (req, res) => {
  if (pool) {
    try {
      const r = await pool.query(`
        SELECT id, company_name, sector, status, priority, offer_type,
               last_contact_date, next_action, created_at
        FROM targets WHERE project_id = 'TNG-NEXUS-2026'
        ORDER BY created_at DESC LIMIT 100
      `);
      return res.json({ targets: r.rows });
    } catch (e) { /* fallback to store */ }
  }
  res.json({ targets: store.targets });
});

app.post('/api/targets', async (req, res) => {
  const target = {
    id: `TGT-${Date.now()}`,
    project_id: 'TNG-NEXUS-2026',
    status: 'identified',
    created_at: new Date().toISOString(),
    ...req.body
  };

  if (pool) {
    try {
      await pool.query(`
        INSERT INTO targets (id, project_id, company_name, sector, status, priority, offer_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [target.id, target.project_id, target.company_name, target.sector, target.status, target.priority, target.offer_type, target.created_at]);
    } catch (e) { /* fallback */ }
  }

  store.targets.unshift(target);
  broadcast({ type: 'target_added', data: target });
  res.json({ success: true, target });
});

app.patch('/api/targets/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (pool) {
    try {
      await pool.query(`UPDATE targets SET status = $1 WHERE id = $2`, [status, id]);
    } catch (e) { /* fallback */ }
  }

  const t = store.targets.find(x => x.id === id);
  if (t) t.status = status;
  broadcast({ type: 'target_updated', data: { id, status } });
  res.json({ success: true, id, status });
});

// ─── API: Update KPIs manually ────────────────────────────────────────────────
app.post('/api/kpis/update', (req, res) => {
  Object.assign(store.kpis, req.body);
  broadcast({ type: 'kpis_updated', data: store.kpis });
  res.json({ success: true, kpis: store.kpis });
});

// ─── API: Receive n8n callbacks ───────────────────────────────────────────────
app.post('/api/callback/:runId', (req, res) => {
  const { runId } = req.params;
  const run = store.runs.find(r => r.run_id === runId);
  if (run) {
    run.status = req.body.status || 'completed';
    run.result = req.body;
    run.completed_at = new Date().toISOString();
    broadcast({ type: 'workflow_completed', data: run });
  }
  res.json({ received: true });
});

// ─── API: Logs ────────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  res.json({ logs: store.logs.slice(0, 100) });
});

// ─── Catch-all: serve index.html ─────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          NEXUS AI PLATFORM — Prime Synergy Group              ║
║          TANGER NEXUS EXPO & SUMMIT 2026                      ║
╠═══════════════════════════════════════════════════════════════╣
║  🚀 Serveur démarré sur http://localhost:${PORT}                 ║
║  🔗 n8n : ${(process.env.N8N_BASE_URL || 'non configuré').padEnd(40)} ║
║  🗄️  BD  : ${(pool ? 'PostgreSQL connecté' : 'Mode mémoire (sans BD)').padEnd(40)} ║
║  📡 WS  : WebSocket actif                                     ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

module.exports = { app, server, broadcast };
