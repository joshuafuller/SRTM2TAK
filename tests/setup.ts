import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { server } from './mocks/server';

// Start mock server before all tests
// Allow non-HTTP schemes (e.g., data: URLs for wasm) to bypass MSW
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());

// Mock browser APIs
(global.performance as any) = {
  ...global.performance,
  memory: {
    usedJSHeapSize: 50 * 1024 * 1024,
    totalJSHeapSize: 100 * 1024 * 1024,
    jsHeapSizeLimit: 2048 * 1024 * 1024,
  },
};

// Mock IndexedDB
import 'fake-indexeddb/auto';

// Mock service worker
(global.navigator as any).serviceWorker = {
  register: vi.fn().mockResolvedValue({}),
  ready: Promise.resolve({} as ServiceWorkerRegistration),
};

// Mock HTMLCanvasElement for canvas operations
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn().mockImplementation((contextType) => {
    if (contextType === 'webgl' || contextType === 'experimental-webgl') {
      return {
        getExtension: vi.fn(),
        getParameter: vi.fn(),
        getSupportedExtensions: vi.fn().mockReturnValue(['WEBGL_lose_context']),
      };
    }
    if (contextType === '2d') {
      return {
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        getImageData: vi.fn(),
        putImageData: vi.fn(),
        createImageData: vi.fn(),
        setTransform: vi.fn(),
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
      };
    }
    return null;
  }),
  writable: true,
  configurable: true,
});

// Mock Blob.arrayBuffer() method for Node.js environment
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function() {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}

// Extend expect matchers for better Blob testing
expect.extend({
  toBeInstanceOfBlob(received) {
    const pass = received && typeof received === 'object' && 
                 ('size' in received) && ('type' in received) &&
                 (received.constructor.name === 'Blob' || received instanceof Blob);
    return {
      message: () =>
        `expected ${received} to ${pass ? 'not ' : ''}be an instance of Blob`,
      pass,
    };
  },
});

declare module 'vitest' {
  interface Assertion {
    toBeInstanceOfBlob(): void;
  }
}
