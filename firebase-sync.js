import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import {
  getDatabase,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
  update
} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-database.js';

import {
  firebaseConfig,
  labScanConfig,
  isFirebaseConfigured
} from './firebase-config.js?v=12.4';

const desktopView = document.getElementById('desktopView');
const mobileView = document.getElementById('mobileView');
const configView = document.getElementById('configView');
const desktopStatus = document.getElementById('desktopStatus');
const mobileStatus = document.getElementById('mobileStatus');
const desktopOutput = document.getElementById('desktopOutput');
const copyDesktopButton = document.getElementById('copyDesktopButton');
const qrCode = document.getElementById('qrCode');
const desktopPairCode = document.getElementById('desktopPairCode');
const mobilePairCode = document.getElementById('mobilePairCode');
const compactModeButton = document.getElementById('compactModeButton');
const expandedModeButton = document.getElementById('expandedModeButton');
const abbreviatedModeButton = document.getElementById('abbreviatedModeButton');
const completeModeButton = document.getElementById('completeModeButton');
const normalCaseButton = document.getElementById('normalCaseButton');
const uppercaseModeButton = document.getElementById('uppercaseModeButton');

const params = new URLSearchParams(location.search);
const requestedSessionId = sanitizeSessionId(params.get('session'));
const isMobileSession = Boolean(requestedSessionId);

let app;
let auth;
let db;
let currentUser = null;
let currentSessionRef = null;
let currentSessionId = null;
let pendingResult = '';
let stopSessionListener = null;
let cleanupTimer = null;
let desktopParsedResult = null;
let desktopFallbackText = '';

const formatPreferences = loadFormatPreferences();

function loadFormatPreferences() {
  const defaults = { layout: 'compact', abbreviations: true, uppercase: false };
  try {
    const saved = JSON.parse(localStorage.getItem('labscan-format-v1') || 'null');
    if (!saved || typeof saved !== 'object') return defaults;
    return {
      layout: saved.layout === 'expanded' ? 'expanded' : 'compact',
      abbreviations: saved.abbreviations !== false,
      uppercase: saved.uppercase === true,
    };
  } catch (_) {
    return defaults;
  }
}

function saveFormatPreferences() {
  try {
    localStorage.setItem('labscan-format-v1', JSON.stringify(formatPreferences));
  } catch (_) {}
}

function setToggleState(button, active) {
  if (!button) return;
  button.classList.toggle('is-active', active);
  button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

function syncFormatControls() {
  setToggleState(compactModeButton, formatPreferences.layout === 'compact');
  setToggleState(expandedModeButton, formatPreferences.layout === 'expanded');
  setToggleState(abbreviatedModeButton, formatPreferences.abbreviations);
  setToggleState(completeModeButton, !formatPreferences.abbreviations);
  setToggleState(normalCaseButton, !formatPreferences.uppercase);
  setToggleState(uppercaseModeButton, formatPreferences.uppercase);
}

function renderDesktopResult() {
  let text = desktopFallbackText || '';

  if (desktopParsedResult && window.LabParser?.formatLabResults) {
    text = window.LabParser.formatLabResults(desktopParsedResult, {
      layout: formatPreferences.layout,
      abbreviations: formatPreferences.abbreviations,
      uppercase: formatPreferences.uppercase,
      shortSections: formatPreferences.layout === 'compact',
    });
  } else if (formatPreferences.uppercase && text) {
    text = text.toLocaleUpperCase('es-MX');
  }

  desktopOutput.value = text;
  copyDesktopButton.disabled = !text.trim();
}

function serializeLabResult(detail = {}) {
  const text = String(detail.text || '').trim();
  if (!text) return '';

  if (detail.parsed && typeof detail.parsed === 'object') {
    try {
      return JSON.stringify({
        kind: 'labscan-result',
        version: 1,
        text,
        parsed: detail.parsed,
      });
    } catch (_) {}
  }

  return text;
}

function readLabResult(payload) {
  const raw = String(payload || '');
  if (!raw) return { text: '', parsed: null };

  if (raw[0] === '{') {
    try {
      const decoded = JSON.parse(raw);
      if (decoded?.kind === 'labscan-result' && decoded.parsed && typeof decoded.parsed === 'object') {
        return {
          text: String(decoded.text || ''),
          parsed: decoded.parsed,
        };
      }
    } catch (_) {}
  }

  return { text: raw, parsed: null };
}

function sanitizeSessionId(value) {
  if (!value) return '';
  return /^[A-Za-z0-9_-]{20,64}$/.test(value) ? value : '';
}

function showOnly(view) {
  desktopView.hidden = view !== desktopView;
  mobileView.hidden = view !== mobileView;
  configView.hidden = view !== configView;
}

function setDesktopStatus(text) {
  if (desktopStatus) desktopStatus.textContent = text;
}

function setMobileStatus(text) {
  if (mobileStatus) mobileStatus.textContent = text;
}

function randomSessionId() {
  // 18 bytes = 144 bits de entropía. El ID del QR funciona como secreto de emparejamiento.
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// Código visual de 4 dígitos derivado del ID de sesión. No es una credencial:
// sirve únicamente para que el usuario confirme que PC y móvil muestran el mismo vínculo.
function pairCodeFromSession(sessionId) {
  let hash = 2166136261;
  for (let i = 0; i < sessionId.length; i++) {
    hash ^= sessionId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const code = 1000 + ((hash >>> 0) % 9000);
  return String(code);
}

function showPairCode(element, sessionId) {
  if (!element || !sessionId) return;
  element.textContent = `Código ${pairCodeFromSession(sessionId)}`;
  element.hidden = false;
}

function waitForAuthUser() {
  return new Promise((resolve, reject) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, user => {
      if (!user) return;
      unsubscribe();
      resolve(user);
    }, error => {
      unsubscribe();
      reject(error);
    });
  });
}

async function ensureAnonymousAuth() {
  if (auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth);
  return waitForAuthUser();
}

function renderQr(url) {
  qrCode.innerHTML = '';

  if (typeof window.QRCode !== 'function') {
    const link = document.createElement('a');
    link.href = url;
    link.textContent = 'Abrir vínculo móvil';
    link.style.color = '#000';
    link.style.wordBreak = 'break-all';
    qrCode.appendChild(link);
    return;
  }

  new window.QRCode(qrCode, {
    text: url,
    width: 280,
    height: 280,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: window.QRCode.CorrectLevel.M
  });
}

function buildMobileUrl(sessionId) {
  const url = new URL(labScanConfig.appUrl);
  url.searchParams.set('session', sessionId);
  return url.toString();
}

function firebaseMessage(error) {
  const code = String(error?.code || '');
  if (code.includes('permission-denied')) {
    return 'Firebase rechazó el acceso. Revisa Authentication y las reglas de Realtime Database.';
  }
  if (code.includes('auth/operation-not-allowed')) {
    return 'La autenticación anónima no está habilitada en Firebase.';
  }
  if (code.includes('auth/unauthorized-domain')) {
    return 'Este dominio no está autorizado en Firebase Authentication.';
  }
  return error?.message || 'Error de Firebase.';
}

async function initDesktop() {
  showOnly(desktopView);
  setDesktopStatus('Creando sesión…');

  currentUser = await ensureAnonymousAuth();
  currentSessionId = randomSessionId();
  currentSessionRef = ref(db, `sessions/${currentSessionId}`);

  const now = Date.now();
  const minutes = Math.max(5, Number(labScanConfig.sessionMinutes) || 30);
  const expiresAt = now + minutes * 60_000;

  await set(currentSessionRef, {
    ownerUid: currentUser.uid,
    createdAt: now,
    expiresAt,
    status: 'waiting',
    updatedAt: serverTimestamp()
  });

  // No usamos onDisconnect().remove(): una pérdida breve de red no debe matar
  // el vínculo durante una guardia. La sesión deja de ser accesible al expirar.
  const cleanupDelay = Math.max(1000, expiresAt - Date.now() - 1000);
  cleanupTimer = setTimeout(() => {
    remove(currentSessionRef).catch(() => {});
  }, cleanupDelay);

  renderQr(buildMobileUrl(currentSessionId));
  showPairCode(desktopPairCode, currentSessionId);
  setDesktopStatus('Escanea el QR con el teléfono');

  stopSessionListener = onValue(currentSessionRef, snapshot => {
    const data = snapshot.val();

    if (!data) {
      setDesktopStatus('Sesión cerrada');
      return;
    }

    if (data.formattedText) {
      const incoming = readLabResult(data.formattedText);
      desktopFallbackText = incoming.text;
      desktopParsedResult = incoming.parsed;
      renderDesktopResult();
    }

    if (data.status === 'result') {
      setDesktopStatus('Datos recibidos');
    } else if (data.mobileUid) {
      setDesktopStatus('Teléfono vinculado');
    } else {
      setDesktopStatus('Escanea el QR con el teléfono');
    }
  }, error => {
    console.error(error);
    setDesktopStatus(firebaseMessage(error));
  });
}

async function claimMobileSession() {
  showOnly(mobileView);
  setMobileStatus('Vinculando con el PC…');

  currentUser = await ensureAnonymousAuth();
  currentSessionId = requestedSessionId;
  currentSessionRef = ref(db, `sessions/${currentSessionId}`);

  // Las reglas hacen este reclamo atómico: si otro UID ya vinculó la sesión,
  // Firebase rechaza la escritura.
  await update(currentSessionRef, {
    mobileUid: currentUser.uid,
    status: 'linked',
    updatedAt: serverTimestamp()
  });

  showPairCode(mobilePairCode, currentSessionId);
  setMobileStatus('Vinculado al PC');

  stopSessionListener = onValue(currentSessionRef, snapshot => {
    const data = snapshot.val();
    if (!data) {
      setMobileStatus('La sesión ya no está disponible. Genera un QR nuevo en el PC.');
      return;
    }
    if (Date.now() > Number(data.expiresAt || 0)) {
      setMobileStatus('La sesión expiró. Genera un QR nuevo en el PC.');
    }
  }, error => {
    console.error(error);
    setMobileStatus(firebaseMessage(error));
  });

  if (pendingResult) {
    const text = pendingResult;
    pendingResult = '';
    await sendResultToPc(text);
  }
}

async function sendResultToPc(text) {
  const clean = String(text || '').trim();
  if (!clean) return;

  if (!currentSessionRef || !currentUser || !isMobileSession) {
    pendingResult = clean;
    return;
  }

  setMobileStatus('Enviando al PC…');
  window.dispatchEvent(new CustomEvent('labscan:sync-state', { detail: { state: 'sending' } }));
  try {
    await update(currentSessionRef, {
      formattedText: clean,
      status: 'result',
      updatedAt: serverTimestamp()
    });
    setMobileStatus('Enviado al PC');
    window.dispatchEvent(new CustomEvent('labscan:sync-state', { detail: { state: 'sent' } }));
  } catch (error) {
    console.error(error);
    const message = firebaseMessage(error);
    setMobileStatus(message);
    window.dispatchEvent(new CustomEvent('labscan:sync-state', { detail: { state: 'error', message } }));
  }
}

window.addEventListener('labscan:result', event => {
  const payload = serializeLabResult(event.detail || {});
  if (payload) sendResultToPc(payload);
});

compactModeButton?.addEventListener('click', () => {
  formatPreferences.layout = 'compact';
  saveFormatPreferences();
  syncFormatControls();
  renderDesktopResult();
});

expandedModeButton?.addEventListener('click', () => {
  formatPreferences.layout = 'expanded';
  saveFormatPreferences();
  syncFormatControls();
  renderDesktopResult();
});

abbreviatedModeButton?.addEventListener('click', () => {
  formatPreferences.abbreviations = true;
  saveFormatPreferences();
  syncFormatControls();
  renderDesktopResult();
});

completeModeButton?.addEventListener('click', () => {
  formatPreferences.abbreviations = false;
  saveFormatPreferences();
  syncFormatControls();
  renderDesktopResult();
});

normalCaseButton?.addEventListener('click', () => {
  formatPreferences.uppercase = false;
  saveFormatPreferences();
  syncFormatControls();
  renderDesktopResult();
});

uppercaseModeButton?.addEventListener('click', () => {
  formatPreferences.uppercase = true;
  saveFormatPreferences();
  syncFormatControls();
  renderDesktopResult();
});

copyDesktopButton?.addEventListener('click', async () => {
  const text = desktopOutput.value.trim();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    const original = copyDesktopButton.textContent;
    copyDesktopButton.textContent = 'Copiado';
    setTimeout(() => { copyDesktopButton.textContent = original; }, 1000);
  } catch (_) {
    desktopOutput.focus();
    desktopOutput.select();
    document.execCommand('copy');
  }
});

async function start() {
  syncFormatControls();

  if (!isFirebaseConfigured()) {
    showOnly(configView);
    return;
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);

  try {
    if (isMobileSession) await claimMobileSession();
    else await initDesktop();
  } catch (error) {
    console.error(error);
    if (isMobileSession) {
      showOnly(mobileView);
      setMobileStatus(firebaseMessage(error));
    } else {
      showOnly(desktopView);
      setDesktopStatus(firebaseMessage(error));
    }
  }
}

window.addEventListener('pagehide', () => {
  if (stopSessionListener) stopSessionListener();
  if (cleanupTimer) clearTimeout(cleanupTimer);
});

start();
