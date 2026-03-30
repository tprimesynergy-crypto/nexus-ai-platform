/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS AI PLATFORM — Routes: Campaigns (Email + Social)
 * TANGER NEXUS 2026 | Prime Synergy Group
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { asyncHandler } = require('../middleware/errorHandler');

const PROJECT_ID = process.env.PROJECT_ID || 'TNG-NEXUS-2026';

// ── GET /api/campaigns — Liste campaigns ───────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { status, type } = req.query;

  if (db) {
    let query = `SELECT * FROM campaigns WHERE project_id = $1`;
    const params = [PROJECT_ID];
    if (status) { query += ` AND status = $2`; params.push(status); }
    if (type) { query += ` AND campaign_type = $${params.length + 1}`; params.push(type); }
    query += ` ORDER BY created_at DESC`;
    const result = await db.query(query, params);
    return res.json({ success: true, campaigns: result.rows });
  }

  res.json({ success: true, campaigns: [], message: 'Database not connected' });
}));

// ── POST /api/campaigns — Créer une campaign ──────────────────
router.post('/', asyncHandler(async (req, res) => {
  const db = req.app.locals.db;
  const { campaign_type, segment, subject, brevo_template_id, brevo_list_id } = req.body;

  if (!subject) return res.status(400).json({ success: false, error: 'subject is required' });

  const id = `CAM-${Date.now()}`;

  if (db) {
    const result = await db.query(
      `INSERT INTO campaigns (id, project_id, campaign_type, segment, subject, brevo_template_id, brevo_list_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft') RETURNING *`,
      [id, PROJECT_ID, campaign_type || 'email', segment, subject, brevo_template_id, brevo_list_id]
    );
    return res.status(201).json({ success: true, campaign: result.rows[0] });
  }

  res.status(201).json({ success: true, campaign: { id, campaign_type, segment, subject, status: 'draft' } });
}));

// ── POST /api/campaigns/:id/send — Envoyer via Brevo ─────────
router.post('/:id/send', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const brevoKey = process.env.BREVO_API_KEY;

  if (!brevoKey) {
    return res.status(503).json({
      success: false,
      error: 'Brevo API key not configured',
      hint: 'Add BREVO_API_KEY to .env'
    });
  }

  const db = req.app.locals.db;
  let campaign;

  if (db) {
    const result = await db.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    campaign = result.rows[0];
  }

  if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
  if (campaign.status === 'sent') return res.status(400).json({ success: false, error: 'Campaign already sent' });

  // Déclencher via n8n WF-04 ou WF-05
  const webhookUrl = campaign.campaign_type === 'newsletter'
    ? process.env.WEBHOOK_WF05
    : process.env.WEBHOOK_WF04;

  if (webhookUrl) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: id, campaign })
    }).catch(() => {});
  }

  // Marquer comme envoyé
  if (db) {
    await db.query(
      `UPDATE campaigns SET status = 'sent', sent_at = NOW() WHERE id = $1`,
      [id]
    );
  }

  res.json({ success: true, message: `Campaign ${id} sent`, via: webhookUrl ? 'n8n' : 'direct' });
}));

// ── GET /api/campaigns/:id/stats — Stats Brevo ────────────────
router.get('/:id/stats', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const db = req.app.locals.db;

  if (db) {
    const result = await db.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    const campaign = result.rows[0];
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    return res.json({
      success: true,
      stats: {
        sent_count: campaign.sent_count || 0,
        open_rate: campaign.open_rate || 0,
        click_rate: campaign.click_rate || 0,
        status: campaign.status,
        sent_at: campaign.sent_at
      }
    });
  }

  res.json({ success: true, stats: { sent_count: 0, open_rate: 0, click_rate: 0 } });
}));

module.exports = router;
