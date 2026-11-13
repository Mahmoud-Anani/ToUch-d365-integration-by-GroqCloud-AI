import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError, ValidationError } from '../errors';

export type DeviceSessionStatus = 'waiting' | 'connected' | 'scanning' | 'disconnected' | 'expired' | 'cancelled';
export type DeviceEventName = 'status' | 'paired' | 'scan' | 'disconnected' | 'expired' | 'cancelled';
export type DeviceConnectionType = 'qr-session';

interface DeviceEvent {
  id: number;
  type: DeviceEventName;
  data: Record<string, unknown>;
}

interface DeviceSession {
  id: string;
  ownerId: string;
  modelId: string;
  connectionType: DeviceConnectionType;
  createdAt: number;
  expiresAt: number;
  status: DeviceSessionStatus;
  pairTokenHash: string;
  mobileTokenHash?: string;
  deviceLabel?: string;
  acceptedScans: Map<string, { payloadHash: string; receivedAt: string }>;
  recentPayloads: Map<string, number>;
  scansInWindow: number[];
  events: EventEmitter;
  eventSequence: number;
  eventHistory: DeviceEvent[];
  expiryTimer?: NodeJS.Timeout;
}

export interface DeviceSessionView {
  id: string;
  modelId: string;
  connectionType: DeviceConnectionType;
  createdAt: string;
  expiresAt: string;
  status: DeviceSessionStatus;
  deviceLabel?: string;
  scansReceived: number;
}

const MAX_PAYLOAD_BYTES = 2_048;
const MAX_UNACKNOWLEDGED_SCANS = 100;
const MAX_ACTIVE_SESSIONS = 100;
const MAX_LAPTOP_SUBSCRIBERS = 3;
const DUPLICATE_WINDOW_MS = 2_000;
const SCAN_WINDOW_MS = 60_000;
const MAX_SCANS_PER_WINDOW = 60;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function secureEqualHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function token(): string {
  return randomBytes(32).toString('base64url');
}

export class DeviceConnectionService {
  private readonly sessions = new Map<string, DeviceSession>();

  constructor(
    private readonly options: {
      ttlMs: number;
      maxSessionsPerUser: number;
    },
  ) {}

  create(ownerId: string, modelId: string, connectionType: DeviceConnectionType): { sessionId: string; pairingToken: string; expiresAt: number } {
    this.sweep();
    if (!/^[a-z0-9-]{1,80}$/i.test(modelId)) throw new ValidationError('Select a valid D365 model.');
    const active = [...this.sessions.values()].filter(
      (item) => item.ownerId === ownerId && !['expired', 'cancelled'].includes(item.status),
    );
    const globalActive = [...this.sessions.values()].filter((item) => !['expired', 'cancelled'].includes(item.status)).length;
    if (globalActive >= MAX_ACTIVE_SESSIONS) throw new RateLimitError(60, 'Device connection capacity is full. Try again shortly.');
    if (active.length >= this.options.maxSessionsPerUser) {
      throw new RateLimitError(60, 'Too many active device sessions. Close one and try again.');
    }

    const pairingToken = token();
    const now = Date.now();
    const session: DeviceSession = {
      id: randomUUID(),
      ownerId,
      modelId,
      connectionType,
      createdAt: now,
      expiresAt: now + this.options.ttlMs,
      status: 'waiting',
      pairTokenHash: digest(pairingToken),
      acceptedScans: new Map(),
      recentPayloads: new Map(),
      scansInWindow: [],
      events: new EventEmitter(),
      eventSequence: 0,
      eventHistory: [],
    };
    session.expiryTimer = setTimeout(() => this.expire(session), this.options.ttlMs);
    session.expiryTimer.unref?.();
    this.sessions.set(session.id, session);
    return { sessionId: session.id, pairingToken, expiresAt: session.expiresAt };
  }

  get(ownerId: string, sessionId: string): DeviceSessionView {
    const session = this.owned(ownerId, sessionId);
    this.expireIfNeeded(session);
    return this.view(session);
  }

  pair(sessionId: string, pairingToken: string, deviceLabel: string): {
    deviceToken: string;
    expiresAt: number;
    modelId: string;
  } {
    const session = this.find(sessionId);
    this.expireIfNeeded(session);
    if (session.status !== 'waiting') throw new ForbiddenError('This pairing session has already been used or is no longer active.');
    if (typeof pairingToken !== 'string' || pairingToken.length > 100 ||
        !secureEqualHash(session.pairTokenHash, digest(pairingToken))) {
      throw new ForbiddenError('Pairing code is invalid or expired.');
    }
    const deviceToken = token();
    session.mobileTokenHash = digest(deviceToken);
    session.pairTokenHash = '';
    session.deviceLabel = deviceLabel.trim().slice(0, 80) || 'Mobile device';
    session.status = 'connected';
    this.publish(session, 'paired', { status: session.status, deviceLabel: session.deviceLabel });
    return { deviceToken, expiresAt: session.expiresAt, modelId: session.modelId };
  }

  mobileStatus(sessionId: string, deviceToken: string): DeviceSessionView {
    const session = this.authorizeDevice(sessionId, deviceToken);
    this.expireIfNeeded(session);
    return this.view(session);
  }

  subscribeDevice(sessionId: string, deviceToken: string, listener: (event: DeviceEvent) => void): () => void {
    const session = this.authorizeDevice(sessionId, deviceToken);
    session.events.on('device-event', listener);
    this.expireIfNeeded(session);
    return () => session.events.off('device-event', listener);
  }

  submitScan(sessionId: string, deviceToken: string, scanId: string, payload: string): {
    scanId: string;
    receivedAt: string;
    duplicate?: true;
  } {
    const session = this.authorizeDevice(sessionId, deviceToken);
    this.expireIfNeeded(session);
    if (session.status !== 'connected' && session.status !== 'scanning') {
      throw new ForbiddenError('The device connection is no longer active.');
    }
    if (typeof scanId !== 'string' || !/^[A-Za-z0-9_-]{12,100}$/.test(scanId)) {
      throw new ValidationError('Scan identifier is invalid.');
    }
    if (typeof payload !== 'string' || payload.trim().length === 0 || Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new ValidationError(`Scanned content must be between 1 and ${MAX_PAYLOAD_BYTES} bytes.`);
    }

    const now = Date.now();
    for (const [key, time] of session.recentPayloads) {
      if (now - time > DUPLICATE_WINDOW_MS) session.recentPayloads.delete(key);
    }
    const payloadHash = digest(payload);
    const accepted = session.acceptedScans.get(scanId);
    if (accepted) {
      if (accepted.payloadHash !== payloadHash) throw new ConflictError('This scan identifier was already used for different content.');
      return { scanId, receivedAt: accepted.receivedAt, duplicate: true };
    }
    if (session.recentPayloads.has(payloadHash)) throw new ConflictError('This code was scanned moments ago.');
    if (session.eventHistory.filter((event) => event.type === 'scan').length >= MAX_UNACKNOWLEDGED_SCANS) {
      throw new RateLimitError(10, 'The laptop is reconnecting. Wait for its connection to recover before scanning again.');
    }
    session.scansInWindow = session.scansInWindow.filter((time) => now - time < SCAN_WINDOW_MS);
    if (session.scansInWindow.length >= MAX_SCANS_PER_WINDOW) throw new RateLimitError(60);

    session.recentPayloads.set(payloadHash, now);
    session.scansInWindow.push(now);
    session.status = 'scanning';
    const receivedAt = new Date(now).toISOString();
    session.acceptedScans.set(scanId, { payloadHash, receivedAt });
    if (session.acceptedScans.size > 2_000) session.acceptedScans.delete(session.acceptedScans.keys().next().value as string);
    this.publish(session, 'scan', {
      scanId,
      payload,
      receivedAt,
      connectionType: session.connectionType,
      deviceLabel: session.deviceLabel ?? 'Mobile device',
      modelId: session.modelId,
    });
    return { scanId, receivedAt };
  }

  disconnectDevice(sessionId: string, deviceToken: string): void {
    const session = this.authorizeDevice(sessionId, deviceToken);
    session.mobileTokenHash = undefined;
    session.status = 'disconnected';
    this.publish(session, 'disconnected', { status: session.status });
  }

  cancel(ownerId: string, sessionId: string): void {
    const session = this.owned(ownerId, sessionId);
    if (session.status === 'cancelled' || session.status === 'expired') return;
    session.status = 'cancelled';
    session.mobileTokenHash = undefined;
    this.clearTimer(session);
    this.publish(session, 'cancelled', { status: session.status });
    setTimeout(() => this.remove(session), 1_000).unref?.();
  }

  subscribe(ownerId: string, sessionId: string, listener: (event: DeviceEvent) => void): () => void {
    const session = this.owned(ownerId, sessionId);
    this.expireIfNeeded(session);
    if (session.events.listenerCount('device-event') >= MAX_LAPTOP_SUBSCRIBERS) {
      throw new RateLimitError(30, 'This session already has the maximum number of laptop connections.');
    }
    session.events.on('device-event', listener);
    listener({ id: 0, type: 'status', data: this.view(session) as unknown as Record<string, unknown> });
    for (const event of session.eventHistory) listener(event);
    return () => session.events.off('device-event', listener);
  }

  acknowledge(ownerId: string, sessionId: string, eventId: number): void {
    const session = this.owned(ownerId, sessionId);
    if (!Number.isSafeInteger(eventId) || eventId < 0 || eventId > session.eventSequence) {
      throw new ValidationError('WebSocket event cursor is invalid.');
    }
    session.eventHistory = session.eventHistory.filter((event) => event.id !== eventId);
  }

  private authorizeDevice(sessionId: string, deviceToken: string): DeviceSession {
    const session = this.find(sessionId);
    if (!session.mobileTokenHash || typeof deviceToken !== 'string' ||
        !secureEqualHash(session.mobileTokenHash, digest(deviceToken))) {
      throw new ForbiddenError('Device authorization is invalid. Pair this phone again.');
    }
    return session;
  }

  private owned(ownerId: string, sessionId: string): DeviceSession {
    const session = this.find(sessionId);
    if (session.ownerId !== ownerId) throw new NotFoundError('Device session was not found.');
    return session;
  }

  private find(sessionId: string): DeviceSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundError('Device session was not found or has expired.');
    return session;
  }

  private view(session: DeviceSession): DeviceSessionView {
    return {
      id: session.id,
      modelId: session.modelId,
      connectionType: session.connectionType,
      createdAt: new Date(session.createdAt).toISOString(),
      expiresAt: new Date(session.expiresAt).toISOString(),
      status: session.status,
      ...(session.deviceLabel ? { deviceLabel: session.deviceLabel } : {}),
      scansReceived: session.scansInWindow.length,
    };
  }

  private publish(session: DeviceSession, type: DeviceEventName, data: Record<string, unknown>): void {
    const event = { id: ++session.eventSequence, type, data } satisfies DeviceEvent;
    session.eventHistory.push(event);
    if (session.eventHistory.length > 100) session.eventHistory.shift();
    session.events.emit('device-event', event);
  }

  private expireIfNeeded(session: DeviceSession): void {
    if (session.expiresAt <= Date.now() && session.status !== 'expired') this.expire(session);
  }

  private expire(session: DeviceSession): void {
    if (session.status === 'expired' || session.status === 'cancelled') return;
    session.status = 'expired';
    session.mobileTokenHash = undefined;
    this.publish(session, 'expired', { status: session.status });
    this.clearTimer(session);
    setTimeout(() => this.remove(session), 1_000).unref?.();
  }

  private clearTimer(session: DeviceSession): void {
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
    session.expiryTimer = undefined;
  }

  private remove(session: DeviceSession): void {
    if (this.sessions.get(session.id) !== session) return;
    this.sessions.delete(session.id);
    session.events.removeAllListeners();
  }

  private sweep(): void {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (session.expiresAt <= now) this.expire(session);
      else if (['expired', 'cancelled'].includes(session.status)) this.remove(session);
    }
  }
}
