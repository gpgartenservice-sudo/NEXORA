import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { COMPANY_HEADER } from '@/lib/company-header';
import { supabase } from '@/lib/supabase';

/**
 * Logo einer Firma (Firma → Logo) für Listen wie Profil → Firmen – ohne Logo der Anfangsbuchstabe.
 * Jede Firma wird mit ihrer eigenen Kopfzeile gefragt; die Datenbank gibt das Logo nur heraus,
 * wenn man zu der Firma gehört (20261127090000_mehrere_firmen.sql).
 */

type Known = { logoId: string | null; uri: string | null };
const known = new Map<string, Known>();

async function loadLogo(companyId: string): Promise<string | null> {
  const settings = await supabase
    .from('business_settings')
    .select('logo_id')
    .eq('user_id', companyId)
    .setHeader(COMPANY_HEADER, companyId)
    .maybeSingle();
  if (settings.error) return known.get(companyId)?.uri ?? null;
  const logoId: string | null = settings.data?.logo_id ?? null;
  const before = known.get(companyId);
  // Logo unverändert: nicht nochmal das ganze Bild laden
  if (before && before.logoId === logoId) return before.uri;
  if (!logoId) {
    known.set(companyId, { logoId: null, uri: null });
    return null;
  }
  const { data, error } = await supabase
    .from('business_logos')
    .select('mime, data')
    .eq('id', logoId)
    .setHeader(COMPANY_HEADER, companyId)
    .maybeSingle();
  if (error) return before?.uri ?? null;
  const uri = data ? `data:${data.mime};base64,${data.data}` : null;
  known.set(companyId, { logoId, uri });
  return uri;
}

export function CompanyLogo({ companyId, name, size = 36, current = false }: { companyId: string; name: string; size?: number; current?: boolean }) {
  const [uri, setUri] = useState<string | null>(() => known.get(companyId)?.uri ?? null);
  useEffect(() => {
    let alive = true;
    loadLogo(companyId)
      .then((u) => alive && setUri(u))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [companyId]);

  const radius = Math.round(size * 0.28);
  if (uri)
    return (
      <View
        style={[styles.tile, { width: size, height: size, borderRadius: radius, padding: Math.round(size * 0.1) }, current && styles.tileCurrent]}
        accessibilityLabel={`Logo von ${name}`}>
        <Image source={{ uri }} style={styles.image} contentFit="contain" />
      </View>
    );
  return (
    <View style={[styles.letter, { width: size, height: size, borderRadius: size / 2 }, current && styles.letterCurrent]}>
      <Text style={[styles.letterText, { fontSize: size * 0.42 }]}>{(name.trim()[0] ?? '?').toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Logos sind meist für weißes Papier gemacht (Rechnungen) – darum auf Weiß
  tile: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tileCurrent: { borderWidth: 2, borderColor: Colors.accent },
  image: { width: '100%', height: '100%' },
  letter: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  letterCurrent: { backgroundColor: Colors.accentSoft },
  letterText: { color: Colors.text, fontWeight: '700' },
});
