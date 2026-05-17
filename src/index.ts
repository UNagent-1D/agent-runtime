import express from 'express';
import { healthRouter } from './routes/health.js';
import { acrRouter } from './routes/acr.js';
import { tenantStubRouter } from './routes/tenant-stub.js';
import { proxyRouter } from './routes/proxy.js';
import { jobsRouter } from './routes/jobs.js';
import { startResultConsumer } from './broker/jobs.js';
import { channelActive } from './channel.js';
import {
  secureChannelMiddleware,
  secureChannelRawParser,
} from './middleware/secure-channel.js';

const app = express();
const port = parseInt(process.env['PORT'] ?? '3100', 10);

// Health probes stay plaintext (callers are external monitors that don't
// share the channel key).
app.use(healthRouter);

// Body parsing order matters:
//   1. raw parser captures secure-channel envelopes as Buffer (so the JSON
//      parser doesn't try to decode the ciphertext);
//   2. json parser handles plaintext bodies as before;
//   3. secure-channel middleware decrypts step-1 buffers and replaces req.body,
//      and installs a res.json wrapper that re-seals the reply.
app.use(secureChannelRawParser);
app.use(express.json());
app.use(secureChannelMiddleware);

app.use(acrRouter);
app.use(tenantStubRouter);
app.use(proxyRouter);
app.use(jobsRouter);

app.listen(port, () => {
  console.log(`agent-runtime listening on :${port}`);
  console.log(
    `secure channel ${channelActive() ? 'enabled (AES-256-GCM)' : 'disabled — backend traffic is plaintext'}`,
  );
  if (process.env['RABBITMQ_URL']) {
    startConsumerWithRetry();
  } else {
    console.warn('RABBITMQ_URL not set — broker features disabled');
  }
});

// Retry startResultConsumer indefinitely with capped exponential backoff.
// Needed because Docker DNS may not resolve service hostnames immediately
// after the container starts, even when depends_on service_healthy passes,
// and because RabbitMQ may restart mid-session.
async function startConsumerWithRetry(attempt = 1): Promise<void> {
  try {
    await startResultConsumer();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const delayMs = Math.min(3_000 * attempt, 30_000); // cap at 30 s
    console.warn(`result consumer attempt ${attempt} failed (${msg}) — retrying in ${delayMs / 1000} s`);
    setTimeout(() => void startConsumerWithRetry(attempt + 1), delayMs);
  }
}
