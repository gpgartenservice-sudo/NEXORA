/**
 * Wetter – reine Logik. Daten kommen von Open-Meteo (open-meteo.com, ohne Konto/Schlüssel):
 * Wettercodes nach WMO, Tageswerte für bis zu 16 Tage.
 */

export type WeatherKind = 'sun' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';

export type DayWeather = {
  day: string;
  code: number;
  kind: WeatherKind;
  label: string;
  max: number | null;
  min: number | null;
  /** Regenwahrscheinlichkeit in % */
  rain: number | null;
};

/** WMO-Wettercode → Symbol + Text */
export function weatherKind(code: number): { kind: WeatherKind; label: string } {
  if (code === 0) return { kind: 'sun', label: 'Sonnig' };
  if (code === 1 || code === 2) return { kind: 'partly', label: code === 1 ? 'Überwiegend sonnig' : 'Teils bewölkt' };
  if (code === 3) return { kind: 'cloud', label: 'Bewölkt' };
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Nebel' };
  if (code >= 51 && code <= 57) return { kind: 'drizzle', label: 'Nieselregen' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { kind: 'rain', label: code >= 80 ? 'Regenschauer' : 'Regen' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'Schnee' };
  if (code >= 95) return { kind: 'storm', label: 'Gewitter' };
  return { kind: 'cloud', label: 'Bewölkt' };
}

type Daily = {
  time?: string[];
  weather_code?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
  precipitation_probability_max?: (number | null)[];
};

/** Antwort von api.open-meteo.com/v1/forecast → Tage ("JJJJ-MM-TT" → Wetter) */
export function parseForecast(json: unknown): Map<string, DayWeather> {
  const out = new Map<string, DayWeather>();
  const daily = (json as { daily?: Daily } | null)?.daily;
  if (!daily?.time) return out;
  daily.time.forEach((day, i) => {
    const code = daily.weather_code?.[i];
    if (typeof code !== 'number' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
    out.set(day, {
      day,
      code,
      ...weatherKind(code),
      max: num(daily.temperature_2m_max?.[i]),
      min: num(daily.temperature_2m_min?.[i]),
      rain: num(daily.precipitation_probability_max?.[i]),
    });
  });
  return out;
}

/** Warnung für Arbeiten draußen – null, wenn das Wetter passt */
export function outdoorWarning(w: DayWeather | undefined): string | null {
  if (!w) return null;
  if (w.kind === 'storm') return 'Gewitter angesagt – Arbeiten draußen lieber verschieben.';
  if (w.kind === 'snow') return 'Schnee angesagt – plan mehr Zeit ein oder verschieb den Termin.';
  if ((w.kind === 'rain' || w.kind === 'drizzle') && (w.rain ?? 100) >= 50)
    return `${w.label} angesagt (${w.rain ?? '–'} %) – vielleicht verschieben oder den Kunden vorwarnen.`;
  if (w.max !== null && w.max >= 32) return `Bis ${w.max} °C – früh anfangen und viel trinken.`;
  if (w.max !== null && w.max <= -5) return `Bis zu ${w.max} °C – Frost.`;
  return null;
}

/** Ort für die Wettersuche aus den Firmendaten: "Ort" bzw. "Ort|DE" bei deutscher PLZ */
export function weatherPlace(s: { zip?: string | null; city?: string | null }): string | null {
  const city = s.city?.trim();
  if (!city || city.length < 2) return null;
  return /^\d{5}$/.test(s.zip?.trim() ?? '') ? `${city}|DE` : city;
}
