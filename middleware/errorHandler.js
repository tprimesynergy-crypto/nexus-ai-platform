/**
 * ═══════════════════════════════════════════════════════════════
 * NEXUS AI PLATFORM — Error Handler Middleware
 * TANGER NEXUS 2026 | Prime Synergy Group
 * ═══════════════════════════════════════════════════════════════
 */

const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // Log l'erreur
  console.error(`[ERROR] ${new Date().toISOString()} ${req.method} ${req.path}`);
  console.error(err.stack || err);

  // Log en base de données si disponible
  if (req.app.locals.db) {
    req.app.locals.db.query(
      `INSERT INTO run_logs (run_id, workflow_name, status, error, started_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [`err-${Date.now()}`, 'system', 'error', message]
    ).catch(() => {}); // ignore les erreurs de log
  }

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
};

const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
    hint: 'Check /api/status for available endpoints'
  });
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { errorHandler, notFound, asyncHandler };
