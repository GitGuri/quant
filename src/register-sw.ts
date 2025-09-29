// src/register-sw.ts
export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => console.log('Service Worker registered'))
        .catch((err) => console.error('SW registration failed', err));
    });
  }
}
