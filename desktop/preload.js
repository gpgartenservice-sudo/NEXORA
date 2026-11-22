/**
 * Brücke zwischen App und Mac: Die App darf nur genau diese Funktionen
 * aufrufen – PDF bereitlegen + E-Mail/WhatsApp öffnen bzw. Teilen-Menü,
 * die Mikrofon-Freigabe des Mac anfragen (Sprachmodus von Luna),
 * das Anmeldefenster für TikTok/Instagram öffnen, einen Termin im
 * Kalender des Mac öffnen und das Fenster nach einem Klick auf eine
 * Mitteilung wieder nach vorn holen.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexoraDesktop', {
  // Das Teilen-Menü (mit Anhang) gibt es nur auf dem Mac
  canShare: process.platform === 'darwin',
  sendFile: (payload) => ipcRenderer.invoke('nexora:send-file', payload),
  askMicrophone: () => ipcRenderer.invoke('nexora:ask-microphone'),
  openAuthWindow: (options) => ipcRenderer.invoke('nexora:open-auth-window', options),
  openCalendarFile: (payload) => ipcRenderer.invoke('nexora:open-calendar-file', payload),
  // Klick auf eine Mitteilung: Fenster wieder zeigen (auch wenn es geschlossen/ausgeblendet war)
  showWindow: () => ipcRenderer.invoke('nexora:show-window'),
});
