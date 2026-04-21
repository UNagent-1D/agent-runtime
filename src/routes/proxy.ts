import { Router } from 'express';
import type { Request, Response } from 'express';

export const proxyRouter = Router();

const CONVERSATION_CHAT_URL =
  process.env['CONVERSATION_CHAT_URL'] ?? 'http://conversation-chat:8082';

function buildOpenSessionBody(tenantId: string) {
  return {
    channel: 'web',
    channel_key: tenantId,
    message_id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    from: tenantId,
    text: '',
    message_type: 'text',
    timestamp: new Date().toISOString(),
    tenant_id: tenantId,
    tenant_slug: tenantId,
    agent_profile_id: 'hospital-mock',
    end_user: {
      exists: false,
      id: '',
      full_name: '',
      cellphone: tenantId,
      external_ref: '',
    },
  };
}

// POST /api/v1/sessions
// Receives { tenant_id } from chat-orch's ConversationChatClient.create_session().
// Adapts to conversation-chat's full OpenSessionRequest and returns { sid }.
proxyRouter.post('/api/v1/sessions', async (req: Request, res: Response) => {
  const body = req.body as { tenant_id?: unknown };
  const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : '';

  if (!tenantId) {
    res.status(400).json({ error: 'tenant_id is required' });
    return;
  }

  try {
    const upstream = await fetch(`${CONVERSATION_CHAT_URL}/api/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer internal',
      },
      body: JSON.stringify(buildOpenSessionBody(tenantId)),
    });

    const data = (await upstream.json()) as Record<string, unknown>;

    if (!upstream.ok) {
      res.status(upstream.status).json(data);
      return;
    }

    // Map { session_id } → { sid } to match chat-orch's ConversationChatClient expectation.
    res.json({ sid: data['session_id'] });
  } catch (err) {
    res.status(502).json({ error: 'conversation-chat unavailable', detail: String(err) });
  }
});

// POST /api/v1/sessions/:sid/turns
// Receives { message } from chat-orch's ConversationChatClient.post_turn().
// Adapts to conversation-chat's TurnRequest and passes the response through.
proxyRouter.post('/api/v1/sessions/:sid/turns', async (req: Request, res: Response) => {
  const sid = req.params['sid'] ?? '';
  const body = req.body as { message?: unknown };
  const message = typeof body.message === 'string' ? body.message : '';

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const upstream = await fetch(
      `${CONVERSATION_CHAT_URL}/api/v1/sessions/${sid}/turns`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer internal',
        },
        body: JSON.stringify({
          user_message: message,
          message_id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          channel_key: '',
        }),
      },
    );

    const data = (await upstream.json()) as unknown;
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'conversation-chat unavailable', detail: String(err) });
  }
});
