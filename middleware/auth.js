/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS AI PLATFORM — Middleware d'Authentification
 * TANGER NEXUS 2026 | Prime Synergy Group
 * ═══════════════════════════════════════════════════════════════
 */

const crypto = require('crypto');

// ── Simple API Key Auth ───────────────────────────────────────
const apiKeyAuth = (req, res, next) => {
  // Routes publiques qui ne nécessitent pas d'auth
  const publicRoutes = [
    '/api/status',
    '/api/callback',
  ];

  if (publicRoutes.some(r => req.path.startsWith(r))) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validKey = process.env.PLATFORM_API_KEY;

  // Si pas de clé configurée, passer (mode dev)
  if (!validKey || validKey === 'dev-mode') {
    return next();
  }

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized — API key required',
      hint: 'Add header: x-api-key: YOUR_KEY'
    });
  }

  next();
};

// ── Admin Auth (pour actions critiques) ──────────────────────
const adminAuth = (req, res, next) => {
  const adminEmail = req.headers['x-admin-email'];
  const expectedEmail = process.env.ADMIN_EMAIL || 't.primesynergy@gmail.com';

  if (!adminEmail || adminEmail !== expectedEmail) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden — Admin access required'
    });
  }

  next();
};

// ── Génère un token sécurisé ──────────────────────────────────
const generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// ── Valide un webhook signature (n8n) ────────────────────────
const validateWebhookSignature = (req, res, next) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.WEBHOOK_SECRET;

  if (!secret) return next(); // pas de secret configuré

  const hmac = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (signature !== `sha256=${hmac}`) {
    return res.status(401).json({
      success: false,
      error: 'Invalid webhook signature'
    });
  }

  next();
};

module.exports = { apiKeyAuth, adminAuth, generateToken, validateWebhookSignature };
