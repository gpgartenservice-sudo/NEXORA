// Unit-Tests: Dokumente der Firma (Gewerbe, ELSTER-Zertifikat, Versicherungen …). Start: npm run test:unit
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  CATEGORY_LABEL,
  VAULT_CATEGORIES,
  VAULT_MIMES,
  VaultError,
  canView,
  categoryCounts,
  cleanMeta,
  downloadName,
  dueFiles,
  filterFiles,
  formatSize,
  groupFiles,
  guessCategory,
  kindExt,
  kindLabel,
  parseVaultFile,
  secretWarning,
  suggestTitle,
  validity,
  validityLabel,
  vaultErrorText,
  vaultKind,
  vaultPath,
} from '../../src/features/vault/vault-logic.ts';

const C = '11111111-1111-4111-8111-111111111111';
const file = (o = {}) => ({
  id: 'f1',
  user_id: C,
  category: 'gewerbe',
  title: 'Gewerbeanmeldung',
  note: null,
  valid_until: null,
  file_path: `${C}/22222222-2222-4222-8222-222222222222.pdf`,
  file_name: 'Gewerbeanmeldung.pdf',
  mime: 'application/pdf',
  size_bytes: 120_000,
  created_by: C,
  created_at: '2026-11-20T10:00:00Z',
  updated_at: '2026-11-20T10:00:00Z',
  ...o,
});

test('Dateiarten: PDF, Fotos, ELSTER-Zertifikat, Word, Excel – sonst nichts', () => {
  assert.equal(vaultKind('Gewerbe.pdf', 'application/pdf'), 'pdf');
  assert.equal(vaultKind('scan.HEIC', 'image/heic'), 'image');
  assert.equal(vaultKind('Foto.jpg', ''), 'image');
  // .pfx kennt der Browser oft nicht (leerer Typ) bzw. das Handy meldet octet-stream
  assert.equal(vaultKind('Max_Mustermann.pfx', ''), 'pfx');
  assert.equal(vaultKind('cert.P12', 'application/octet-stream'), 'pfx');
  assert.equal(vaultKind('x', 'application/x-pkcs12'), 'pfx');
  assert.equal(vaultKind('Vertrag.docx', VAULT_MIMES.docx), 'docx');
  assert.equal(vaultKind('Liste.xlsx', ''), 'xlsx');
  for (const [name, mime] of [['a.exe', 'application/x-msdownload'], ['b.txt', 'text/plain'], ['c.zip', ''], ['logo.svg', 'image/svg+xml'], ['d', '']]) {
    assert.equal(vaultKind(name, mime), null, name);
  }
  assert.equal(kindExt('image'), 'jpg');
  assert.equal(kindExt('pfx'), 'pfx');
  assert.equal(vaultPath(C, 'abc', 'pfx'), `${C}/abc.pfx`);
});

test('Typen und Endungen passen zum Datenbank-Skript', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261207090000_dokumente.sql', import.meta.url), 'utf8');
  for (const [ext, mime] of Object.entries(VAULT_MIMES)) {
    assert.ok(sql.includes(`'${mime}'`), mime);
    assert.match(sql, new RegExp(`\\\\\\.\\((?:[a-z]+\\|)*${ext}(?:\\|[a-z]+)*\\)\\$`), ext);
  }
  for (const c of VAULT_CATEGORIES) assert.ok(sql.includes(`'${c.key}'`), c.key);
  assert.match(sql, /20971520/);
  assert.match(sql, />= 500/);
  // nur Inhaber und Mitgründer
  assert.match(sql, /using \(user_id = public\.nexora_workspace\(\) and public\.nexora_is_employer\(user_id\)\)/);
  assert.match(sql, /bucket_id = 'business-files' and public\.nexora_employer_folder\(name\)/);
  assert.match(sql, /grant update \(category, title, note, valid_until\) on public\.business_files to authenticated;/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});

test('Titel und Bereich aus dem Dateinamen', () => {
  assert.equal(suggestTitle('Gewerbeanmeldung_2026.pdf'), 'Gewerbeanmeldung 2026');
  assert.equal(suggestTitle('  Haftpflicht  Police.PDF '), 'Haftpflicht Police');
  assert.equal(suggestTitle('IMG_1234.jpg'), '');
  assert.equal(suggestTitle('Scan 2026-11-20.pdf'), '');
  assert.equal(suggestTitle('x'.repeat(200) + '.pdf').length, 120);

  assert.equal(guessCategory('Tom_Grau.pfx', 'pfx'), 'finanzamt');
  assert.equal(guessCategory('ELSTER Aktivierungsbrief.pdf', 'pdf'), 'finanzamt');
  assert.equal(guessCategory('Gewerbesteuerbescheid 2025.pdf', 'pdf'), 'finanzamt');
  assert.equal(guessCategory('Gewerbeanmeldung.pdf', 'pdf'), 'gewerbe');
  assert.equal(guessCategory('Betriebshaftpflicht.pdf', 'pdf'), 'versicherung');
  assert.equal(guessCategory('Mietvertrag Halle.docx', 'docx'), 'vertrag');
  assert.equal(guessCategory('Geschäftskonto Eröffnung.pdf', 'pdf'), 'bank');
  assert.equal(guessCategory('Meisterbrief.jpg', 'image'), 'nachweis');
  assert.equal(guessCategory('IMG_1234.jpg', 'image'), 'sonstiges');

  assert.equal(downloadName('Tom Grau.p12', 'pfx'), 'Tom Grau.pfx');
  assert.equal(downloadName('IMG_1.HEIC', 'jpg'), 'IMG_1.jpg');
  assert.equal(downloadName('a/b:c.pdf', 'pdf'), 'a_b_c.pdf');
  assert.equal(downloadName('   ', 'pdf'), 'Dokument.pdf');
});

test('Gültig bis: abgelaufen, bald (≤ 60 Tage), gültig', () => {
  const today = '2026-11-23';
  assert.deepEqual(validity('2026-11-22', today), { state: 'expired', days: -1 });
  assert.deepEqual(validity('2026-11-23', today), { state: 'soon', days: 0 });
  assert.deepEqual(validity('2027-01-22', today), { state: 'soon', days: 60 });
  assert.deepEqual(validity('2027-01-23', today), { state: 'ok', days: 61 });
  // Zeitumstellung Ende März zählt nicht als halber Tag
  assert.equal(validity('2027-04-01', '2027-03-20').days, 12);
  assert.equal(validity(null, today), null);
  assert.equal(validity('kaputt', today), null);

  assert.equal(validityLabel('2026-11-01', today), 'Abgelaufen am 01.11.2026');
  assert.equal(validityLabel('2026-11-23', today), 'Läuft heute ab');
  assert.equal(validityLabel('2026-11-24', today), 'Läuft morgen ab');
  assert.equal(validityLabel('2026-12-10', today), 'Läuft in 17 Tagen ab');
  assert.equal(validityLabel('2029-11-23', today), 'Gültig bis 23.11.2029');
  assert.equal(validityLabel(null, today), null);

  const list = [
    file({ id: 'a', valid_until: '2029-01-01' }),
    file({ id: 'b', valid_until: '2026-12-01' }),
    file({ id: 'c', valid_until: '2026-10-01' }),
    file({ id: 'd' }),
  ];
  assert.deepEqual(dueFiles(list, today).map((f) => f.id), ['c', 'b']);
});

test('Warnung bei Passwörtern und PINs in Notiz oder Name', () => {
  for (const t of ['Passwort: geheim', 'pw: 1234', 'PIN 1234', 'Kennwort steht hinten', 'password123', 'PUK liegt bei']) {
    assert.ok(secretWarning(t), t);
  }
  for (const t of ['Aktenzeichen 12/345', 'Original im Ordner Büro', 'Pinnwand', 'ELSTER-Zugangsdaten', '', null]) {
    assert.equal(secretWarning(t), null, String(t));
  }
});

test('Anzeige: Größe, Art, Ansehen', () => {
  assert.equal(formatSize(820), '820 Byte');
  assert.equal(formatSize(84_000), '82 KB');
  assert.equal(formatSize(1_450_000), '1,4 MB');
  assert.equal(formatSize(20 * 1024 * 1024), '20 MB');
  assert.equal(kindLabel('application/x-pkcs12'), 'Zertifikat');
  assert.equal(kindLabel('image/jpeg'), 'Foto');
  assert.equal(kindLabel(VAULT_MIMES.xlsx), 'Excel');
  assert.ok(canView('application/pdf'));
  assert.ok(canView('image/png'));
  assert.ok(!canView('application/x-pkcs12'));
  assert.ok(!canView(VAULT_MIMES.docx));
});

test('Filtern, Gruppieren, Zählen', () => {
  const list = [
    file({ id: '1', category: 'finanzamt', title: 'ELSTER-Zertifikat', mime: 'application/x-pkcs12', created_at: '2026-11-01T00:00:00Z' }),
    file({ id: '2', category: 'finanzamt', title: 'Steuernummer', note: 'Brief vom Finanzamt Köln', created_at: '2026-11-05T00:00:00Z' }),
    file({ id: '3', category: 'gewerbe' }),
    file({ id: '4', category: 'versicherung', title: 'Haftpflicht', file_name: 'Police_2026.pdf' }),
  ];
  assert.deepEqual(filterFiles(list, 'finanzamt', '').map((f) => f.id), ['1', '2']);
  assert.deepEqual(filterFiles(list, 'all', 'köln').map((f) => f.id), ['2']);
  assert.deepEqual(filterFiles(list, 'all', 'police').map((f) => f.id), ['4']);
  assert.deepEqual(filterFiles(list, 'all', 'finanzamt & elster').map((f) => f.id), ['1', '2']);
  assert.deepEqual(filterFiles(list, 'gewerbe', 'haft'), []);

  const groups = groupFiles(list);
  assert.deepEqual(groups.map((g) => g.category), ['gewerbe', 'finanzamt', 'versicherung']);
  assert.deepEqual(groups[1].files.map((f) => f.id), ['2', '1']); // Neueste zuerst
  assert.equal(groups[1].label, CATEGORY_LABEL.finanzamt);
  const counts = categoryCounts(list);
  assert.equal(counts.finanzamt, 2);
  assert.equal(counts.bank, 0);
});

test('Eingaben prüfen und Zeilen lesen', () => {
  assert.deepEqual(cleanMeta({ title: '  ELSTER   Zertifikat ', category: 'finanzamt', note: '  ', valid_until: '2029-11-23' }).meta, {
    title: 'ELSTER Zertifikat',
    category: 'finanzamt',
    note: null,
    valid_until: '2029-11-23',
  });
  assert.match(cleanMeta({ title: ' ', category: 'gewerbe', note: null, valid_until: null }).error, /Namen/);
  assert.match(cleanMeta({ title: 'x'.repeat(121), category: 'gewerbe', note: null, valid_until: null }).error, /120/);
  assert.match(cleanMeta({ title: 'x', category: 'privat', note: null, valid_until: null }).error, /Bereich/);
  assert.match(cleanMeta({ title: 'x', category: 'gewerbe', note: 'n'.repeat(1001), valid_until: null }).error, /1\.000/);
  assert.match(cleanMeta({ title: 'x', category: 'gewerbe', note: null, valid_until: '23.11.2029' }).error, /Gültig bis/);

  const row = parseVaultFile({ ...file(), category: 'unbekannt', note: '', valid_until: '2029-01-01', size_bytes: '42' });
  assert.equal(row.category, 'sonstiges');
  assert.equal(row.note, null);
  assert.equal(row.size_bytes, 42);
  assert.equal(parseVaultFile({ ...file(), valid_until: null }).valid_until, null);
});

test('Fehlertexte', () => {
  assert.match(vaultErrorText({ code: 'PGRST205', message: 'Could not find the table' }), /20261207090000_dokumente\.sql/);
  assert.match(vaultErrorText({ message: 'Bucket not found' }), /Datenbank-Skript/);
  assert.match(vaultErrorText({ message: 'new row violates row-level security policy' }), /Inhaber und Mitgründer/);
  assert.match(vaultErrorText({ message: 'files_limit' }), /500/);
  assert.match(vaultErrorText({ message: 'mime type text/plain is not supported' }), /Erlaubt sind/);
  assert.match(vaultErrorText({ message: 'The object exceeded the maximum allowed size' }), /20 MB/);
  assert.equal(vaultErrorText(new VaultError('Eigener Text')), 'Eigener Text');
  assert.match(vaultErrorText({ message: 'boom' }), /Technische Details: boom/);
});

test('App: Menüpunkt nur für Inhaber und Mitgründer, Luna kennt die Seite, Konto löschen räumt auf', () => {
  const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
  assert.match(read('src/features/navigation/nav-items.ts'), /name: 'dokumente',\s+href: '\/dokumente'/);
  assert.match(read('src/features/team/area-gate.tsx'), /if \(name === 'dokumente'\) return access\.employer;/);
  assert.match(read('src/app/(app)/(tabs)/dokumente.tsx'), /if \(!employer\)/);
  assert.match(read('src/features/assistant/assistant-logic.ts'), /dokumente: \{ href: '\/dokumente', label: 'Dokumente' \}/);
  assert.match(read('supabase/functions/assistant/index.ts'), /firma, dokumente \(/);
  assert.match(read('supabase/functions/account/index.ts'), /BUCKETS = \['receipts', 'business-files'\]/);
});
