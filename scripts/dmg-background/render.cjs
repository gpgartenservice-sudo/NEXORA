/**
 * Rendert den DMG-Hintergrund: npx electron scripts/dmg-background/render.cjs
 * → assets/dmg/background.png (660 × 400) und background@2x.png (1320 × 800).
 * electron-builder macht daraus automatisch ein Retina-TIFF.
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const W = 660;
const H = 400;
const OUT = path.join(__dirname, '..', '..', 'assets', 'dmg');

app.disableHardwareAcceleration();
app.dock?.hide();

app.whenReady().then(async () => {
  try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const scale of [1, 2]) {
    const win = new BrowserWindow({
      width: W * scale,
      height: H * scale,
      useContentSize: true,
      show: false,
      frame: false,
      webPreferences: { offscreen: true },
    });
    // Das Laden bricht manchmal mit ERR_FAILED ab – dann einfach nochmal
    for (let tryNo = 1; ; tryNo++) {
      try {
        await win.loadFile(path.join(__dirname, 'background.html'), { query: { scale: String(scale) } });
        break;
      } catch (e) {
        if (tryNo >= 3) throw e;
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    await new Promise((r) => setTimeout(r, 800));
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: W * scale, height: H * scale });
    const file = path.join(OUT, scale === 1 ? 'background.png' : 'background@2x.png');
    fs.writeFileSync(file, image.toPNG());
    console.log(path.relative(process.cwd(), file), image.getSize());
  }
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
  app.quit();
});
