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
  // Start consuming chat_results after the server is up
  if (process.env['RABBITMQ_URL']) {
    startResultConsumer().catch((err: Error) => {
      console.error('Failed to start result consumer:', err.message);
    });
  } else {
    console.warn('RABBITMQ_URL not set — broker features disabled');
  }
});
