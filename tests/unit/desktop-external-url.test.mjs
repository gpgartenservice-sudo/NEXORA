// Unit-Tests: welche Links die Mac-App nach außen öffnet (desktop/external-url.js). Start: npm run test:unit
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { isSafeExternalUrl } = require('../../desktop/external-url.js');

test('Erlaubt: Webseiten, E-Mail, Telefon, Kalender-Abo', () => {
  for (const url of [
    'https://lunaxora.de/Angebot/?t=abc',
    'http://example.com',
    'HTTPS://EXAMPLE.COM/',
    'https://wa.me/49171234567?text=Hallo%20du',
    'mailto:kunde@example.com?subject=Angebot%20AN-1&body=Hallo',
    'tel:+491712345678',
    'webcal://abc.supabase.co/functions/v1/calendar/feed.ics',
    'https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fx',
  ]) {
    assert.equal(isSafeExternalUrl(url), true, url);
  }
});

test('Verboten: Dateien, Netzlaufwerke, Skripte, fremde Schemata, Kaputtes', () => {
  for (const url of [
    'file:///etc/passwd',
    'file:///Applications/Calculator.app',
    'smb://evil.example/share',
    'afp://evil.example/share',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    'about:blank',
    'app://nexora/kunden',
    'x-apple.systempreferences:com.apple.preference.security',
    'ms-msdt:/id PCWDiagnostic',
    'ssh://host',
    'https://',
    'https:',
    'webcal:feed',
    ' https://example.com',
    'https://example.com\n',
    'https://exa\tmple.com',
    'kein link',
    '',
    null,
    undefined,
    42,
    { toString: () => 'https://example.com' },
  ]) {
    assert.equal(isSafeExternalUrl(url), false, String(url));
  }
});
