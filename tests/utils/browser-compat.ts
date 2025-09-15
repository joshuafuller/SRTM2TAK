/**
 * Browser compatibility detection utilities
 */

export interface BrowserCapabilities {
  serviceWorker: boolean;
  indexedDB: boolean;
  webWorker: boolean;
  fetch: boolean;
  arrayBuffer: boolean;
  blob: boolean;
  fileAPI: boolean;
  storageQuota: boolean;
  performanceMemory: boolean;
  webGL: boolean;
  offscreenCanvas: boolean;
  streamAPI: boolean;
  compression: boolean;
}

/**
 * Detect browser capabilities
 */
export function detectCapabilities(): BrowserCapabilities {
  return {
    serviceWorker: 'serviceWorker' in navigator,
    indexedDB: 'indexedDB' in window,
    webWorker: typeof Worker !== 'undefined',
    fetch: 'fetch' in window,
    arrayBuffer: typeof ArrayBuffer !== 'undefined',
    blob: typeof Blob !== 'undefined',
    fileAPI: typeof File !== 'undefined' && typeof FileReader !== 'undefined',
    storageQuota: 'storage' in navigator && 'estimate' in navigator.storage,
    performanceMemory: 'memory' in performance,
    webGL: !!document.createElement('canvas').getContext('webgl'),
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    streamAPI: typeof ReadableStream !== 'undefined',
    compression: 'CompressionStream' in window || 'DecompressionStream' in window,
  };
}

/**
 * Check if all required features are available
 */
export function checkRequiredFeatures(): {
  supported: boolean;
  missing: string[];
} {
  const required: (keyof BrowserCapabilities)[] = [
    'indexedDB',
    'fetch',
    'arrayBuffer',
    'blob',
    'fileAPI',
  ];
  
  const capabilities = detectCapabilities();
  const missing: string[] = [];
  
  for (const feature of required) {
    if (!capabilities[feature]) {
      missing.push(feature);
    }
  }
  
  return {
    supported: missing.length === 0,
    missing,
  };
}

/**
 * Get browser information
 */
export function getBrowserInfo(): {
  name: string;
  version: string;
  platform: string;
  mobile: boolean;
} {
  const ua = navigator.userAgent;
  let name = 'Unknown';
  let version = 'Unknown';
  
  // Detect browser
  if (ua.indexOf('Firefox') > -1) {
    name = 'Firefox';
    version = ua.match(/Firefox\/(\d+\.\d+)/)?.[1] || 'Unknown';
  } else if (ua.indexOf('Chrome') > -1) {
    name = 'Chrome';
    version = ua.match(/Chrome\/(\d+\.\d+)/)?.[1] || 'Unknown';
  } else if (ua.indexOf('Safari') > -1) {
    name = 'Safari';
    version = ua.match(/Version\/(\d+\.\d+)/)?.[1] || 'Unknown';
  } else if (ua.indexOf('Edge') > -1) {
    name = 'Edge';
    version = ua.match(/Edge\/(\d+\.\d+)/)?.[1] || 'Unknown';
  }
  
  // Detect platform
  let platform = 'Unknown';
  if (ua.indexOf('Win') > -1) platform = 'Windows';
  else if (ua.indexOf('Mac') > -1) platform = 'macOS';
  else if (ua.indexOf('Linux') > -1) platform = 'Linux';
  else if (ua.indexOf('Android') > -1) platform = 'Android';
  else if (ua.indexOf('iOS') > -1 || ua.indexOf('iPhone') > -1) platform = 'iOS';
  
  // Detect mobile
  const mobile = /Mobile|Android|iPhone|iPad|iPod/i.test(ua);
  
  return { name, version, platform, mobile };
}

/**
 * Get storage quota information
 */
export async function getStorageQuota(): Promise<{
  usage: number;
  quota: number;
  percentUsed: number;
} | null> {
  if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
    return null;
  }
  
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
      percentUsed: ((estimate.usage || 0) / (estimate.quota || 1)) * 100,
    };
  } catch {
    return null;
  }
}

/**
 * Test if a specific API works
 */
export async function testAPI(
  apiName: string,
  testFn: () => Promise<boolean>
): Promise<{ name: string; supported: boolean; error?: string }> {
  try {
    const supported = await testFn();
    return { name: apiName, supported };
  } catch (error) {
    return {
      name: apiName,
      supported: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run comprehensive compatibility tests
 */
export async function runCompatibilityTests(): Promise<{
  browser: ReturnType<typeof getBrowserInfo>;
  capabilities: BrowserCapabilities;
  required: ReturnType<typeof checkRequiredFeatures>;
  storage: Awaited<ReturnType<typeof getStorageQuota>>;
  apiTests: Array<{ name: string; supported: boolean; error?: string }>;
}> {
  const apiTests = await Promise.all([
    testAPI('IndexedDB', async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('test', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      await new Promise((resolve, reject) => {
        const del = indexedDB.deleteDatabase('test');
        del.onsuccess = () => resolve(true);
        del.onerror = () => reject(del.error);
      });
      return true;
    }),
    
    testAPI('Fetch API', async () => {
      const response = await fetch('data:text/plain,test');
      return response.ok;
    }),
    
    testAPI('ArrayBuffer', async () => {
      const buffer = new ArrayBuffer(1024);
      return buffer.byteLength === 1024;
    }),
    
    testAPI('Blob', async () => {
      const blob = new Blob(['test'], { type: 'text/plain' });
      return blob.size === 4;
    }),
    
    testAPI('File API', async () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      return file.size === 4;
    }),
  ]);
  
  return {
    browser: getBrowserInfo(),
    capabilities: detectCapabilities(),
    required: checkRequiredFeatures(),
    storage: await getStorageQuota(),
    apiTests,
  };
}

/**
 * Assert browser compatibility
 */
export function assertBrowserCompatibility(): void {
  const { supported, missing } = checkRequiredFeatures();
  
  if (!supported) {
    throw new Error(
      `Browser missing required features: ${missing.join(', ')}`
    );
  }
}