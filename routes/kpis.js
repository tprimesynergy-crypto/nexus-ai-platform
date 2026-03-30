/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS AI PLATFORM — Routes: KPIs & Dashboard
 * TANGER NEXUS 2026 | Prime Synergy Group
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

const PROJECT_ID = process.env.PROJECT_ID || 'TNG-NEXUS-2026';

// Objectifs TANGER NEXUS 2026
const OBJECTIVES = {
  cibles_identifiees: 500,
  fiches_creees: 300,
  emails_envoyes: 250,
  rdv_obtenus: 50,
  sponsors_confirmes: 15,
  exposants_confirmes: 80,
  revenus_objectif: 2500000, // 2.5M MAD
  j_avant_evenement: null // calculé dynamiquement
};

// ── GET /api/kpis — KPIs actuels ─────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const deadline = new Date('2026-10-21');
  const jAvant = Math.max(0, Math.ceil((deadline - new Date()) / (1000 * 60 * 60 * 24)));
  OBJECTIVES.j_avant_evenement = jAvant;

  if (db) {
    try {
      const result = await db.query('SELECT * FROM vw_kpis WHERE project_id = $1', [PROJECT_ID]);
      const kpis = result.rows[0] || {};

      // KPIs additionnels
      const runsResult = await db.query(
        `SELECT workflow_id, COUNT(*) as count,
         SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as success
         FROM run_logs GROUP BY workflow_id`
      );

      return res.json({
        success: true,
        kpis: {
          ...kpis,
          j_avant_evenement: jAvant,
          workflow_stats: runsResult.rows
        },
        objectives: OBJECTIVES,
        progress: computeProgress(kpis, OBJECTIVES),
        last_updated: new Date().toISOString()
      });
    } catch (err) {
      console.error('KPI query error:', err.message);
    }
  }

  // Fallback mémoire
  const kpis = req.app.locals.store?.kpis || {};
  res.json({
    success: true,
    kpis: { ...kpis, j_avant_evenement: jAvant },
    objectives: OBJECTIVES,
    progress: computeProgress(kpis, OBJECTIVES),
    last_updated: new Date().toISOString()
  });
}));

// ── POST /api/kpis/update — Mise à jour manuelle ─────────────
router.post('/update', asyncHandler(async (req, res) => {
  const updates = req.body;

  if (!req.app.locals.store) req.app.locals.store = {};
  req.app.locals.store.kpis = {
    ...(req.app.locals.store.kpis || {}),
    ...updates,
    last_updated: new Date().toISOString()
  };

  const wss = req.app.locals.wss;
  if (wss) {
    const msg = JSON.stringify({ type: 'kpis_updated', kpis: req.app.locals.store.kpis });
    wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
  }

  res.json({ success: true, kpis: req.app.locals.store.kpis, message: 'KPIs updated' });
}));

// ── GET /api/kpis/timeline — Évolution dans le temps ─────────
router.get('/timeline', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { days = 30 } = req.query;

  if (db) {
    const result = await db.query(
      `SELECT DATE(started_at) as date,
       workflow_id,
       COUNT(*) as runs,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success
       FROM run_logs
       WHERE started_at > NOW() - INTERVAL '${parseInt(days)} days'
       GROUP BY DATE(started_at), workflow_id
       ORDER BY date DESC`
    );
    return res.json({ success: true, timeline: result.rows });
  }

  res.json({ success: true, timeline: [] });
}));

function computeProgress(kpis, objectives) {
  const fields = ['cibles_identifiees','fiches_creees','emails_envoyes','rdv_obtenus','sponsors_confirmes','exposants_confirmes'];
  const progress = {};
  fields.forEach(f => {
    const val = parseInt(kpis[f] || 0);
    const obj = objectives[f] || 1;
    progress[f] = Math.min(100, Math.round((val / obj) * 100));
  });
  progress.global = Math.round(Object.values(progress).reduce((a, b) => a + b, 0) / fields.length);
  return progress;
}

module.exports = router;
