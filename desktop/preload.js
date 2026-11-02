/**
 * Brücke zwischen App und Mac: Die App darf nur genau diese eine Funktion
 * aufrufen (PDF bereitlegen + E-Mail/WhatsApp öffnen bzw. Teilen-Menü).
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexoraDesktop', {
  // Das Teilen-Menü (mit Anhang) gibt es nur auf dem Mac
  canShare: process.platform === 'darwin',
  sendFile: (payload) => ipcRenderer.invoke('nexora:send-file', payload),
});
