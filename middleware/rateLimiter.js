/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS AI PLATFORM — Rate Limiter Middleware
 * TANGER NEXUS 2026 | Prime Synergy Group
 * ═══════════════════════════════════════════════════════════════
 */

const rateLimit = require('express-rate-limit');

// ── Limite générale API ────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests — please try again in 15 minutes'
  }
});

// ── Limite pour trigger agents IA (plus strict) ───────────────
const triggerLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // max 10 triggers/minute
  message: {
    success: false,
    error: 'Too many agent triggers — max 10 per minute'
  }
});

// ── Limite pour upload fichiers ───────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 50,
  message: {
    success: false,
    error: 'Too many uploads — max 50 per hour'
  }
});

module.exports = { apiLimiter, triggerLimiter, uploadLimiter };
