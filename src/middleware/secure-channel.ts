import type { Request, Response, NextFunction } from 'express';
import express from 'express';
import {
  CONTENT_TYPE,
  HEADER_NAME,
  HEADER_VALUE,
  open,
  seal,
  type Envelope,
} from '../channel.js';

declare module 'express-serve-static-core' {
  interface Request {
    // Set when the request arrived in envelope form so the response wrapper
    // knows to seal the reply with the same convention.
    secureChannel?: boolean;
  }
}

/**
 * Captures envelope-typed request bodies as a raw Buffer. Mounted before
 * `express.json()` so the JSON parser doesn't try to decode the ciphertext.
 */
export const secureChannelRawParser = express.raw({
  type: CONTENT_TYPE,
  limit: '5mb',
});

/**
 * Header-driven middleware that:
 *   1. Decodes envelope bodies captured by `secureChannelRawParser` and
 *      replaces `req.body` with the decrypted JSON value.
 *   2. Wraps `res.json` so any response on this request is sealed before
 *      flushing, preserving the secure-channel handshake for both directions.
 *
 * Plaintext requests (e.g. health probes, legacy callers) pass through
 * untouched.
 */
export function secureChannelMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Inbound: ciphertext arrives as Buffer (from express.raw) on requests
  // with a sealed body. Bodyless requests (GET, DELETE, etc.) that still
  // need encrypted *responses* signal via the X-Secure-Channel header.
  const hasHeader = typeof req.headers[HEADER_NAME] === 'string'
    && (req.headers[HEADER_NAME] as string).length > 0;
  const bodyIsEnvelope = Buffer.isBuffer(req.body) && req.body.length > 0;

  if (bodyIsEnvelope) {
    try {
      const envelope = JSON.parse((req.body as Buffer).toString('utf8')) as Envelope;
      const plain = open(envelope);
      req.body = plain.length === 0 ? {} : JSON.parse(plain.toString('utf8'));
      req.secureChannel = true;
    } catch (err) {
      res.status(400).json({
        error: 'secure_channel_decrypt_failed',
        detail: (err as Error).message,
      });
      return;
    }
  } else if (hasHeader) {
    // Header-only signal — typical for GETs. Seal the response.
    req.secureChannel = true;
  }

  // Outbound: only re-encrypt when the caller used the envelope on the way in.
  if (req.secureChannel === true) {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      try {
        const plain = Buffer.from(JSON.stringify(body), 'utf8');
        const env = seal(plain);
        res.setHeader('Content-Type', CONTENT_TYPE);
        res.setHeader(HEADER_NAME, HEADER_VALUE);
        return res.send(JSON.stringify(env));
      } catch (err) {
        // Fall back to plaintext on encryption failure so the caller at
        // least gets the status code; this is purely defensive.
        console.error('secure-channel: failed to seal response, sending plaintext:', err);
        return originalJson(body);
      }
    }) as typeof res.json;
  }

  next();
}
