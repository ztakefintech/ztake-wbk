/**
 * Health-check routes.
 *
 *   GET /        → simple liveness probe (text)
 *   GET /health  → detailed JSON health payload (uptime, timestamp, memory)
 */

const { Router } = require('express');

const router = Router();

// ─── Liveness probe ──────────────────────────────────────────────────────────

router.get('/', (_req, res) => {
  res.status(200).send('Ztake Webhook Proxy Running');
});

// ─── Detailed health ─────────────────────────────────────────────────────────

router.get('/health', (_req, res) => {
  const memoryUsage = process.memoryUsage();

  res.status(200).json({
    status: 'healthy',
    uptime: formatUptime(process.uptime()),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    memory: {
      rss: formatBytes(memoryUsage.rss),
      heapUsed: formatBytes(memoryUsage.heapUsed),
      heapTotal: formatBytes(memoryUsage.heapTotal),
    },
    version: require('../../package.json').version,
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

module.exports = router;
