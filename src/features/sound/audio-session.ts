/**
 * Web/Mac: der Browser mischt Lunaxoras Töne ohnehin mit anderen Apps – nichts einzustellen.
 * iPhone/Android: audio-session.native.ts.
 */
export function audioReady(): Promise<void> {
  return Promise.resolve();
}

export function holdAudio(_kind: 'voice' | 'record'): () => void {
  return () => {};
}
