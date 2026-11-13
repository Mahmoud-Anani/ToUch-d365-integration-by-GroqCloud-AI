import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { AppServices } from '../runtime';

const SESSION_SOCKET = /^\/api\/device-connections\/sessions\/([0-9a-f-]{36})\/socket$/i;
const MOBILE_SOCKET = /^\/api\/device-connections\/sessions\/([0-9a-f-]{36})\/mobile-socket$/i;
const MAX_MESSAGE_BYTES = 2_500;

function socketOrigin(request: IncomingMessage, services: AppServices): string {
  const forwarded = services.config.trustProxy && request.headers['x-forwarded-proto'] === 'https';
  return `${(request.socket as Duplex & { encrypted?: boolean }).encrypted || forwarded ? 'https' : 'http'}://${request.headers.host ?? ''}`;
}

function send(socket: WebSocket, message: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function reject(socket: Duplex, status: number, message: string): void {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function attachDeviceConnectionWebSocket(server: Server, services: AppServices): () => void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const laptopMatch = url.pathname.match(SESSION_SOCKET);
    const mobileMatch = url.pathname.match(MOBILE_SOCKET);
    if (!laptopMatch && !mobileMatch) return;

    const origin = request.headers.origin;
    if (!origin || origin !== socketOrigin(request, services)) {
      reject(socket, 403, 'Forbidden');
      return;
    }

    let ownerId: string | undefined;
    if (laptopMatch) {
      const token = services.sessions.readToken(request.headers.cookie);
      const payload = services.sessions.verify(token);
      const user = payload ? services.users.find(payload.sub) : undefined;
      if (!user) {
        reject(socket, 401, 'Unauthorized');
        return;
      }
      ownerId = `user:${user.username}`;
    }

    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit('connection', client, request, { sessionId: laptopMatch?.[1] ?? mobileMatch?.[1], ownerId, mobile: Boolean(mobileMatch) });
    });
  };

  wss.on('connection', (client: WebSocket, _request: IncomingMessage, context: {
    sessionId: string;
    ownerId?: string;
    mobile: boolean;
  }) => {
    const statefulClient = client as WebSocket & { isAlive?: boolean };
    statefulClient.isAlive = true;
    client.on('pong', () => { statefulClient.isAlive = true; });
    if (!context.mobile) {
      try {
        const unsubscribe = services.deviceConnections.subscribe(context.ownerId!, context.sessionId, (event) => {
          send(client, { type: event.type, eventId: event.id, ...event.data });
          if (event.type === 'expired' || event.type === 'cancelled') client.close(1000, event.type);
        });
        client.on('message', (raw) => {
          try {
            const message = JSON.parse(raw.toString()) as Record<string, unknown>;
            if (message.type === 'ack' && typeof message.eventId === 'number') {
              services.deviceConnections.acknowledge(context.ownerId!, context.sessionId, message.eventId);
            }
          } catch { client.close(1007, 'Invalid message'); }
        });
        client.once('close', unsubscribe);
        client.once('error', unsubscribe);
      } catch {
        client.close(4404, 'Session unavailable');
      }
      return;
    }

    let authenticated = false;
    let deviceToken = '';
    let unsubscribeDevice: (() => void) | undefined;
    const authTimeout = setTimeout(() => client.close(4401, 'Authentication required'), 5_000);
    authTimeout.unref?.();
    client.on('message', (raw) => {
      const text = raw.toString();
      if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_BYTES) { client.close(1009, 'Message too large'); return; }
      let message: Record<string, unknown>;
      try {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
        message = parsed as Record<string, unknown>;
      } catch {
        client.close(1007, 'Invalid message');
        return;
      }

      if (!authenticated) {
        if (message.type !== 'authenticate' || typeof message.token !== 'string') { client.close(4401, 'Authentication required'); return; }
        try {
          const status = services.deviceConnections.mobileStatus(context.sessionId, message.token);
          authenticated = true;
          deviceToken = message.token;
          unsubscribeDevice = services.deviceConnections.subscribeDevice(context.sessionId, deviceToken, (deviceEvent) => {
            if (['disconnected', 'expired', 'cancelled'].includes(deviceEvent.type)) {
              send(client, { type: deviceEvent.type, ...deviceEvent.data });
              client.close(1000, deviceEvent.type);
            }
          });
          clearTimeout(authTimeout);
          send(client, { type: 'status', ...status });
        } catch {
          client.close(4401, 'Device token invalid or expired');
        }
        return;
      }

      if (message.type === 'scan') {
        try {
          const receipt = services.deviceConnections.submitScan(
            context.sessionId,
            deviceToken,
            message.scanId as string,
            message.payload as string,
          );
          send(client, { type: 'scan-accepted', ...receipt });
        } catch (error) {
          send(client, { type: 'scan-error', scanId: message.scanId, message: error instanceof Error ? error.message : 'Scan was rejected.' });
        }
      } else if (message.type === 'disconnect') {
        try {
          services.deviceConnections.disconnectDevice(context.sessionId, deviceToken);
          client.close(1000, 'Disconnected');
        } catch { client.close(4401, 'Device token invalid or expired'); }
      } else if (message.type === 'ping') send(client, { type: 'pong' });
    });
    client.once('close', () => { clearTimeout(authTimeout); unsubscribeDevice?.(); });
  });

  server.on('upgrade', upgrade);
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if ((client as WebSocket & { isAlive?: boolean }).isAlive === false) { client.terminate(); continue; }
      (client as WebSocket & { isAlive?: boolean }).isAlive = false;
      client.ping();
    }
  }, 25_000);
  heartbeat.unref?.();

  return () => {
    clearInterval(heartbeat);
    server.off('upgrade', upgrade);
    for (const client of wss.clients) client.close(1001, 'Server shutting down');
    wss.close();
  };
}
