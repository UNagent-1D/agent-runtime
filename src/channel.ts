// Secure-channel primitives shared by every inbound middleware and outbound
// fetch / broker publish in this service. Uses Node's built-in `crypto`
// module, which is backed by OpenSSL in the standard Node distribution.
//
// Wire format matches the Rust + Go + Python + Java implementations across
// the stack:
//   { v: 1, iv: <base64 12B>, ct: <base64>, tag: <base64 16B> }
// Detected on HTTP via `X-Secure-Channel: aes256gcm/1` +
// `Content-Type: application/vnd.unagent.secure+json`, and on AMQP via the
// `contentType` property on the publishing.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const HEADER_NAME = 'x-secure-channel';
export const HEADER_VALUE = 'aes256gcm/1';
export const CONTENT_TYPE = 'application/vnd.unagent.secure+json';
const IV_LEN = 12;
const TAG_LEN = 16;

export interface Envelope {
  v: 1;
  iv: string;
  ct: string;
  tag: string;
}

export interface ChannelConfig {
  key: Buffer | null;
  enabled: boolean;
}

let cached: ChannelConfig | null = null;

export function getChannel(): ChannelConfig {
  if (cached !== null) return cached;

  const enabled = (process.env['BACKEND_CHANNEL_ENABLED'] ?? 'false').toLowerCase() === 'true';
  const keyB64 = process.env['BACKEND_CHANNEL_KEY'];

  let key: Buffer | null = null;
  if (keyB64 && keyB64.length > 0) {
    const decoded = Buffer.from(keyB64, 'base64');
    if (decoded.length !== 32) {
      throw new Error(
        `BACKEND_CHANNEL_KEY must decode to 32 bytes, got ${decoded.length}`,
      );
    }
    key = decoded;
  }

  if (enabled && key === null) {
    throw new Error(
      'BACKEND_CHANNEL_ENABLED=true but BACKEND_CHANNEL_KEY is not set',
    );
  }

  cached = { key, enabled };
  return cached;
}

export function channelActive(): boolean {
  const c = getChannel();
  return c.enabled && c.key !== null;
}

export function seal(plaintext: Buffer): Envelope {
  const c = getChannel();
  if (c.key === null) {
    throw new Error('seal() called but BACKEND_CHANNEL_KEY is not configured');
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', c.key, iv, { authTagLength: TAG_LEN });
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function open(envelope: Envelope): Buffer {
  const c = getChannel();
  if (c.key === null) {
    throw new Error('open() called but BACKEND_CHANNEL_KEY is not configured');
  }
  if (envelope.v !== 1) {
    throw new Error(`unsupported envelope version ${String(envelope.v)}`);
  }
  const iv = Buffer.from(envelope.iv, 'base64');
  const ct = Buffer.from(envelope.ct, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  if (iv.length !== IV_LEN) throw new Error('iv must be 12 bytes');
  if (tag.length !== TAG_LEN) throw new Error('tag must be 16 bytes');

  const decipher = createDecipheriv('aes-256-gcm', c.key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch (err) {
    // GCM authentication failure surfaces as "Unsupported state or unable to authenticate data"
    throw new Error(`AEAD verification failed: ${(err as Error).message}`);
  }
}

/**
 * Seal a JS value into the wire envelope JSON. Use the result as the request
 * body / queue payload. When the channel is inactive, returns the plaintext
 * JSON string and `encrypted=false` so callers can fall back transparently.
 */
export function sealJson(value: unknown): { body: string; contentType: string; encrypted: boolean } {
  const plain = Buffer.from(JSON.stringify(value), 'utf8');
  if (!channelActive()) {
    return { body: plain.toString('utf8'), contentType: 'application/json', encrypted: false };
  }
  const env = seal(plain);
  return { body: JSON.stringify(env), contentType: CONTENT_TYPE, encrypted: true };
}

/**
 * Open response / queue bytes back into a JS value. Header-driven:
 * if `contentType` marks it as an envelope, decrypt; otherwise parse as JSON.
 */
export function openJson(contentType: string | undefined, body: string | Buffer): unknown {
  const isEnvelope = typeof contentType === 'string' && contentType.startsWith(CONTENT_TYPE);
  const text = typeof body === 'string' ? body : body.toString('utf8');
  if (!isEnvelope) {
    return text.length === 0 ? null : JSON.parse(text);
  }
  const envelope = JSON.parse(text) as Envelope;
  const plain = open(envelope);
  return JSON.parse(plain.toString('utf8'));
}
