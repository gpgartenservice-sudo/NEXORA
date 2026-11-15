import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { parseForecast, type DayWeather } from './weather-logic';

/**
 * Wettervorhersage für den Ort aus den Firmendaten (Open-Meteo, ohne Schlüssel).
 * Es wird nur der Ortsname bzw. die Koordinaten übertragen – keine Kundendaten.
 * Einmal geladen, gilt die Vorhersage 3 Stunden (im Speicher und auf dem Gerät).
 */

const TTL = 3 * 60 * 60 * 1000;
const KEY = 'nexora.weather.v1';

type Cached = { place: string; at: number; lat: number; lon: number; name: string; json: unknown };

let memory: Cached | null = null;
const inflight = new Map<string, Promise<Cached | null>>();

/** place: "Köln" oder "Köln|DE" (Land, wenn die PLZ deutsch aussieht – eindeutiger bei „Neustadt“ & Co.) */
async function geocode(place: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const [name, country] = place.split('|');
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=de&format=json` +
    (country ? `&countryCode=${country}` : '');
  const res = await fetch(url);
  if (!res.ok) return null;
  const r = ((await res.json()) as { results?: { latitude: number; longitude: number; name: string }[] }).results?.[0];
  return r ? { lat: r.latitude, lon: r.longitude, name: r.name } : null;
}

async function load(place: string): Promise<Cached | null> {
  if (memory && memory.place === place && Date.now() - memory.at < TTL) return memory;
  let stored: Cached | null = null;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    stored = raw ? (JSON.parse(raw) as Cached) : null;
  } catch {
    stored = null;
  }
  if (stored && stored.place === place && Date.now() - stored.at < TTL) return (memory = stored);
  try {
    const geo = stored && stored.place === place ? { lat: stored.lat, lon: stored.lon, name: stored.name } : await geocode(place);
    if (!geo) return null;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat.toFixed(3)}&longitude=${geo.lon.toFixed(3)}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16';
    const res = await fetch(url);
    if (!res.ok) return stored?.place === place ? stored : null;
    const next: Cached = { place, at: Date.now(), ...geo, json: await res.json() };
    memory = next;
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
    return next;
  } catch {
    // offline: alte Vorhersage ist besser als keine
    return stored?.place === place ? stored : null;
  }
}

export type WeatherState = { days: Map<string, DayWeather>; place: string | null };

const EMPTY: WeatherState = { days: new Map(), place: null };

export function useWeather(place: string | null): WeatherState {
  const [state, setState] = useState<{ key: string | null; value: WeatherState }>({ key: null, value: EMPTY });

  useEffect(() => {
    if (!place) return;
    let active = true;
    let p = inflight.get(place);
    if (!p) {
      p = load(place).finally(() => inflight.delete(place));
      inflight.set(place, p);
    }
    void p.then((r) => {
      if (active) setState({ key: place, value: r ? { days: parseForecast(r.json), place: r.name } : EMPTY });
    });
    return () => {
      active = false;
    };
  }, [place]);

  return place && state.key === place ? state.value : EMPTY;
}
