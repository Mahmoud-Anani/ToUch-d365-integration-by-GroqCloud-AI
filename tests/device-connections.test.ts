import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceConnectionService } from '../src/device-connections/service';

describe('DeviceConnectionService', () => {
  afterEach(() => vi.useRealTimers());

  it('expires sessions and invalidates the mobile credential', () => {
    vi.useFakeTimers();
    const service = new DeviceConnectionService({ ttlMs: 60_000, maxSessionsPerUser: 2 });
    const created = service.create('user:alice', 'products', 'qr-session');
    const paired = service.pair(created.sessionId, created.pairingToken, 'phone');

    vi.advanceTimersByTime(60_001);

    expect(service.get('user:alice', created.sessionId).status).toBe('expired');
    expect(() => service.mobileStatus(created.sessionId, paired.deviceToken)).toThrow(/authorization is invalid/i);
  });

  it('rejects access by a different laptop owner', () => {
    const service = new DeviceConnectionService({ ttlMs: 60_000, maxSessionsPerUser: 2 });
    const created = service.create('user:alice', 'products', 'qr-session');

    expect(() => service.get('user:bob', created.sessionId)).toThrow(/not found/i);
    expect(() => service.cancel('user:bob', created.sessionId)).toThrow(/not found/i);
  });

  it('limits active sessions per owner', () => {
    const service = new DeviceConnectionService({ ttlMs: 60_000, maxSessionsPerUser: 1 });
    service.create('user:alice', 'products', 'qr-session');

    expect(() => service.create('user:alice', 'customers', 'qr-session')).toThrow(/too many active/i);
  });

  it('replays unacknowledged events after a WebSocket reconnect', () => {
    const service = new DeviceConnectionService({ ttlMs: 60_000, maxSessionsPerUser: 2 });
    const created = service.create('user:alice', 'products', 'qr-session');
    const paired = service.pair(created.sessionId, created.pairingToken, 'phone');
    service.submitScan(created.sessionId, paired.deviceToken, 'scanidentifier0001', 'ITEM-1');
    const replayed: string[] = [];

    service.subscribe('user:alice', created.sessionId, (event) => replayed.push(event.type));

    expect(replayed).toEqual(['paired', 'scan']);
  });

  it('rejects duplicate payloads even when they arrive with a new request id', () => {
    const service = new DeviceConnectionService({ ttlMs: 60_000, maxSessionsPerUser: 2 });
    const created = service.create('user:alice', 'products', 'qr-session');
    const paired = service.pair(created.sessionId, created.pairingToken, 'phone');
    service.submitScan(created.sessionId, paired.deviceToken, 'scanidentifier0001', 'ITEM-1');

    expect(() => service.submitScan(created.sessionId, paired.deviceToken, 'scanidentifier0002', 'ITEM-1')).toThrow(/scanned moments ago/i);
  });
});
