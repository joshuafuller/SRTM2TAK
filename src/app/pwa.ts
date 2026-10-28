/**
 * PWA lifecycle: service-worker registration (with update prompts) and
 * online/offline detection. Self-contained — depends only on the browser APIs,
 * the notifications manager, and the service-worker URL helper.
 */

import { notifications } from '../lib/notification-manager';
import { computeServiceWorkerUrl } from '../lib/sw';

export interface ServiceWorkerOptions {
  /** True while the user has work a reload would lose (a selection, or a download building its ZIP) */
  isBusy?: () => boolean;
}

// A new version found this soon after the page opened came from the visit's first
// update check, before the user did anything: reload to it. Later, ask instead.
const AUTO_RELOAD_WINDOW_MS = 15_000;

/** Register the service worker in production builds and surface update prompts. */
export async function registerServiceWorker(options: ServiceWorkerOptions = {}): Promise<void> {
  // Skip SW in dev to avoid 404s; only register in production builds
  const isDev = (import.meta as any)?.env?.DEV === true || (import.meta as any)?.env?.MODE === 'development';
  if ('serviceWorker' in navigator && !isDev) {
    try {
      const base = (import.meta as any)?.env?.BASE_URL ?? '/';
      const swUrl = computeServiceWorkerUrl(base);
      // The service worker (autoUpdate: skipWaiting + clientsClaim) takes over as
      // soon as a new version is installed, but this page still runs the old
      // files. Reload once so the user sees the new version without a second reload.
      // Skip the first install: there was no older version to replace.
      const hadController = Boolean(navigator.serviceWorker.controller);
      const startedAt = Date.now();
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloading) return;
        // Later in the session, or with a selection or download in progress, a reload
        // would lose the user's work: let the user choose when to refresh
        if (Date.now() - startedAt > AUTO_RELOAD_WINDOW_MS || options.isBusy?.()) {
          notifications.info('Update ready. Refresh to get the latest version.', {
            persistent: true,
            action: { label: 'Refresh', callback: () => window.location.reload() },
          });
          return;
        }
        reloading = true;
        window.location.reload();
      });

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
