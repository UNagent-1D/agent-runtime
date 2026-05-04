import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import {
  registerJob,
  waitForJob,
  publishJob,
  type ChatJob,
} from '../broker/jobs.js';

export const jobsRouter = Router();

const MAX_WAIT_MS = 120_000;

// POST /api/v1/jobs
// Body: { session_id, message, chat_id, tenant_id }
// Returns: { job_id }
jobsRouter.post('/api/v1/jobs', async (req: Request, res: Response) => {
  const { session_id, message, chat_id, tenant_id } = req.body as {
    session_id?: string;
    message?: string;
    chat_id?: number;
    tenant_id?: string;
  };

  if (!session_id || typeof session_id !== 'string') {
    res.status(400).json({ error: 'session_id is required' });
    return;
  }
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message is required' });
    return;
  }
  if (typeof chat_id !== 'number') {
    res.status(400).json({ error: 'chat_id (number) is required' });
    return;
  }
  if (!tenant_id || typeof tenant_id !== 'string') {
    res.status(400).json({ error: 'tenant_id is required' });
    return;
  }

  const job_id = randomUUID();
  registerJob(job_id);

  const job: ChatJob = { job_id, session_id, message, chat_id, tenant_id };

  try {
    await publishJob(job);
  } catch (err) {
    console.error('Failed to publish job to broker:', err);
    res.status(502).json({ error: 'broker_unavailable' });
    return;
  }

  res.json({ job_id });
});

// GET /api/v1/jobs/:job_id/wait?timeout=<ms>
// Returns: 200 { text, session_id } | 408 { error:"timeout" } | 404 { error:"unknown_job" }
jobsRouter.get('/api/v1/jobs/:job_id/wait', async (req: Request, res: Response) => {
  const job_id = req.params['job_id'] as string;
  const rawTimeout = parseInt(String(req.query['timeout'] ?? '30000'), 10);
  const timeoutMs = Math.min(isNaN(rawTimeout) ? 30_000 : rawTimeout, MAX_WAIT_MS);

  const result = await waitForJob(job_id, timeoutMs);

  if (result === null) {
    // Could be unknown job or genuine timeout — return 408 in both cases
    // so the caller can decide whether to retry or give up
    res.status(408).json({ error: 'timeout' });
    return;
  }

  res.json({ text: result.text, session_id: result.session_id });
});
