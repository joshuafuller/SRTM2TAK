/**
 * PWA lifecycle: service-worker registration (with update prompts) and
 * online/offline detection. Self-contained — depends only on the browser APIs,
 * the notifications manager, and the service-worker URL helper.
 */

import { notifications } from '../lib/notification-manager';
import { computeServiceWorkerUrl } from '../lib/sw';

/** Register the service worker in production builds and surface update prompts. */
export async function registerServiceWorker(): Promise<void> {
  // Skip SW in dev to avoid 404s; only register in production builds
  const isDev = (import.meta as any)?.env?.DEV === true || (import.meta as any)?.env?.MODE === 'development';
  if ('serviceWorker' in navigator && !isDev) {
    try {
      const base = (import.meta as any)?.env?.BASE_URL ?? '/';
      const swUrl = computeServiceWorkerUrl(base);
      const registration = await navigator.serviceWorker.register(swUrl);
      console.log('Service Worker registered:', registration.scope);

      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 60000); // Check every minute

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              notifications.info('Update available! Refresh to get the latest version.', {
                persistent: true,
                action: {
                  label: 'Refresh',
                  callback: () => window.location.reload(),
                },
              });
            }
          });
        }
      });
    } catch (error) {
      console.warn('Service Worker registration failed (non-fatal):', error);
    }
  }
}

/** Wire up the offline indicator and online/offline notifications. */
export function setupOfflineDetection(): void {
  const offlineIndicator = document.getElementById('offline-indicator');

  const updateOnlineStatus = () => {
    if (navigator.onLine) {
      offlineIndicator?.style.setProperty('display', 'none');
      notifications.success('Connection restored');
    } else {
      offlineIndicator?.style.setProperty('display', 'flex');
      notifications.warning('You are offline. Some features may be limited.');
    }
  };

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Check initial status
  if (!navigator.onLine) {
    offlineIndicator?.style.setProperty('display', 'flex');
  }
}
