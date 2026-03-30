/**
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 * NEXUS AI PLATFORM â€” Routes: Workflows (12 Agents IA)
 * TANGER NEXUS 2026 | Prime Synergy Group
 * â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { asyncHandler } = require('../middleware/errorHandler');

// Config des 12 agents
const WORKFLOWS = {
  'WF-01': { name: 'Intake & Qualification', webhook: process.env.WEBHOOK_WF01, category: 'pipeline' },
  'WF-02': { name: 'Context & Brief', webhook: process.env.WEBHOOK_WF02, category: 'research' },
  'WF-03': { name: 'Research & Scoring', webhook: process.env.WEBHOOK_WF03, category: 'research' },
  'WF-04': { name: 'Email PersonnalisÃ©', webhook: process.env.WEBHOOK_WF04, category: 'outreach' },
  'WF-05': { name: 'Newsletter', webhook: process.env.WEBHOOK_WF05, category: 'content' },
  'WF-06': { name: 'Social Media', webhook: process.env.WEBHOOK_WF06, category: 'content' },
  'WF-07': { name: 'Veille StratÃ©gique', webhook: process.env.WEBHOOK_WF07, category: 'research' },
  'WF-08': { name: 'Meeting Prep', webhook: process.env.WEBHOOK_WF08, category: 'pipeline' },
  'WF-09': { name: 'Pipeline Update', webhook: process.env.WEBHOOK_WF09, category: 'pipeline' },
  'WF-10': { name: 'Dashboard KPIs', webhook: process.env.WEBHOOK_WF10, category: 'reporting' },
  'WF-11': { name: 'Archive & Export', webhook: process.env.WEBHOOK_WF11, category: 'reporting' },
  'WF-12': { name: 'Gate Approbation', webhook: process.env.WEBHOOK_WF12, category: 'pipeline' }
};

// â”€â”€ GET /api/workflows â€” Liste tous les agents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/', (req, res) => {
  const workflows = Object.entries(WORKFLOWS).map(([id, wf]) => ({
    id,
    name: wf.name,
    category: wf.category,
    configured: !!wf.webhook,
    status: wf.webhook ? 'ready' : 'demo'
  }));
  res.json({ success: true, workflows, total: workflows.length });
});

// â”€â”€ GET /api/workflows/:wfId â€” DÃ©tail d'un agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/:wfId', (req, res) => {
  const { wfId } = req.params;
  const wf = WORKFLOWS[wfId.toUpperCase()];
  if (!wf) return res.status(404).json({ success: false, error: `Workflow ${wfId} not found` });

  res.json({
    success: true,
    workflow: {
      id: wfId.toUpperCase(),
      ...wf,
      configured: !!wf.webhook
    }
  });
});

// â”€â”€ POST /api/trigger/:wfId â€” DÃ©clencher un agent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/trigger/:wfId', asyncHandler(async (req, res) => {
  const { wfId } = req.params;
  const wfKey = wfId.toUpperCase();
  const wf = WORKFLOWS[wfKey];

  if (!wf) {
    return res.status(404).json({ success: false, error: `Workflow ${wfId} not found` });
  }

  const runId = `run-${wfKey}-${Date.now()}`;
  const payload = { ...req.body, runId, triggeredAt: new Date().toISOString(), wfId: wfKey };

  // Enregistrer le run
  const db = req.app.locals.db;
  if (db) {
    await db.query(
      `INSERT INTO run_logs (run_id, workflow_id, workflow_name, status, payload, started_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [runId, wfKey, wf.name, 'running', JSON.stringify(payload)]
    ).catch(console.error);
  }

  const run = {
    runId, wfId: wfKey, wfName: wf.name,
    status: 'running', payload, startedAt: new Date().toISOString()
  };

  if (!req.app.locals.store) req.app.locals.store = {};
  if (!req.app.locals.store.runs) req.app.locals.store.runs = [];
  req.app.locals.store.runs.unshift(run);

  // Broadcast WebSocket
  const wss = req.app.locals.wss;
  if (wss) {
    const msg = JSON.stringify({ type: 'run_started', run });
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(msg);
    });
  }

  // DÃ©clencher le webhook n8n
  if (!wf.webhook) {
    // Mode dÃ©mo â€” simuler rÃ©sultat
    setTimeout(() => {
      run.status = 'completed';
      run.result = { demo: true, message: `[DEMO] ${wf.name} simulÃ© avec succÃ¨s` };
      run.completedAt = new Date().toISOString();
      if (wss) {
        const msg = JSON.stringify({ type: 'run_completed', run });
        wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
      }
    }, 2000 + Math.random() * 3000);

    return res.json({ success: true, runId, status: 'running', mode: 'demo', message: `[DEMO] ${wf.name} en cours...` });
  }

  // Appel rÃ©el Ã  n8n
  try {
    const response = await fetch(wf.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 5000
    });

    const n8nResult = await response.json().catch(async () => ({ raw: await response.text() }));

    res.json({
      success: true, runId, status: 'triggered',
      n8nStatus: response.status,
      message: `${wf.name} dÃ©clenchÃ© â†’ n8n`
    });
  } catch (err) {
    run.status = 'error';
    run.error = err.message;
    res.json({
      success: false, runId, status: 'error',
      error: `n8n unreachable: ${err.message}`,
      hint: 'Check N8N_BASE_URL in .env'
    });
  }
}));

// â”€â”€ GET /api/runs â€” Historique exÃ©cutions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/runs/history', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { wfId, status, limit = 50 } = req.query;

  if (db) {
    let query = 'SELECT * FROM run_logs WHERE 1=1';
    const params = [];
    let idx = 1;
    if (wfId) { query += ` AND workflow_id = $${idx++}`; params.push(wfId.toUpperCase()); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    query += ` ORDER BY started_at DESC LIMIT $${idx}`;
    params.push(parseInt(limit));
    const result = await db.query(query, params);
    return res.json({ success: true, runs: result.rows, total: result.rowCount });
  }

  let runs = req.app.locals.store?.runs || [];
  if (wfId) runs = runs.filter(r => r.wfId === wfId.toUpperCase());
  if (status) runs = runs.filter(r => r.status === status);
  res.json({ success: true, runs: runs.slice(0, parseInt(limit)), total: runs.length });
}));

// â”€â”€ POST /api/callback/:runId â€” RÃ©sultat n8n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.post('/callback/:runId', asyncHandler(async (req, res) => {
  const { runId } = req.params;
  const { status, result, error } = req.body;

  const db = req.app.locals.db;
  if (db) {
    await db.query(
      `UPDATE run_logs SET status = $2, result = $3, error = $4, completed_at = NOW(),
       duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000
       WHERE run_id = $1`,
      [runId, status, JSON.stringify(result), error]
    ).catch(console.error);
  }

  const runs = req.app.locals.store?.runs || [];
  const run = runs.find(r => r.runId === runId);
  if (run) {
    run.status = status;
    run.result = result;
    run.error = error;
    run.completedAt = new Date().toISOString();
  }

  const wss = req.app.locals.wss;
  if (wss) {
    const msg = JSON.stringify({ type: 'run_completed', runId, status, result, error });
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
  }

  res.json({ success: true, runId, status });
}));

module.exports = router;

