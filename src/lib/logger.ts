export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface WindowWithDebug extends Window {
  __SRTM2TAK_DEBUG__?: boolean;
}

interface ImportMeta {
  env?: {
    MODE?: string;
  };
}

function isDebugEnabled(): boolean {
  // Enable via dev mode or explicit flag on window
  try {
    if (typeof window !== 'undefined' && (window as WindowWithDebug).__SRTM2TAK_DEBUG__) return true;
  } catch {
    // Ignore access errors
  }
  try {
    return !!((import.meta as ImportMeta)?.env?.MODE === 'development');
  } catch {
    return false;
  }
}

export const logger = {
  debug: (..._args: unknown[]): void => {
    // Intentionally a no-op by default to satisfy lint rules and avoid noise
    // Enable by setting window.__SRTM2TAK_DEBUG__ = true in the console
    if (isDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.log('[DEBUG]', ..._args);
    }
  },
  info: (...args: unknown[]): void => {
    console.warn('[INFO]', ...args);
  },
  warn: (...args: unknown[]): void => {
    console.warn('[WARN]', ...args);
  },
  error: (...args: unknown[]): void => {
    console.error('[ERROR]', ...args);
  },
};

