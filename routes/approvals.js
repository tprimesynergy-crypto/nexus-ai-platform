/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS AI PLATFORM — Routes: Approvals (Gate WF-12)
 * TANGER NEXUS 2026 | Prime Synergy Group
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { asyncHandler } = require('../middleware/errorHandler');

// ── GET /api/approvals — Liste les livrables en attente ───────
router.get('/', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { status } = req.query;

  if (db) {
    let query = `
      SELECT d.*, a.action, a.comment, a.decided_at, a.decided_by
      FROM deliverables d
      LEFT JOIN approvals a ON a.deliverable_id = d.id
      WHERE 1=1`;
    const params = [];
    if (status) { query += ` AND d.status = $1`; params.push(status); }
    query += ` ORDER BY d.created_at DESC`;

    const result = await db.query(query, params);
    return res.json({ success: true, deliverables: result.rows });
  }

  res.json({ success: true, deliverables: [], message: 'Database not connected — demo mode' });
}));

// ── GET /api/approvals/pending — Livrables à approuver ───────
router.get('/pending', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;

  if (db) {
    const result = await db.query(
      `SELECT * FROM deliverables WHERE status = 'pending_review' ORDER BY created_at DESC`
    );
    return res.json({ success: true, pending: result.rows, count: result.rowCount });
  }

  res.json({ success: true, pending: [], count: 0 });
}));

// ── POST /api/approvals/:deliverableId/decide — Approuver/Rejeter
router.post('/:deliverableId/decide', asyncHandler(async (req, res) => {
  const { deliverableId } = req.params;
  const { action, comment, decided_by } = req.body;

  if (!['approved', 'rejected'].includes(action)) {
    return res.status(400).json({ success: false, error: 'action must be: approved | rejected' });
  }

  const decider = decided_by || process.env.ADMIN_EMAIL || 't.primesynergy@gmail.com';
  const db = req.app.locals.db;

  if (db) {
    // Mettre à jour le statut du livrable
    const newStatus = action === 'approved' ? 'approved' : 'rejected';
    await db.query(
      `UPDATE deliverables SET status = $2, approved_by = $3, approved_at = NOW(),
       rejection_reason = $4 WHERE id = $1`,
      [deliverableId, newStatus,
       action === 'approved' ? decider : null,
       action === 'rejected' ? comment : null]
    );

    // Enregistrer la décision
    await db.query(
      `INSERT INTO approvals (deliverable_id, action, comment, decided_by, decided_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [deliverableId, action, comment, decider]
    );

    // Si approuvé → déclencher WF-12 pour action suivante
    if (action === 'approved') {
      const deliverable = await db.query('SELECT * FROM deliverables WHERE id = $1', [deliverableId]);
      const webhookUrl = process.env.WEBHOOK_WF12;
      if (webhookUrl && deliverable.rows[0]) {
        fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'approved',
            deliverable: deliverable.rows[0],
            decided_by: decider,
            comment
          })
        }).catch(console.error);
      }
    }

    return res.json({ success: true, action, deliverableId, decided_by: decider });
  }

  res.json({ success: true, action, deliverableId, message: 'Decision recorded (demo mode)' });
}));

// ── POST /api/approvals/submit — Soumettre un livrable ────────
router.post('/submit', asyncHandler(async (req, res) => {
  const { target_id, deliverable_type, file_path, project_id } = req.body;
  const db = req.app.locals.db;

  const id = `DEL-${Date.now()}`;
  const projId = project_id || process.env.PROJECT_ID || 'TNG-NEXUS-2026';

  if (db) {
    const result = await db.query(
      `INSERT INTO deliverables (id, project_id, target_id, deliverable_type, file_path, status)
       VALUES ($1,$2,$3,$4,$5,'pending_review') RETURNING *`,
      [id, projId, target_id, deliverable_type, file_path]
    );

    // Notifier via WebSocket
    const wss = req.app.locals.wss;
    if (wss) {
      const msg = JSON.stringify({ type: 'new_approval', deliverable: result.rows[0] });
      wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
    }

    return res.status(201).json({ success: true, deliverable: result.rows[0] });
  }

  res.status(201).json({ success: true, deliverable: { id, target_id, deliverable_type, file_path, status: 'pending_review' } });
}));

module.exports = router;
