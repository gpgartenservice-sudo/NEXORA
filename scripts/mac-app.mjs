/**
 * Bereitet die Mac-App zum Verpacken vor (npm run mac:dmg):
 * Ordner .mac-app/ mit genau dem, was die fertige App braucht –
 * desktop/ (Fenster, Mail, Mikrofon …) und dist/ (die Web-Version der App,
 * vorher mit `expo export --platform web` gebaut). Keine node_modules:
 * desktop/main.js braucht nur Electron selbst.
 *
 * Danach baut electron-builder daraus NEXORA.app und die .dmg (Ordner release/,
 * Einstellungen in electron-builder.config.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.mac-app');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/ fehlt – erst `expo export --platform web` (macht `npm run mac:dmg` automatisch).');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
fs.cpSync(path.join(root, 'desktop'), path.join(out, 'desktop'), { recursive: true });
fs.cpSync(path.join(root, 'dist'), path.join(out, 'dist'), { recursive: true });
fs.writeFileSync(
  path.join(out, 'package.json'),
  `${JSON.stringify(
    {
      name: 'nexora',
      productName: 'NEXORA',
      version: pkg.version,
      description: 'NEXORA – die App für junge Unternehmer',
      main: 'desktop/main.js',
      author: 'NEXORA',
      private: true,
    },
    null,
    2,
  )}\n`,
);
console.log(`Mac-App vorbereitet (${pkg.version}) – jetzt baut electron-builder die .dmg.`);
