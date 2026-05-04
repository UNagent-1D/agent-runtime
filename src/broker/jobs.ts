import { getChannel } from './connection.js';

export interface ChatJob {
  job_id: string;
  chat_id: number;
  tenant_id: string;
  session_id: string;
  message: string;
}

export interface ChatResult {
  job_id: string;
  chat_id: number;
  session_id: string;
  text: string;
}

export interface JobResult {
  text: string;
  session_id: string;
}

interface PendingJob {
  resolve: (r: JobResult) => void;
  result?: JobResult;
}

const pending = new Map<string, PendingJob>();

export function registerJob(jobId: string): void {
  if (!pending.has(jobId)) {
    pending.set(jobId, { resolve: () => {} });
  }
}

export function resolveJob(jobId: string, result: JobResult): void {
  const entry = pending.get(jobId);
  if (!entry) {
    // Store result in case wait() hasn't been called yet
    pending.set(jobId, { resolve: () => {}, result });
    return;
  }
  if (entry.result) return; // already resolved
  entry.result = result;
  entry.resolve(result);
}

export function waitForJob(jobId: string, timeoutMs: number): Promise<JobResult | null> {
  const entry = pending.get(jobId);
  if (!entry) return Promise.resolve(null); // unknown job

  // Result already arrived before wait() was called
  if (entry.result) {
    pending.delete(jobId);
    return Promise.resolve(entry.result);
  }

  return new Promise<JobResult | null>((resolve) => {
    const timer = setTimeout(() => {
      const e = pending.get(jobId);
      if (e && !e.result) {
        // Leave entry alive so background waiter can still get the result
        resolve(null);
      }
    }, timeoutMs);

    entry.resolve = (r: JobResult) => {
      clearTimeout(timer);
      pending.delete(jobId);
      resolve(r);
    };
  });
}

export async function publishJob(job: ChatJob): Promise<void> {
  const ch = await getChannel();
  ch.sendToQueue('chat_requests', Buffer.from(JSON.stringify(job)), {
    persistent: true,
    contentType: 'application/json',
  });
}

export async function startResultConsumer(): Promise<void> {
  const ch = await getChannel();
  await ch.consume(
    'chat_results',
    (msg) => {
      if (!msg) return;
      try {
        const result: ChatResult = JSON.parse(msg.content.toString());
        resolveJob(result.job_id, {
          text: result.text,
          session_id: result.session_id,
        });
      } catch (err) {
        console.error('Failed to parse chat_results message:', err);
      } finally {
        ch.ack(msg);
      }
    },
    { noAck: false },
  );
  console.log('agent-runtime: consuming chat_results queue');
}
