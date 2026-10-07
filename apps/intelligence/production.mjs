export function buildProductionConfig(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  const token = String(env.INTELLIGENCE_API_TOKEN || '').trim();
  const port = Number(env.INTELLIGENCE_PORT || 4320);
  const allowedOrigins = String(env.INTELLIGENCE_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(',').map((origin) => origin.trim()).filter(Boolean);

  return {
    databaseUrl,
    token,
    port: Number.isFinite(port) ? port : 4320,
    allowedOrigins,
    ready: Boolean(databaseUrl && token && token.length >= 32)
  };
}

export function evaluatePipeline(results = []) {
  const safeResults = Array.isArray(results) ? results : [];
  const total = safeResults.length || 1;
  const truePositives = safeResults.filter((entry) => entry.result === entry.expected && entry.supported === true).length;
  const falsePositives = safeResults.filter((entry) => entry.result !== entry.expected && entry.supported === true).length;
  const unsupported = safeResults.filter((entry) => entry.supported === false).length;
  const falsePositiveRate = falsePositives / total;
  const unsupportedClaimRate = unsupported / total;

  const status = falsePositiveRate <= 0.15 && unsupportedClaimRate <= 0.2 ? 'READY' : 'WARN';

  return {
    total,
    truePositives,
    falsePositives,
    unsupported,
    falsePositiveRate: Number(falsePositiveRate.toFixed(3)),
    unsupportedClaimRate: Number(unsupportedClaimRate.toFixed(3)),
    status
  };
}
