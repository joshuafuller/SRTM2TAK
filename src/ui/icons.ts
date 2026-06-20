/**
 * Repaint the toolbar's SVG icons with proper, intuitive designs and improve
 * their tooltips/aria-labels. Pure DOM: queries by id and rewrites static
 * markup — no application state involved.
 */
export function fixBrokenIcons(): void {
  // Fix all the malformed/empty SVG icons with proper designs

  // Selection box icon (intuitive area selection with corner handles)
  const drawBtn = document.querySelector('#draw-rectangle svg');
  if (drawBtn) {
    drawBtn.setAttribute('fill', 'none');
    drawBtn.setAttribute('stroke', 'currentColor');
    drawBtn.innerHTML = `
      <!-- Dashed selection rectangle -->
      <rect x="5" y="7" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.8"/>
      <!-- Corner handles for clarity -->
      <rect x="3" y="5" width="4" height="4" fill="currentColor" rx="0.5"/>
      <rect x="17" y="5" width="4" height="4" fill="currentColor" rx="0.5"/>
      <rect x="3" y="15" width="4" height="4" fill="currentColor" rx="0.5"/>
      <rect x="17" y="15" width="4" height="4" fill="currentColor" rx="0.5"/>
    `;
  }

  // Clear/trash icon
  const clearBtn = document.querySelector('#clear-selection svg');
  if (clearBtn) {
    clearBtn.setAttribute('fill', 'none');
    clearBtn.setAttribute('stroke', 'currentColor');
    clearBtn.innerHTML = `
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" stroke-width="2"/>
      <path d="M10 11v6M14 11v6" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  // Info circle icon
  const infoBtn = document.querySelector('#toggle-info svg');
  if (infoBtn) {
    infoBtn.setAttribute('fill', 'none');
    infoBtn.setAttribute('stroke', 'currentColor');
    infoBtn.innerHTML = `
      <circle cx="12" cy="12" r="10" stroke-width="2"/>
      <path d="M12 16v-4M12 8h.01" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  // Zoom in (magnifying glass with +)
  const zoomInBtn = document.querySelector('#zoom-in svg');
  if (zoomInBtn) {
    zoomInBtn.setAttribute('fill', 'none');
    zoomInBtn.setAttribute('stroke', 'currentColor');
    zoomInBtn.innerHTML = `
      <circle cx="11" cy="11" r="8" stroke-width="2"/>
      <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  // Zoom out (magnifying glass with -)
  const zoomOutBtn = document.querySelector('#zoom-out svg');
  if (zoomOutBtn) {
    zoomOutBtn.setAttribute('fill', 'none');
    zoomOutBtn.setAttribute('stroke', 'currentColor');
    zoomOutBtn.innerHTML = `
      <circle cx="11" cy="11" r="8" stroke-width="2"/>
      <path d="M21 21l-4.35-4.35M8 11h6" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  // Fit to selection (expand corners)
  const fitBtn = document.querySelector('#fit-bounds svg');
  if (fitBtn) {
    fitBtn.setAttribute('fill', 'none');
    fitBtn.setAttribute('stroke', 'currentColor');
    fitBtn.innerHTML = `
      <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  // Download icon (arrow down to tray)
  const downloadBtn = document.querySelector('#download-tiles svg');
  if (downloadBtn) {
    downloadBtn.setAttribute('fill', 'none');
    downloadBtn.setAttribute('stroke', 'currentColor');
    downloadBtn.innerHTML = `
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  // Menu hamburger icon
  const menuBtn = document.querySelector('#menu-toggle svg');
  if (menuBtn) {
    menuBtn.setAttribute('fill', 'none');
    menuBtn.setAttribute('stroke', 'currentColor');
    menuBtn.innerHTML = `
      <path d="M3 12h18M3 6h18M3 18h18" stroke-width="2" stroke-linecap="round"/>
    `;
  }

  // Improve tooltips
  const betterTooltips = {
    'draw-rectangle': 'Draw selection box (click and drag)',
    'clear-selection': 'Clear all selections',
    'toggle-info': 'Toggle selection panel',
    'zoom-in': 'Zoom in',
    'zoom-out': 'Zoom out',
    'fit-bounds': 'Fit to selection',
    'download-tiles': 'Download selected tiles',
    'menu-toggle': 'Settings',
  };

  Object.entries(betterTooltips).forEach(([id, text]) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.setAttribute('title', text);
      btn.setAttribute('aria-label', text);
    }
  });
}
