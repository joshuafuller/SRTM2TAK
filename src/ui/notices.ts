/**
 * Lightweight, self-contained DOM notices: the transient toast and the
 * "zoom in to select" alert. These touch only the DOM and their arguments —
 * no application state — so they live outside main.ts as pure UI helpers.
 */

/** Show a transient toast that fades in, holds for `duration` ms, then removes itself. */
export function showToast(message: string, duration: number = 2000): void {
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Animate in
  setTimeout(() => toast.classList.add('show'), 10);

  // Remove after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/** Show the "zoom in to select tiles" alert, unless one is already on screen. */
export function showZoomMessage(): void {
  const existingAlert = document.querySelector('.zoom-alert');
  if (existingAlert) return; // Already showing

  const alert = document.createElement('div');
  alert.className = 'zoom-alert';
  alert.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"></circle>
      <path d="m21 21-4.35-4.35"></path>
      <path d="M11 8v6M8 11h6"></path>
    </svg>
    <span>Zoom in to select tiles (zoom level 5+)</span>
    <button onclick="this.parentElement.remove()">×</button>
  `;
  document.body.appendChild(alert);
}

/** Remove the zoom alert if present. */
export function hideZoomMessage(): void {
  const alert = document.querySelector('.zoom-alert');
  if (alert) alert.remove();
}
