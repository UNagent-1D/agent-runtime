import express from 'express';
import { healthRouter } from './routes/health.js';
import { acrRouter } from './routes/acr.js';
import { tenantStubRouter } from './routes/tenant-stub.js';
import { proxyRouter } from './routes/proxy.js';

const app = express();
const port = parseInt(process.env['PORT'] ?? '3100', 10);

app.use(express.json());

app.use(healthRouter);
app.use(acrRouter);
app.use(tenantStubRouter);
app.use(proxyRouter);

app.listen(port, () => {
  console.log(`agent-runtime listening on :${port}`);
});
