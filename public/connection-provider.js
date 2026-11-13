(() => {
  'use strict';

  class DeviceWebSocketProvider {
    constructor() {
      this.type = 'qr-session';
      this.sessionId = '';
      this.deviceToken = '';
      this.socket = null;
      this.listeners = new Set();
      this.pending = new Map();
      this.status = 'disconnected';
      this.retryDelay = 500;
      this.reconnectTimer = null;
      this.explicitDisconnect = false;
      this.everConnected = false;
    }

    async isAvailable() {
      return Boolean(window.isSecureContext && 'WebSocket' in window);
    }

    async connect(config = {}) {
      if (!(await this.isAvailable())) throw new Error('Open this page over trusted HTTPS to connect to the laptop.');
      this.sessionId = config.sessionId;
      this.explicitDisconnect = false;
      const tokenKey = `d365-device-token:${this.sessionId}`;
      this.deviceToken = sessionStorage.getItem(tokenKey) || '';
      if (config.pairingToken && !this.deviceToken) {
        const paired = await this.request(`/api/device-connections/sessions/${encodeURIComponent(this.sessionId)}/pair`, {
          method: 'POST',
          body: JSON.stringify({ pairingToken: config.pairingToken, deviceLabel: config.deviceLabel || 'Mobile device' }),
        });
        this.deviceToken = paired.deviceToken;
        sessionStorage.setItem(tokenKey, this.deviceToken);
      }
      if (!this.deviceToken) throw new Error('Pairing link is invalid or expired. Scan a new pairing QR from the laptop.');
      await this.openSocket(true);
      return { status: this.status };
    }

    openSocket(initial = false) {
      return new Promise((resolve, reject) => {
        const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${scheme}//${location.host}/api/device-connections/sessions/${encodeURIComponent(this.sessionId)}/mobile-socket`);
        this.socket = socket;
        let authenticated = false;
        if (initial) this.setStatus('connecting');
        socket.addEventListener('open', () => {
          if (!this.explicitDisconnect) socket.send(JSON.stringify({ type: 'authenticate', token: this.deviceToken }));
        });
        socket.addEventListener('message', (event) => {
          let message;
          try { message = JSON.parse(event.data); } catch { return; }
          if (message.type === 'status') {
            authenticated = true;
            this.everConnected = true;
            this.retryDelay = 500;
            this.setStatus('connected');
            this.flushPending();
            resolve(message);
          } else if (message.type === 'scan-accepted') {
            const pending = this.pending.get(message.scanId);
            if (pending) {
              clearTimeout(pending.timeout);
              this.pending.delete(message.scanId);
              pending.resolve(message);
            }
          } else if (message.type === 'scan-error') {
            const pending = this.pending.get(message.scanId);
            if (pending) {
              clearTimeout(pending.timeout);
              this.pending.delete(message.scanId);
              const error = new Error(message.message || 'The laptop rejected this scan.');
              error.status = message.message?.includes('moments ago') ? 409 : 400;
              pending.reject(error);
            }
          } else if (message.type === 'expired' || message.type === 'cancelled' || message.type === 'disconnected') {
            this.explicitDisconnect = true;
            sessionStorage.removeItem(`d365-device-token:${this.sessionId}`);
            this.setStatus(message.type === 'disconnected' ? 'disconnected' : 'expired');
            socket.close();
          }
        });
        socket.addEventListener('error', () => {
          if (initial && !authenticated) reject(new Error('Could not connect to the laptop. Check the hotspot, firewall, and HTTPS certificate.'));
        });
        socket.addEventListener('close', (event) => {
          if (this.socket === socket) this.socket = null;
          if (initial && !authenticated) {
            reject(new Error(event.code === 4401 ? 'Pairing session expired. Create a new QR on the laptop.' : 'Could not authenticate this phone. Pair it again from the laptop.'));
            return;
          }
          if (this.explicitDisconnect) {
            this.setStatus('disconnected');
            return;
          }
          if (event.code === 4401 || event.code === 4404) {
            this.explicitDisconnect = true;
            sessionStorage.removeItem(`d365-device-token:${this.sessionId}`);
            this.setStatus('expired');
            return;
          }
          this.setStatus('reconnecting');
          this.scheduleReconnect();
        });
      });
    }

    scheduleReconnect() {
      if (this.reconnectTimer || this.explicitDisconnect) return;
      const delay = this.retryDelay;
      this.retryDelay = Math.min(8_000, this.retryDelay * 2);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        void this.openSocket(false).catch(() => this.scheduleReconnect());
      }, delay);
    }

    flushPending() {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      for (const pending of this.pending.values()) {
        this.socket.send(JSON.stringify({ type: 'scan', scanId: pending.data.scanId, payload: pending.data.payload }));
      }
    }

    send(data) {
      if (this.status !== 'connected' && this.status !== 'reconnecting') return Promise.reject(new Error('Phone is not connected to the laptop.'));
      const existing = this.pending.get(data.scanId);
      if (existing) {
        this.flushPending();
        return existing.promise;
      }
      let resolvePending;
      let rejectPending;
      const promise = new Promise((resolve, reject) => { resolvePending = resolve; rejectPending = reject; });
      const timeout = setTimeout(() => {
        this.pending.delete(data.scanId);
        rejectPending(new Error('The laptop has not acknowledged this scan. Reconnect and retry.'));
      }, 60_000);
      this.pending.set(data.scanId, { data, resolve:resolvePending, reject:rejectPending, timeout, promise });
      this.flushPending();
      return promise;
    }

    async disconnect() {
      this.explicitDisconnect = true;
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'disconnect' }));
      }
      if (this.socket && this.socket.readyState !== WebSocket.CLOSED && this.socket.readyState !== WebSocket.CLOSING) {
        this.socket.close(1000, 'Disconnected');
      }
      sessionStorage.removeItem(`d365-device-token:${this.sessionId}`);
      this.deviceToken = '';
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Phone disconnected.'));
      }
      this.pending.clear();
      this.setStatus('disconnected');
    }

    onMessage(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
    getStatus() { return this.status; }

    setStatus(status) {
      this.status = status;
      for (const callback of this.listeners) callback({ type: 'status', status });
    }

    async request(path, options = {}) {
      const response = await fetch(path, {
        method: options.method || 'GET',
        credentials: 'same-origin',
        headers: options.body ? { 'Content-Type': 'application/json' } : {},
        ...(options.body ? { body: options.body } : {}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const error = new Error(body.error?.message || `Request failed (${response.status}).`);
        error.status = response.status;
        throw error;
      }
      return response.json();
    }
  }

  class ConnectionManager {
    constructor() { this.provider = new DeviceWebSocketProvider(); }
    register(provider) { this.provider = provider; }
    connect(_type, config) { return this.provider.connect(config); }
    send(data) { return this.provider.send(data); }
    disconnect() { return this.provider.disconnect(); }
    onMessage(callback) { return this.provider.onMessage(callback); }
    getStatus() { return this.provider.getStatus(); }
  }

  window.TouchDeviceConnection = { ConnectionManager, DeviceWebSocketProvider };
})();
