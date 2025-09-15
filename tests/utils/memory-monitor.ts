/**
 * Memory monitoring utilities for testing
 */

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface ExtendedPerformance extends Performance {
  memory?: PerformanceMemory;
}

interface ExtendedGlobal {
  gc?: () => void;
}

export interface MemorySnapshot {
  timestamp: number;
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  percentUsed: number;
}

/**
 * Check if performance.memory API is available
 */
export function isMemoryAPIAvailable(): boolean {
  return !!(performance as ExtendedPerformance).memory;
}

/**
 * Get current memory usage
 */
export function getMemoryUsage(): MemorySnapshot | null {
  if (!isMemoryAPIAvailable()) {
    return null;
  }
  
  const memory = (performance as ExtendedPerformance).memory!;
  
  return {
    timestamp: Date.now(),
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
    percentUsed: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100,
  };
}

/**
 * Monitor memory usage during a function execution
 */
export async function measureMemoryUsage<T>(
  fn: () => Promise<T>
): Promise<{ result: T; memoryDelta: number; peakMemory: number }> {
  const startMemory = getMemoryUsage();
  const startUsed = startMemory?.usedJSHeapSize || 0;
  let peakMemory = startUsed;
  
  // Monitor memory during execution
  const interval = setInterval(() => {
    const current = getMemoryUsage();
    if (current && current.usedJSHeapSize > peakMemory) {
      peakMemory = current.usedJSHeapSize;
    }
  }, 10);
  
  try {
    const result = await fn();
    
    // Force garbage collection if available (Chrome with --expose-gc flag)
    if (typeof (global as ExtendedGlobal).gc === 'function') {
      (global as ExtendedGlobal).gc!();
    }
    
    const endMemory = getMemoryUsage();
    const endUsed = endMemory?.usedJSHeapSize || 0;
    
    return {
      result,
      memoryDelta: endUsed - startUsed,
      peakMemory: peakMemory - startUsed,
    };
  } finally {
    clearInterval(interval);
  }
}

/**
 * Simulate memory pressure by allocating large buffers
 */
export class MemoryPressureSimulator {
  private buffers: ArrayBuffer[] = [];
  
  /**
   * Allocate memory to simulate pressure
   */
  allocate(megabytes: number): void {
    const bytes = megabytes * 1024 * 1024;
    const buffer = new ArrayBuffer(bytes);
    this.buffers.push(buffer);
    
    // Touch the memory to ensure it's actually allocated
    const view = new Uint8Array(buffer);
    for (let i = 0; i < view.length; i += 4096) {
      view[i] = 1;
    }
  }
  
  /**
   * Release all allocated memory
   */
  release(): void {
    this.buffers = [];
    
    // Try to trigger garbage collection
    if (typeof (global as ExtendedGlobal).gc === 'function') {
      (global as ExtendedGlobal).gc!();
    }
  }
  
  /**
   * Get total allocated memory
   */
  getTotalAllocated(): number {
    return this.buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  }
}

/**
 * Wait for memory to stabilize after operations
 */
export async function waitForMemoryStabilization(
  maxWaitMs: number = 5000,
  checkIntervalMs: number = 100
): Promise<void> {
  if (!isMemoryAPIAvailable()) return;
  
  const startTime = Date.now();
  let previousUsed = getMemoryUsage()?.usedJSHeapSize || 0;
  let stableCount = 0;
  
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const current = getMemoryUsage();
      const currentUsed = current?.usedJSHeapSize || 0;
      
      // Consider stable if memory hasn't changed much in 3 consecutive checks
      if (Math.abs(currentUsed - previousUsed) < 1024 * 1024) {
        stableCount++;
        if (stableCount >= 3) {
          clearInterval(interval);
          resolve();
        }
      } else {
        stableCount = 0;
      }
      
      previousUsed = currentUsed;
      
      // Timeout after maxWaitMs
      if (Date.now() - startTime > maxWaitMs) {
        clearInterval(interval);
        resolve();
      }
    }, checkIntervalMs);
  });
}

/**
 * Assert memory usage is within limits
 */
export function assertMemoryUsage(
  maxMegabytes: number,
  message?: string
): void {
  const memory = getMemoryUsage();
  if (!memory) {
    console.warn('Memory API not available, skipping memory assertion');
    return;
  }
  
  const usedMB = memory.usedJSHeapSize / (1024 * 1024);
  
  if (usedMB > maxMegabytes) {
    throw new Error(
      message || `Memory usage ${usedMB.toFixed(2)}MB exceeds limit of ${maxMegabytes}MB`
    );
  }
}

/**
 * Track memory leaks across test runs
 */
export class MemoryLeakDetector {
  private baseline: number = 0;
  private threshold: number;
  
  constructor(thresholdMB: number = 10) {
    this.threshold = thresholdMB * 1024 * 1024;
  }
  
  setBaseline(): void {
    const memory = getMemoryUsage();
    this.baseline = memory?.usedJSHeapSize || 0;
  }
  
  checkForLeak(): boolean {
    const memory = getMemoryUsage();
    const current = memory?.usedJSHeapSize || 0;
    return (current - this.baseline) > this.threshold;
  }
  
  reset(): void {
    this.baseline = 0;
  }
}