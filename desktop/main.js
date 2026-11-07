/**
 * NEXORA für den Mac (Electron).
 *
 * Die App selbst ist dieselbe Expo-App wie auf iPhone/Android – für den Mac
 * wird ihre Web-Version (Ordner dist/, erzeugt mit `expo export`) in einem
 * eigenen Fenster geöffnet.
 *
 * Start:  npm run mac
 * Mit Live-Neuladen beim Entwickeln: erst `npm run web`, dann in einem
 * zweiten Terminal `npm run mac:dev`.
 */
const { app, BrowserWindow, ipcMain, net, protocol, session, shell, ShareMenu, systemPreferences } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const DEV_URL = process.env.NEXORA_DEV_URL; // z. B. http://localhost:8081
const APP_URL = 'app://nexora/';

// App ist deutsch: Datums- und Zahlenformate (z. B. im Kalender) auf Deutsch
app.commandLine.appendSwitch('lang', 'de-DE');

// Eigene Adresse "app://" statt file://, damit die Web-App ihre Dateien
// über normale Pfade (/_expo/...) laden kann.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function serveDist(request) {
  const { pathname } = new URL(request.url);
  let filePath = path.normalize(path.join(DIST_DIR, decodeURIComponent(pathname)));
  // Nur Dateien aus dist/ ausliefern
  if (!filePath.startsWith(DIST_DIR)) {
    return new Response('Not found', { status: 404 });
  }
  // Unbekannte Pfade (z. B. /login) -> App-Startseite, die Navigation übernimmt die App
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }
  return net.fetch(pathToFileURL(filePath).toString());
}

// ---------------------------------------------------------------------------
// Angebote/Rechnungen verschicken: PDF in Downloads/NEXORA ablegen, dann
// - E-Mail ("mail"): neue E-Mail in Apple Mail mit Empfänger, Betreff, Text
//   und dem PDF als Anhang. Klappt das nicht (anderes Mail-Programm, keine
//   Erlaubnis), wie "open": mailto: öffnen und das PDF im Finder zeigen.
// - WhatsApp ("open"): Link öffnen, PDF im Finder zeigen (zum Reinziehen).
// - "share": Teilen-Menü des Mac mit dem PDF als Anhang.
// ---------------------------------------------------------------------------
const MAX_PDF_BYTES = 20 * 1024 * 1024;

// Werte kommen als Argumente (argv) – nie in den Skript-Text eingesetzt.
const MAIL_SCRIPT = `
on run argv
  set theRecipients to item 1 of argv
  set theSubject to item 2 of argv
  set theBody to item 3 of argv
  set theFile to (POSIX file (item 4 of argv)) as alias
  set theSender to item 5 of argv
  tell application "Mail"
    -- Absender: nur wenn ein Konto in Mail diese Adresse hat (sonst Standard-Konto)
    set senderOk to false
    if theSender is not "" then
      repeat with acc in every account
        if (email addresses of acc) contains theSender then set senderOk to true
      end repeat
    end if
    set newMessage to make new outgoing message with properties {subject:theSubject, content:theBody & return & return}
    tell newMessage
      if senderOk then set sender to theSender
      set visible to true
      set AppleScript's text item delimiters to ","
      repeat with addr in (text items of theRecipients)
        if (contents of addr) is not "" then make new to recipient at end of to recipients with properties {address:(contents of addr)}
      end repeat
      set AppleScript's text item delimiters to ""
      make new attachment with properties {file name:theFile} at after the last paragraph
    end tell
    activate
  end tell
  if theSender is not "" and not senderOk then return "ok-nosender"
  return "ok"
end run
`;

/** mailto:adresse?subject=…&body=… -> Teile */
function parseMailto(url) {
  const m = /^mailto:([^?]*)(?:\?(.*))?$/i.exec(String(url));
  if (!m) return null;
  const params = new URLSearchParams((m[2] ?? '').replace(/\+/g, '%2B'));
  const to = decodeURIComponent(m[1])
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[^\s@<>"]+@[^\s@<>"]+$/.test(s));
  return { to, subject: params.get('subject') ?? '', body: (params.get('body') ?? '').replace(/\r\n/g, '\n') };
}

/**
 * Neue E-Mail in Apple Mail mit Anhang, wenn möglich vom Konto mit der
 * Absender-Adresse `from`. Ergebnis: { ok, senderMissing } oder { problem }.
 */
function composeInAppleMail(mail, filePath, from) {
  if (process.platform !== 'darwin') return Promise.resolve({ problem: 'not_mac' });
  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', MAIL_SCRIPT, mail.to.join(','), mail.subject, mail.body, filePath, from],
      // Beim ersten Mal fragt der Mac, ob NEXORA Mail steuern darf – Zeit lassen
      { timeout: 120000 },
      (error, stdout, stderr) => {
        const out = String(stdout).trim();
        if (!error && (out === 'ok' || out === 'ok-nosender')) return resolve({ ok: true, senderMissing: out === 'ok-nosender' });
        const detail = `${error?.message ?? ''} ${stderr ?? ''}`;
        console.warn('[Mail]', detail);
        resolve({ problem: /-1743|not allowed|nicht erlaubt/i.test(detail) ? 'not_allowed' : 'failed' });
      },
    );
  });
}

function fromApp(event) {
  const url = event.senderFrame?.url ?? '';
  return url.startsWith(APP_URL) || (!!DEV_URL && url.startsWith(DEV_URL));
}

function safeFileName(name) {
  const base = path.basename(String(name || 'Dokument')).replace(/[^\w.\-äöüÄÖÜß ]+/g, '_').slice(0, 120);
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

const allowedUrl = (url) => typeof url === 'string' && (url.startsWith('mailto:') || url.startsWith('https://wa.me/'));

ipcMain.handle('nexora:send-file', async (event, payload) => {
  if (!fromApp(event)) throw new Error('Nicht erlaubt');
  const { bytes, fileName, via, url, text, from } = payload ?? {};
  if (!ArrayBuffer.isView(bytes) || bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error('Ungültige Datei');
  }
  if (via === 'open' && !allowedUrl(url)) throw new Error('Ungültiger Link');
  if (via === 'mail' && !(typeof url === 'string' && url.startsWith('mailto:'))) throw new Error('Ungültiger Link');
  if (via !== 'open' && via !== 'share' && via !== 'mail') throw new Error('Unbekannte Aktion');

  const dir = path.join(app.getPath('downloads'), 'NEXORA');
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, safeFileName(fileName));
  await fs.promises.writeFile(filePath, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));

  if (via === 'share') {
    if (process.platform !== 'darwin' || !ShareMenu) throw new Error('Teilen gibt es nur auf dem Mac');
    const item = { filePaths: [filePath] };
    if (text) item.texts = [String(text)];
    const menu = new ShareMenu(item);
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) ?? undefined });
    return { filePath };
  }
  if (via === 'mail') {
    const mail = parseMailto(url);
    const sender = typeof from === 'string' && /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/.test(from.trim()) ? from.trim() : '';
    const result = mail ? await composeInAppleMail(mail, filePath, sender) : { problem: 'failed' };
    if (result.ok) return { filePath, attached: true, senderMissing: result.senderMissing };
    await shell.openExternal(url);
    shell.showItemInFolder(filePath);
    return { filePath, attached: false, reason: result.problem };
  }
  await shell.openExternal(url);
  shell.showItemInFolder(filePath);
  return { filePath };
});

// ---------------------------------------------------------------------------
// Termin in den Kalender: .ics-Datei in Downloads/NEXORA ablegen und mit dem
// Kalender des Mac öffnen (der fragt dann, in welchen Kalender).
// ---------------------------------------------------------------------------
const MAX_ICS_BYTES = 1024 * 1024;

function safeIcsName(name) {
  const base = path.basename(String(name || 'Termin')).replace(/[^\w.\-äöüÄÖÜß ]+/g, '_').slice(0, 120);
  return base.toLowerCase().endsWith('.ics') ? base : `${base}.ics`;
}

ipcMain.handle('nexora:open-calendar-file', async (event, payload) => {
  if (!fromApp(event)) throw new Error('Nicht erlaubt');
  const { text, fileName } = payload ?? {};
  if (typeof text !== 'string' || !text.startsWith('BEGIN:VCALENDAR') || Buffer.byteLength(text, 'utf8') > MAX_ICS_BYTES) {
    throw new Error('Ungültige Kalender-Datei');
  }
  const dir = path.join(app.getPath('downloads'), 'NEXORA');
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, safeIcsName(fileName));
  await fs.promises.writeFile(filePath, text, 'utf8');
  const problem = await shell.openPath(filePath);
  if (problem) throw new Error(problem);
  return { filePath };
});

// ---------------------------------------------------------------------------
// Mikrofon (Sprachmodus von Nexy): nur für die App selbst und nur Ton.
// Auf dem Mac fragt das System beim ersten Mal nach der Erlaubnis.
// ---------------------------------------------------------------------------
function isAppUrl(url) {
  return typeof url === 'string' && (url.startsWith(APP_URL) || (!!DEV_URL && url.startsWith(DEV_URL)));
}

ipcMain.handle('nexora:ask-microphone', async (event) => {
  if (!fromApp(event)) throw new Error('Nicht erlaubt');
  if (process.platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  if (status === 'denied' || status === 'restricted') return false;
  return systemPreferences.askForMediaAccess('microphone');
});

function allowPermission(permission, url, details = {}) {
  if (!isAppUrl(url)) return false;
  if (permission === 'media') {
    // nur Mikrofon, keine Kamera
    if (Array.isArray(details.mediaTypes)) return details.mediaTypes.length > 0 && details.mediaTypes.every((t) => t === 'audio');
    return details.mediaType !== 'video';
  }
  return true;
}

// ---------------------------------------------------------------------------
// TikTok/Instagram verbinden: Anmeldung in einem eigenen Fenster (ohne Zugriff
// auf die App). Sobald die Anmeldeseite zur Rückleitungs-Adresse der
// Server-Funktion "social" weiterleitet, wird das Fenster geschlossen und die
// Adresse (mit Code) an die App gegeben.
// ---------------------------------------------------------------------------
const AUTH_HOSTS = ['www.tiktok.com', 'www.instagram.com'];
const AUTH_PARTITION = 'persist:nexora-social-login';
let authWindow = null;

function validAuthUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && AUTH_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

function validCallbackUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.search && !u.hash && u.pathname === '/functions/v1/social/callback';
  } catch {
    return false;
  }
}

ipcMain.handle('nexora:open-auth-window', async (event, options) => {
  if (!fromApp(event)) throw new Error('Nicht erlaubt');
  const { url, callbackUrl } = options ?? {};
  if (!validAuthUrl(url)) throw new Error('Ungültige Anmeldeseite');
  if (!validCallbackUrl(callbackUrl)) throw new Error('Ungültige Rückleitung');
  if (authWindow && !authWindow.isDestroyed()) authWindow.close();

  const ses = session.fromPartition(AUTH_PARTITION);
  // Die Anmeldeseite braucht weder Mikrofon noch Kamera noch sonstige Rechte
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  return new Promise((resolve) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent,
      title: 'Anmelden',
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      webPreferences: { partition: AUTH_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    authWindow = win;
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      ses.webRequest.onBeforeRequest(null);
      if (authWindow === win) authWindow = null;
      resolve(result);
      if (!win.isDestroyed()) win.close();
    };
    const isCallback = (target) => typeof target === 'string' && target.startsWith(callbackUrl);
    // Rückleitung abfangen – egal ob per Weiterleitung, Link oder Skript
    ses.webRequest.onBeforeRequest({ urls: [`${callbackUrl}*`] }, (details, callback) => {
      callback({ cancel: true });
      finish({ url: details.url });
    });
    const onNavigate = (e, legacyUrl) => {
      const target = e?.url ?? legacyUrl;
      if (isCallback(target)) {
        e.preventDefault();
        finish({ url: target });
      }
    };
    win.webContents.on('will-redirect', onNavigate);
    win.webContents.on('will-navigate', onNavigate);
    // z. B. "Mit Google anmelden" öffnet ein eigenes Fenster – ebenfalls ohne Zugriff auf die App
    win.webContents.setWindowOpenHandler(() => ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: win,
        webPreferences: { partition: AUTH_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
      },
    }));
    win.on('closed', () => finish({ cancelled: true }));
    win.loadURL(url).catch(() => {
      // Laden abgebrochen (z. B. weil die Rückleitung abgefangen wurde) – nichts zu tun
    });
  });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: 'NEXORA',
    backgroundColor: '#000000',
    // Mac: keine graue Titelleiste, die Fensterknöpfe liegen direkt auf dem schwarzen Hintergrund
    titleBarStyle: 'hiddenInset',
    // Startet im Vollbild (grüner Knopf / Ctrl+Cmd+F schaltet zurück aufs normale Fenster)
    fullscreen: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Ohne Titelleiste: Fenster über den oberen Rand verschiebbar machen
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(
      'body::before{content:"";position:fixed;top:0;left:0;right:0;height:28px;' +
        '-webkit-app-region:drag;z-index:2147483647}',
    );
  });

  // Links nach außen im normalen Browser öffnen, nicht in der App
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL(DEV_URL || APP_URL);
}

app.whenReady().then(() => {
  if (!DEV_URL) {
    if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
      console.error('Kein Build gefunden. Bitte `npm run mac` verwenden (baut die App vorher).');
      app.quit();
      return;
    }
    protocol.handle('app', serveDist);
  }
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) =>
    callback(allowPermission(permission, details?.requestingUrl, details)),
  );
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin, details) =>
    allowPermission(permission, details?.requestingUrl || (origin ? `${origin}/` : ''), details),
  );
  createWindow();

  // Mac: Klick aufs Dock-Symbol öffnet wieder ein Fenster
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
