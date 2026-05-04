import express from 'express';
import { healthRouter } from './routes/health.js';
import { acrRouter } from './routes/acr.js';
import { tenantStubRouter } from './routes/tenant-stub.js';
import { proxyRouter } from './routes/proxy.js';
import { jobsRouter } from './routes/jobs.js';
import { startResultConsumer } from './broker/jobs.js';

const app = express();
const port = parseInt(process.env['PORT'] ?? '3100', 10);

app.use(express.json());

app.use(healthRouter);
app.use(acrRouter);
app.use(tenantStubRouter);
app.use(proxyRouter);
app.use(jobsRouter);

app.listen(port, () => {
  console.log(`agent-runtime listening on :${port}`);
  if (process.env['RABBITMQ_URL']) {
    startConsumerWithRetry();
  } else {
    console.warn('RABBITMQ_URL not set — broker features disabled');
  }
});

// Retry startResultConsumer up to 10 times with 3 s backoff.
// Needed because Docker DNS may not resolve service hostnames
// immediately after the container starts, even when depends_on
// service_healthy passes.
async function startConsumerWithRetry(attempt = 1): Promise<void> {
  try {
    await startResultConsumer();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (attempt >= 10) {
      console.error(`result consumer failed after ${attempt} attempts: ${msg}`);
      return;
    }
    console.warn(`result consumer attempt ${attempt} failed (${msg}) — retrying in 3 s`);
    setTimeout(() => void startConsumerWithRetry(attempt + 1), 3_000);
  }
}
