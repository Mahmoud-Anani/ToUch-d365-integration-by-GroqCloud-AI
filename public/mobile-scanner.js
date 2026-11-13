(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const isArabic = String(navigator.language || '').toLowerCase().startsWith('ar');
  const strings = isArabic ? {
    title:'ماسح QR للهاتف', subtitle:'يتم الاتصال بالكمبيوتر…', connecting:'جارٍ الاتصال', connected:'الهاتف متصل بالكمبيوتر', disconnected:'الهاتف غير متصل', reconnecting:'إعادة الاتصال بالكمبيوتر…',
    badPair:'رابط الاقتران غير صالح أو منتهي.', cameraOff:'الكاميرا متوقفة', cameraHelp:'اسمح بالوصول إلى الكاميرا لبدء المسح.',
    start:'بدء المسح', stop:'إيقاف', camera:'الكاميرا', light:'تشغيل الضوء', lightOff:'إيقاف الضوء', manual:'أدخل الرمز يدويًا',
    send:'إرسال', retry:'إعادة إرسال الرمز', latest:'آخر عملية مسح', none:'لم يتم مسح أي رمز بعد', disconnect:'فصل الهاتف',
    privacy:'سيتم إرسال المحتوى إلى الكمبيوتر المقترن. لن يتم فتح الروابط تلقائيًا.', permission:'تعذر الوصول إلى الكاميرا. اسمح بالإذن أو أدخل الرمز يدويًا.',
    noCamera:'لم يتم العثور على كاميرا. يمكنك إدخال الرمز يدويًا.', scanning:'وجّه الكاميرا نحو رمز QR.', sent:'تم إرسال الرمز إلى الكمبيوتر.',
    duplicate:'تم إرسال هذا الرمز مؤخرًا.', connectionError:'تعذر إرسال الرمز. تحقق من الاتصال ثم أعد المحاولة.', expired:'انتهت جلسة الاتصال. أعد الاقتران من الكمبيوتر.',
    invalid:'الرمز فارغ أو أطول من الحد المسموح.',
  } : {
    title:'Mobile QR scanner', subtitle:'Connecting to your laptop…', connecting:'Connecting', connected:'Phone connected to your laptop', disconnected:'Phone disconnected', reconnecting:'Reconnecting to laptop…',
    badPair:'Pairing link is invalid or expired.', cameraOff:'Camera is off', cameraHelp:'Allow camera access to begin scanning.', start:'Start scanning',
    stop:'Stop', camera:'Camera', light:'Turn on light', lightOff:'Turn off light', manual:'Enter code manually', send:'Send',
    retry:'Retry sending scan', latest:'Latest scan', none:'No code scanned yet', disconnect:'Disconnect phone',
    privacy:'Scanned content is sent to your paired laptop. Links are never opened automatically.', permission:'Camera access failed. Allow it in browser settings or enter the code manually.',
    noCamera:'No camera found. You can enter the code manually.', scanning:'Point the camera at a QR code.', sent:'Code sent to your laptop.',
    duplicate:'This code was sent recently.', connectionError:'Could not send the code. Check the connection and retry.', expired:'Connection session expired. Pair again from your laptop.',
    invalid:'Code is empty or longer than allowed.',
  };

  const ui = {
    status:$('connection-status'), video:$('camera-preview'), placeholder:$('camera-placeholder'), feedback:$('feedback'),
    start:$('camera-start'), stop:$('camera-stop'), select:$('camera-select'), cameraLabel:$('camera-label'), torch:$('torch-toggle'),
    manualForm:$('manual-form'), manual:$('manual-code'), retry:$('retry-send'), last:$('last-value'), disconnect:$('disconnect'),
  };
  const sessionId = location.pathname.split('/').filter(Boolean).at(-1) || '';
  const tokenKey = `d365-device-token:${sessionId}`;
  let manager;
  let scanner;
  let pendingScan;
  let cameras = [];
  let torchOn = false;

  function setText() {
    document.documentElement.lang = isArabic ? 'ar' : 'en';
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
    $('title').textContent = strings.title;
    $('subtitle').textContent = strings.subtitle;
    ui.status.textContent = strings.connecting;
    ui.placeholder.textContent = strings.cameraOff;
    ui.feedback.textContent = strings.cameraHelp;
    ui.start.textContent = strings.start;
    ui.stop.textContent = strings.stop;
    ui.cameraLabel.textContent = strings.camera;
    ui.torch.textContent = strings.light;
    $('manual-label').textContent = strings.manual;
    $('manual-form').querySelector('button').textContent = strings.send;
    $('last-label').textContent = strings.latest;
    ui.last.textContent = strings.none;
    ui.retry.textContent = strings.retry;
    ui.disconnect.textContent = strings.disconnect;
    $('privacy-note').textContent = strings.privacy;
  }

  function setConnectionStatus(status) {
    if (status === 'connected') {
      ui.status.textContent = strings.connected;
      ui.status.className = 'connection-status connected';
    } else if (status === 'reconnecting' || status === 'connecting') {
      ui.status.textContent = strings.reconnecting;
      ui.status.className = 'connection-status';
    } else if (status === 'disconnected') {
      ui.status.textContent = strings.disconnected;
      ui.status.className = 'connection-status';
    } else if (status === 'expired') {
      ui.status.textContent = strings.expired;
      ui.status.className = 'connection-status error';
    }
  }

  async function connect() {
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error(strings.badPair);
    const params = new URLSearchParams(location.hash.slice(1));
    const pairingToken = params.get('pair') || '';
    if (!pairingToken && !sessionStorage.getItem(tokenKey)) throw new Error(strings.badPair);
    const providers = window.TouchDeviceConnection;
    if (!providers || !window.TouchQrScanner) throw new Error('Scanner components are unavailable. Reload this page.');
    manager = new providers.ConnectionManager();
    manager.register(new providers.DeviceWebSocketProvider());
    const statusListener = manager.onMessage((message) => {
      if (message.type === 'status') setConnectionStatus(message.status);
      if (message.type === 'status' && ['disconnected', 'expired'].includes(message.status)) scanner?.stop();
    });
    void statusListener;
    await manager.connect('qr-session', {
      sessionId,
      pairingToken,
      deviceLabel:navigator.userAgent.slice(0,80),
    });
    if (pairingToken) history.replaceState(null, '', location.pathname);
    setConnectionStatus(manager.getStatus());
    scanner = new window.TouchQrScanner({
      video:ui.video,
      onResult:(result) => { void sendScan(result); },
      onStatus:(status) => {
        if (status === 'scanning') {
          ui.feedback.textContent = strings.scanning;
          ui.placeholder.hidden = true;
          ui.start.hidden = true;
          ui.stop.hidden = false;
        } else if (status === 'stopped') {
          ui.placeholder.hidden = false;
          ui.start.hidden = false;
          ui.stop.hidden = true;
          ui.torch.hidden = true;
        }
      },
    });
  }

  async function sendScan(result) {
    if (pendingScan && pendingScan.scanId !== result.id) return;
    pendingScan = pendingScan || { scanId:result.id, payload:result.payload };
    ui.last.textContent = result.payload;
    ui.retry.hidden = true;
    try {
      await manager.send(pendingScan);
      pendingScan = undefined;
      ui.feedback.textContent = strings.sent;
      ui.manual.value = '';
    } catch (error) {
      if (error.status === 409) {
        pendingScan = undefined;
        ui.feedback.textContent = strings.duplicate;
      } else if (error.status === 403 || error.status === 404) {
        ui.status.textContent = strings.expired;
        ui.status.className = 'connection-status error';
        scanner.stop();
      } else if (['disconnected', 'expired'].includes(manager.getStatus())) {
        ui.status.textContent = manager.getStatus() === 'expired' ? strings.expired : strings.disconnected;
        ui.status.className = 'connection-status error';
        ui.retry.hidden = true;
        scanner.stop();
      } else {
        ui.feedback.textContent = strings.connectionError;
        ui.retry.hidden = false;
      }
    }
  }

  async function startCamera(deviceId) {
    if (!scanner) return;
    try {
      if (!cameras.length) cameras = await scanner.listCameras();
      if (!deviceId) {
        const rear = cameras.find((camera) => /back|rear|environment/i.test(camera.label));
        deviceId = rear?.deviceId || cameras.at(-1)?.deviceId;
      }
      if (!cameras.length) throw new Error('NotFoundError');
      if (cameras.length > 1) {
        ui.select.replaceChildren(...cameras.map((camera,index) => {
          const option = document.createElement('option');
          option.value = camera.deviceId;
          option.textContent = camera.label || `${strings.camera} ${index + 1}`;
          return option;
        }));
        ui.select.value = deviceId || cameras[0].deviceId;
        ui.select.hidden = false;
        ui.cameraLabel.hidden = false;
      }
      await scanner.start(deviceId);
      const track = ui.video.srcObject?.getVideoTracks?.()[0];
      ui.torch.hidden = !track?.getCapabilities?.().torch;
    } catch (error) {
      ui.feedback.textContent = error?.name === 'NotFoundError' ? strings.noCamera : strings.permission;
      ui.start.hidden = false;
      ui.stop.hidden = true;
    }
  }

  ui.start.addEventListener('click',() => { void startCamera(ui.select.value || undefined); });
  ui.stop.addEventListener('click',() => scanner?.stop());
  ui.select.addEventListener('change',() => { void startCamera(ui.select.value); });
  ui.torch.addEventListener('click',async () => {
    try {
      torchOn = !torchOn;
      if (!(await scanner.toggleTorch(torchOn))) throw new Error('Torch unavailable');
      ui.torch.textContent = torchOn ? strings.lightOff : strings.light;
    } catch {
      torchOn = false;
      ui.torch.hidden = true;
    }
  });
  ui.manualForm.addEventListener('submit',(event) => {
    event.preventDefault();
    if (scanner) void sendScan({ id:scanner.createId(), payload:ui.manual.value, scannedAt:new Date().toISOString(), format:'MANUAL' });
  });
  ui.retry.addEventListener('click',() => { if (pendingScan) void sendScan({ id:pendingScan.scanId, payload:pendingScan.payload }); });
  ui.disconnect.addEventListener('click',async () => {
    scanner?.stop();
    await manager?.disconnect();
    sessionStorage.removeItem(tokenKey);
    setConnectionStatus('disconnected');
    ui.feedback.textContent = strings.disconnect;
    ui.start.disabled = true;
    ui.manual.disabled = true;
  });
  window.addEventListener('pagehide',() => scanner?.stop(),{once:true});

  setText();
  connect().catch((error) => {
    ui.status.textContent = error.message || strings.badPair;
    ui.status.className = 'connection-status error';
    ui.feedback.textContent = error.message || strings.badPair;
    ui.start.disabled = true;
    ui.manual.disabled = true;
  });
})();
