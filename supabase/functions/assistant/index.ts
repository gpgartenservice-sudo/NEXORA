/**
 * NEXORA Assistent – Supabase Edge Function "assistant"
 *
 * Nimmt einen frei geschriebenen Text entgegen ("Neuer Kunde Peter Müller,
 * will eine Website für 1.500 €") und lässt Claude daraus Vorschläge
 * machen: Kunden, Aufträge, Ausgaben, Post-Ideen. Die Funktion speichert
 * NICHTS – die App zeigt die Vorschläge an, gespeichert wird erst nach
 * Bestätigung (mit den normalen Rechten des Nutzers).
 *
 * Einrichtung: siehe supabase/README.md (Abschnitt "Assistent").
 * Geheimnisse (Supabase -> Edge Functions -> Secrets):
 *   ANTHROPIC_API_KEY   (Pflicht)  API-Schlüssel von console.anthropic.com
 *   ASSISTANT_MODEL     (optional) Standard: claude-opus-5-5
 */
import Anthropic from 'npm:@anthropic-ai/sdk@1.4.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@1.4.0/helpers/beta/zod';
import { z } from 'npm:zod@4.6.7';

const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_TEXT = 2000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// Antwortformat (Structured Outputs) – die App prüft alles noch einmal
// ---------------------------------------------------------------------------
const Customer = z.object({
  name: z.string(),
  company: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
});
const Order = z.object({
  customer_name: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  price: z.number().nullable(),
  billing: z.enum(['once', 'monthly']),
  meeting_at: z.string().nullable(),
  execution_at: z.string().nullable(),
});
const Expense = z.object({
  title: z.string(),
  amount: z.number(),
  category: z.enum(['material', 'tools', 'software', 'marketing', 'vehicle', 'office', 'insurance', 'fees', 'education', 'other']),
  repeat: z.enum(['once', 'monthly', 'yearly']),
  spent_on: z.string(),
});
const Post = z.object({
  title: z.string(),
  format: z.enum(['video', 'carousel', 'image', 'story', 'text']),
  platforms: z.array(z.enum(['tiktok', 'instagram', 'youtube', 'facebook', 'linkedin', 'x', 'pinterest', 'threads'])),
  notes: z.string().nullable(),
  planned_for: z.string().nullable(),
});
const Action = z.object({
  type: z.enum(['customer', 'order', 'expense', 'post']),
  customer: Customer.nullable(),
  order: Order.nullable(),
  expense: Expense.nullable(),
  post: Post.nullable(),
});
const Result = z.object({ actions: z.array(Action), reply: z.string() });

// Fest (ohne Datum), damit der Anfang der Anfrage gleich bleibt
const SYSTEM = `Du bist der Assistent in NEXORA, einer App für junge Selbstständige in Deutschland.
Der Nutzer schreibt dir frei, was in seinem Business passiert ist oder ansteht. Lies daraus Einträge für die App heraus:

- customer: ein neuer Kunde (Name; Firma, Telefon, E-Mail, Anschrift, Notizen nur, wenn genannt).
- order: ein Auftrag bzw. eine Anfrage. customer_name = Name des Kunden, wie genannt (sonst null). title = kurze Bezeichnung der Leistung. price = Betrag in Euro als Zahl (null, wenn keiner genannt). billing = "monthly" bei monatlichen Beträgen, sonst "once". meeting_at = Termin wie Erstgespräch/Besichtigung, execution_at = Ausführungstermin.
- expense: eine Ausgabe des Business. amount in Euro. category passend wählen (software = Abos und Programme, tools = Werkzeug und Geräte, vehicle = Auto/Tanken/Fahrten, fees = Gebühren und Steuerberatung, education = Kurse und Bücher, sonst das Naheliegende oder other). repeat = "monthly"/"yearly" bei Abos und regelmäßigen Kosten, sonst "once". spent_on = Datum der Zahlung (bei Abos die erste Zahlung).
- post: eine Content-Idee für Social Media. format: video, carousel, image, story oder text (Reels und TikToks sind video). platforms nur, wenn genannt. notes = Stichpunkte zum Inhalt. planned_for = wann gepostet werden soll.

Regeln:
- Datumsangaben als "JJJJ-MM-TT", mit Uhrzeit als "JJJJ-MM-TTTHH:MM" (deutsche Ortszeit). Rechne "heute", "morgen", "gestern", "nächsten Dienstag" usw. vom angegebenen heutigen Datum aus. Ohne Datum: null (bei expense das heutige Datum).
- Lege für einen Auftrag nur dann zusätzlich einen customer an, wenn der Text Kontaktdaten zum Kunden nennt oder ausdrücklich von einem neuen Kunden spricht. Die App ordnet den Kunden über customer_name selbst zu.
- Erfinde nichts dazu: keine Preise, Telefonnummern oder Daten, die nicht im Text stehen.
- Fülle bei jeder action genau das Objekt, das zu type passt; die anderen sind null.
- reply: ein kurzer, freundlicher Satz auf Deutsch, was du erkannt hast. Wenn nichts davon im Text steckt, sag kurz, was du anlegen kannst, und gib actions leer zurück.`;

type Deps = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Ist der Aufrufer ein angemeldeter NEXORA-Nutzer? (Prüfung beim Supabase-Auth-Server) */
async function signedIn(req: Request, deps: Deps): Promise<boolean> {
  const auth = req.headers.get('Authorization');
  const apikey = req.headers.get('apikey');
  const url = deps.env('SUPABASE_URL');
  if (!auth?.startsWith('Bearer ') || !apikey || !url) return false;
  const res = await deps.fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  return res.ok;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  if (!(await signedIn(req, deps))) return json(401, { error: 'not_signed_in' });

  const apiKey = deps.env('ANTHROPIC_API_KEY');
  if (!apiKey) return json(500, { error: 'missing_api_key' });

  let body: { text?: unknown; today?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json(400, { error: 'empty_text' });
  if (text.length > MAX_TEXT) return json(400, { error: 'text_too_long', max: MAX_TEXT });
  const today = typeof body.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
  const weekday = WEEKDAYS[new Date(`${today}T12:00:00Z`).getUTCDay()];

  const model = deps.env('ASSISTANT_MODEL') || DEFAULT_MODEL;
  // Haiku hat keinen serverseitigen Ersatz bei Ablehnung
  const withFallback = !model.startsWith('claude-haiku');
  const client = new Anthropic({ apiKey, fetch: deps.fetch });

  try {
    const message = await client.beta.messages.parse({
      model,
      max_tokens: 16000,
      ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      output_config: { effort: 'low', format: betaZodOutputFormat(Result) },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM,
      messages: [{ role: 'user', content: `Heute ist ${weekday}, der ${today}.\n\nText des Nutzers:\n${text}` }],
    });

    if (message.stop_reason === 'refusal') return json(422, { error: 'refused' });
    if (message.stop_reason === 'max_tokens' || !message.parsed_output) return json(502, { error: 'no_result' });
    return json(200, message.parsed_output);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return json(500, { error: 'invalid_api_key' });
    if (error instanceof Anthropic.RateLimitError) return json(429, { error: 'rate_limited' });
    if (error instanceof Anthropic.APIError) {
      console.error('Claude API', error.status, error.message);
      return json(502, { error: 'claude_error', status: error.status });
    }
    console.error('Assistent', error);
    return json(500, { error: 'unexpected' });
  }
}

// Im Supabase-Edge-Runtime (Deno) starten; in Tests wird nur handleRequest benutzt.
declare const Deno: { serve?: (h: (req: Request) => Promise<Response>) => void; env: { get(key: string): string | undefined } } | undefined;
if (typeof Deno !== 'undefined' && Deno?.serve) {
  Deno.serve((req) => handleRequest(req, { env: (k) => Deno!.env.get(k), fetch }));
}
