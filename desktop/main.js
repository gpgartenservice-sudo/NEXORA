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
const { app, BrowserWindow, ipcMain, net, protocol, shell, ShareMenu } = require('electron');
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
// E-Mail-Programm bzw. WhatsApp öffnen (PDF im Finder zeigen, zum
// Reinziehen) oder das Teilen-Menü des Mac mit dem PDF als Anhang.
// ---------------------------------------------------------------------------
const MAX_PDF_BYTES = 20 * 1024 * 1024;

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
  const { bytes, fileName, via, url, text } = payload ?? {};
  if (!ArrayBuffer.isView(bytes) || bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error('Ungültige Datei');
  }
  if (via === 'open' && !allowedUrl(url)) throw new Error('Ungültiger Link');
  if (via !== 'open' && via !== 'share') throw new Error('Unbekannte Aktion');

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
  } else {
    await shell.openExternal(url);
    shell.showItemInFolder(filePath);
  }
  return { filePath };
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
  createWindow();

  // Mac: Klick aufs Dock-Symbol öffnet wieder ein Fenster
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
