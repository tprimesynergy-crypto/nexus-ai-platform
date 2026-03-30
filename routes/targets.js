/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS AI PLATFORM — Routes: Targets (CRM Pipeline)
 * TANGER NEXUS 2026 | Prime Synergy Group
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');

const PROJECT_ID = process.env.PROJECT_ID || 'TNG-NEXUS-2026';

// ── GET /api/targets — Liste tous les targets ──────────────────
router.get('/', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { status, priority, sector, search } = req.query;

  if (db) {
    let query = `SELECT * FROM targets WHERE project_id = $1`;
    const params = [PROJECT_ID];
    let idx = 2;

    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (priority) { query += ` AND priority = $${idx++}`; params.push(priority); }
    if (sector) { query += ` AND sector = $${idx++}`; params.push(sector); }
    if (search) {
      query += ` AND (company_name ILIKE $${idx} OR contact_name ILIKE $${idx})`;
      params.push(`%${search}%`); idx++;
    }

    query += ` ORDER BY score DESC, updated_at DESC`;

    const result = await db.query(query, params);
    return res.json({ success: true, targets: result.rows, total: result.rowCount });
  }

  // Mode mémoire
  const targets = req.app.locals.store.targets || [];
  res.json({ success: true, targets, total: targets.length });
}));

// ── GET /api/targets/:id — Détail d'un target ─────────────────
router.get('/:id', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  if (db) {
    const result = await db.query(
      'SELECT t.*, d.file_path as research_path FROM targets t LEFT JOIN deliverables d ON d.target_id = t.id AND d.deliverable_type = \'research_sheet\' WHERE t.id = $1',
      [id]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Target not found' });
    return res.json({ success: true, target: result.rows[0] });
  }

  const targets = req.app.locals.store.targets || [];
  const target = targets.find(t => t.id === id);
  if (!target) return res.status(404).json({ success: false, error: 'Target not found' });
  res.json({ success: true, target });
}));

// ── POST /api/targets — Créer un target ───────────────────────
router.post('/', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const {
    company_name, sector, website, contact_name, contact_title,
    contact_email, contact_phone, offer_type, priority, notes
  } = req.body;

  if (!company_name) {
    return res.status(400).json({ success: false, error: 'company_name is required' });
  }

  const id = `TGT-${Date.now()}`;
  const target = {
    id, project_id: PROJECT_ID, company_name, sector, website,
    contact_name, contact_title, contact_email, contact_phone,
    offer_type, priority: priority || 'cold', notes,
    status: 'identified', score: 0,
    research_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (db) {
    const result = await db.query(
      `INSERT INTO targets (id, project_id, company_name, sector, website, contact_name, contact_title,
       contact_email, contact_phone, offer_type, priority, notes, status, score, research_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [id, PROJECT_ID, company_name, sector, website, contact_name, contact_title,
       contact_email, contact_phone, offer_type, priority || 'cold', notes, 'identified', 0, 'pending']
    );
    return res.status(201).json({ success: true, target: result.rows[0] });
  }

  if (!req.app.locals.store.targets) req.app.locals.store.targets = [];
  req.app.locals.store.targets.push(target);
  res.status(201).json({ success: true, target });
}));

// ── PUT /api/targets/:id — Mettre à jour un target ────────────
router.put('/:id', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const updates = req.body;
  updates.updated_at = new Date().toISOString();

  if (db) {
    const fields = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = Object.values(updates);
    const result = await db.query(
      `UPDATE targets SET ${fields} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Target not found' });
    return res.json({ success: true, target: result.rows[0] });
  }

  const targets = req.app.locals.store.targets || [];
  const idx = targets.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Target not found' });
  targets[idx] = { ...targets[idx], ...updates };
  res.json({ success: true, target: targets[idx] });
}));

// ── PATCH /api/targets/:id/status — Changer statut (Kanban) ───
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;
  const { status, notes } = req.body;

  const validStatuses = ['identified','researching','ready','contacted','replied','meeting','proposal','negotiating','won','lost'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  if (db) {
    const result = await db.query(
      `UPDATE targets SET status = $2, notes = COALESCE($3, notes), last_contact_date = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, status, notes]
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, error: 'Target not found' });
    return res.json({ success: true, target: result.rows[0], message: `Status → ${status}` });
  }

  const targets = req.app.locals.store.targets || [];
  const idx = targets.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Target not found' });
  targets[idx].status = status;
  targets[idx].updated_at = new Date().toISOString();
  res.json({ success: true, target: targets[idx], message: `Status → ${status}` });
}));

// ── DELETE /api/targets/:id — Supprimer un target ─────────────
router.delete('/:id', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { id } = req.params;

  if (db) {
    await db.query('DELETE FROM targets WHERE id = $1', [id]);
    return res.json({ success: true, message: `Target ${id} deleted` });
  }

  const targets = req.app.locals.store.targets || [];
  req.app.locals.store.targets = targets.filter(t => t.id !== id);
  res.json({ success: true, message: `Target ${id} deleted` });
}));

// ── GET /api/targets/stats/pipeline ── Stats Kanban ──────────
router.get('/stats/pipeline', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;

  if (db) {
    const result = await db.query(
      `SELECT status, COUNT(*) as count,
       ROUND(AVG(score), 1) as avg_score
       FROM targets WHERE project_id = $1
       GROUP BY status ORDER BY count DESC`,
      [PROJECT_ID]
    );
    return res.json({ success: true, pipeline: result.rows });
  }

  const targets = req.app.locals.store.targets || [];
  const stats = {};
  targets.forEach(t => {
    stats[t.status] = (stats[t.status] || 0) + 1;
  });
  res.json({ success: true, pipeline: Object.entries(stats).map(([status, count]) => ({ status, count })) });
}));

module.exports = router;
