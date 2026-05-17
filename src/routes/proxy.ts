import { Router } from 'express';
import type { Request, Response } from 'express';
import { HEADER_NAME, HEADER_VALUE, openJson, sealJson } from '../channel.js';

export const proxyRouter = Router();

const CONVERSATION_CHAT_URL =
  process.env['CONVERSATION_CHAT_URL'] ?? 'http://conversation-chat:8082';

/**
 * Build the headers + body for an outbound JSON request. When the secure
 * channel is active, the body is sealed and the secure-channel headers are
 * attached so the conversation-chat side knows to decrypt.
 */
function buildSecureRequest(value: unknown): { body: string; headers: Record<string, string> } {
  const { body, contentType, encrypted } = sealJson(value);
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    Authorization: 'Bearer internal',
  };
  if (encrypted) headers[HEADER_NAME] = HEADER_VALUE;
  return { body, headers };
}

/** Parse an upstream response, decrypting if it came back in envelope form. */
async function readSecureResponse(upstream: globalThis.Response): Promise<unknown> {
  const ct = upstream.headers.get('content-type') ?? undefined;
  const text = await upstream.text();
  if (text.length === 0) return {};
  return openJson(ct, text);
}

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
    const { body, headers } = buildSecureRequest(buildOpenSessionBody(tenantId));
    const upstream = await fetch(`${CONVERSATION_CHAT_URL}/api/v1/sessions`, {
      method: 'POST',
      headers,
      body,
    });

    const data = (await readSecureResponse(upstream)) as Record<string, unknown>;

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
    const { body, headers } = buildSecureRequest({
      user_message: message,
      message_id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      channel_key: '',
    });
    const upstream = await fetch(
      `${CONVERSATION_CHAT_URL}/api/v1/sessions/${sid}/turns`,
      {
        method: 'POST',
        headers,
        body,
      },
    );

    const data = await readSecureResponse(upstream);
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'conversation-chat unavailable', detail: String(err) });
  }
});
