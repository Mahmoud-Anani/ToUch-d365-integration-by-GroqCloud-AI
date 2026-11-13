(() => {
  'use strict';

  class QrScanner {
    constructor(options = {}) {
      this.video = options.video;
      this.onResult = options.onResult || (() => undefined);
      this.onStatus = options.onStatus || (() => undefined);
      this.reader = null;
      this.controls = null;
      this.lastPayload = '';
      this.lastPayloadAt = 0;
      this.duplicateWindowMs = options.duplicateWindowMs || 2_000;
      this.cameras = [];
    }

    async listCameras() {
      if (!window.ZXingBrowser?.BrowserMultiFormatReader) throw new Error('QR reader is unavailable.');
      this.reader = this.reader || new window.ZXingBrowser.BrowserMultiFormatReader();
      this.cameras = await this.reader.listVideoInputDevices();
      return this.cameras;
    }

    async start(deviceId) {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access requires HTTPS on this device.');
      }
      if (!window.ZXingBrowser?.BrowserMultiFormatReader) throw new Error('QR reader is unavailable.');
      this.stop();
      this.reader = this.reader || new window.ZXingBrowser.BrowserMultiFormatReader();
      try {
        this.controls = await this.reader.decodeFromVideoDevice(deviceId, this.video, (result) => {
          if (!result) return;
          const payload = result.getText().trim();
          if (!payload || new TextEncoder().encode(payload).length > 2_048) return;
          const now = Date.now();
          if (payload === this.lastPayload && now - this.lastPayloadAt < this.duplicateWindowMs) return;
          this.lastPayload = payload;
          this.lastPayloadAt = now;
          this.onResult({ id: this.createId(), payload, scannedAt: new Date(now).toISOString(), format: String(result.getBarcodeFormat?.() || 'QR_CODE') });
        });
        this.onStatus('scanning');
        return this.controls;
      } catch (error) {
        this.stop();
        this.onStatus('error');
        throw error;
      }
    }

    async setCamera(deviceId) { return this.start(deviceId); }

    async toggleTorch(enabled) {
      const track = this.video.srcObject?.getVideoTracks?.()[0];
      const capabilities = track?.getCapabilities?.();
      if (!capabilities?.torch) return false;
      await track.applyConstraints({ advanced: [{ torch: enabled }] });
      return true;
    }

    stop() {
      if (this.controls) this.controls.stop();
      this.controls = null;
      if (this.video?.srcObject) {
        this.video.srcObject.getTracks().forEach((track) => track.stop());
        this.video.srcObject = null;
      }
      this.onStatus('stopped');
    }

    createId() {
      if (crypto.randomUUID) return crypto.randomUUID().replaceAll('-', '');
      return Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  }

  window.TouchQrScanner = QrScanner;
})();
