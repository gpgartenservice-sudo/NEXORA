import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';

import { fetchBytes, saveFile } from '@/lib/files';
import { supabase } from '@/lib/supabase';

import {
  cleanMeta,
  downloadName,
  parseVaultFile,
  vaultErrorText,
  vaultPath,
  type VaultExt,
  type VaultFile,
  type VaultMeta,
  type VaultMime,
} from './vault-logic';

/**
 * Dokumente der Firma: Liste, ablegen, ändern, löschen, ansehen/speichern – gleich für
 * Mac/Browser und Handy. Dateien im privaten Speicher „business-files“, Einträge in
 * business_files. Zugriff nur für Inhaber und Mitgründer (prüft die Datenbank).
 */

const BUCKET = 'business-files';
const TABLE = 'business_files';

/** Fertig zum Hochladen (Bilder schon verkleinert) */
export type PreparedVaultFile = {
  body: Blob | Uint8Array;
  ext: VaultExt;
  mime: VaultMime;
  size: number;
  /** ursprünglicher Dateiname */
  name: string;
  /** Vorschau (nur Bilder) */
  previewUrl: string | null;
};

type Result<T = undefined> = { data?: T; error?: string };

/** Dokumente der offenen Firma laden und ändern */
export function useVault(companyId: string) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = useCallback(
    () => supabase.from(TABLE).select('*').eq('user_id', companyId).order('created_at', { ascending: false }),
    [companyId],
  );
  const apply = useCallback(({ data, error: err }: Awaited<ReturnType<typeof fetchFiles>>) => {
    if (err) {
      console.warn('[Dokumente]', err);
      setError(vaultErrorText(err));
    } else {
      setError(null);
      setFiles((data ?? []).map((r) => parseVaultFile(r as Record<string, unknown>)));
    }
    setLoading(false);
  }, []);

  // Firma gewechselt: die ganze App lädt neu (key im Tabs-Layout), daher reicht der Startwert „lädt“
  useEffect(() => {
    let active = true;
    fetchFiles().then((r) => {
      if (active) apply(r);
    });
    return () => {
      active = false;
    };
  }, [fetchFiles, apply]);

  const reload = useCallback(async () => apply(await fetchFiles()), [fetchFiles, apply]);

  /** Datei hochladen, dann den Eintrag anlegen (klappt das nicht: Datei wieder weg) */
  const add = useCallback(
    async (file: PreparedVaultFile, meta: VaultMeta): Promise<Result<VaultFile>> => {
      const clean = cleanMeta(meta);
      if (!clean.meta) return { error: clean.error };
      const path = vaultPath(companyId, randomUUID(), file.ext);
      const up = await supabase.storage.from(BUCKET).upload(path, file.body, { contentType: file.mime, upsert: false });
      if (up.error) {
        console.warn('[Dokument hochladen]', up.error);
        return { error: vaultErrorText(up.error) };
      }
      const { data, error: err } = await supabase
        .from(TABLE)
        .insert({
          user_id: companyId,
          ...clean.meta,
          file_path: path,
          file_name: downloadName(file.name, file.ext),
          mime: file.mime,
          size_bytes: file.size,
        })
        .select()
        .single();
      if (err || !data) {
        console.warn('[Dokument speichern]', err);
        await supabase.storage.from(BUCKET).remove([path]);
        return { error: vaultErrorText(err) };
      }
      const saved = parseVaultFile(data as Record<string, unknown>);
      setFiles((list) => [saved, ...list]);
      return { data: saved };
    },
    [companyId],
  );

  const update = useCallback(async (id: string, meta: VaultMeta): Promise<Result<VaultFile>> => {
    const clean = cleanMeta(meta);
    if (!clean.meta) return { error: clean.error };
    const { data, error: err } = await supabase.from(TABLE).update(clean.meta).eq('id', id).select().single();
    if (err || !data) {
      console.warn('[Dokument ändern]', err);
      return { error: vaultErrorText(err) };
    }
    const saved = parseVaultFile(data as Record<string, unknown>);
    setFiles((list) => list.map((f) => (f.id === id ? saved : f)));
    return { data: saved };
  }, []);

  /** Eintrag löschen, dann die Datei (bleibt sie hängen, räumt „Konto löschen“ sie mit auf) */
  const remove = useCallback(async (file: VaultFile): Promise<Result> => {
    const { error: err } = await supabase.from(TABLE).delete().eq('id', file.id);
    if (err) {
      console.warn('[Dokument löschen]', err);
      return { error: vaultErrorText(err) };
    }
    setFiles((list) => list.filter((f) => f.id !== file.id));
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([file.file_path]);
    if (storageError) console.warn('[Dokument löschen: Datei]', storageError);
    return {};
  }, []);

  return { files, loading, error, reload, add, update, remove };
}

/** Zeitlich begrenzter Link (5 Minuten) */
export async function vaultUrl(path: string): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    console.warn('[Dokument öffnen]', error);
    return { error: vaultErrorText(error ?? 'Kein Link') };
  }
  return { url: data.signedUrl };
}

/** Datei speichern – Mac: Speichern-Dialog, Browser: Download, Handy: Teilen-Menü („In Dateien sichern“) */
export async function saveVaultFile(file: VaultFile): Promise<string | null> {
  const { url, error } = await vaultUrl(file.file_path);
  if (!url) return error ?? 'Das Dokument konnte nicht geladen werden.';
  const bytes = await fetchBytes(url);
  if (!bytes) return 'Das Dokument konnte nicht geladen werden. Bitte versuch es noch einmal.';
  try {
    await saveFile(bytes, file.file_name, file.mime);
    return null;
  } catch (e) {
    console.warn('[Dokument speichern]', e);
    return `Das Dokument konnte nicht gespeichert werden.\n\nTechnische Details: ${String(e)}`;
  }
}
