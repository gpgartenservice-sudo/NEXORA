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
const { app, BrowserWindow, net, protocol, shell } = require('electron');
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
