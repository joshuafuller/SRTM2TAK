/**
 * Memory Monitor for tracking and managing memory usage
 * Helps prevent out-of-memory crashes, especially on mobile devices
 */

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface ExtendedPerformance extends Performance {
  memory?: PerformanceMemory;
}

export interface MemoryMonitorOptions {
  warningThreshold?: number;  // Percentage (0.7 = 70%)
  criticalThreshold?: number; // Percentage (0.9 = 90%)
  checkInterval?: number;      // Milliseconds
}

export interface MemoryStatus {
  used: number;
  total: number;
  limit: number;
  percentUsed: number;
  level: 'normal' | 'warning' | 'critical';
}

export interface MemoryRecommendations {
  maxTiles: number;
  maxConcurrentDownloads: number;
  enableCompression: boolean;
  cacheStrategy: 'aggressive' | 'moderate' | 'minimal';
}

type MemoryCallback = (status: MemoryStatus) => void;

export class MemoryMonitor {
  private warningThreshold: number;
  private criticalThreshold: number;
  private checkInterval: number;
  private monitoring: boolean = false;
  private monitorInterval?: ReturnType<typeof setInterval>;
  private callbacks: Set<MemoryCallback> = new Set();
  private registeredBuffers: WeakSet<ArrayBuffer> = new WeakSet();
  private registeredCount = 0;
  private operationQueue: Array<() => Promise<unknown>> = [];
  private processing: boolean = false;
  private baselineMemory: number = 0;
  private memoryHistory: number[] = [];
  private maxHistorySize: number = 100;
  
  constructor(options: MemoryMonitorOptions = {}) {
    this.warningThreshold = options.warningThreshold || 0.7;
    this.criticalThreshold = options.criticalThreshold || 0.9;
    this.checkInterval = options.checkInterval || 1000;
  }
  
  /**
   * Check if memory pressure is high
   */
  checkPressure(): boolean {
    const status = this.getMemoryStatus();
    return status.level !== 'normal';
  }
  
  /**
   * Get current memory status
   */
  getMemoryStatus(): MemoryStatus {
    if (!this.isMemoryAPIAvailable()) {
      // Return safe defaults if API not available
      return {
        used: 0,
        total: 0,
        limit: Infinity,
        percentUsed: 0,
        level: 'normal',
      };
    }
    
    const memory = (performance as ExtendedPerformance).memory!;
    const used = memory.usedJSHeapSize;
    const total = memory.totalJSHeapSize;
    const limit = memory.jsHeapSizeLimit;
    const percentUsed = (used / limit) * 100;
    
    let level: 'normal' | 'warning' | 'critical' = 'normal';
    if (percentUsed >= this.criticalThreshold * 100) {
      level = 'critical';
    } else if (percentUsed >= this.warningThreshold * 100) {
      level = 'warning';
    }
    
    return {
      used,
      total,
      limit,
      percentUsed,
      level,
    };
  }
  
  /**
   * Throttle operations when memory pressure is high
   */
  async throttleOperation<T>(operation: () => Promise<T>): Promise<T> {
    const status = this.getMemoryStatus();
    
    if (status.level === 'normal') {
      // Execute immediately
      return operation();
    }
    
    if (status.level === 'warning') {
      // Add small delay; use slightly >100ms for stability under timers
      await new Promise(resolve => setTimeout(resolve, 120));
      return operation();
    }
    
    // Critical - queue the operation
    return new Promise((resolve, reject) => {
      this.operationQueue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      void this.processQueue();
    });
  }
  
  /**
   * Process queued operations when memory allows
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.operationQueue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.operationQueue.length > 0) {
      const status = this.getMemoryStatus();
      
      if (status.level === 'critical') {
        // Wait for memory to improve
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      
      const operation = this.operationQueue.shift();
      if (operation) {
        await operation();
      }
    }
    
    this.processing = false;
  }
  
  /**
   * Register buffers for clearing on memory pressure
   */
  registerBuffers(buffers: ArrayBuffer[]): void {
    for (const buffer of buffers) {
      this.registeredBuffers.add(buffer);
    }
    this.registeredCount += buffers.length;
  }
  
  /**
   * Clear registered buffers when memory pressure is high
   */
  clearBuffersOnPressure(): void {
    // Note: We can't actually iterate WeakSet or clear buffers directly
    // This would need to be implemented differently in practice
    // For now, just clear the WeakSet reference
    this.registeredBuffers = new WeakSet();
    this.registeredCount = 0;
  }
  
  /**
   * Get count of registered buffers (for testing)
   */
  getRegisteredBufferCount(): number {
    return this.registeredCount;
  }
  
  /**
   * Start monitoring memory
   */
  startMonitoring(callback?: MemoryCallback, interval?: number): void {
    if (this.monitoring) {
      this.stopMonitoring();
    }
    
    if (callback) {
      this.callbacks.add(callback);
    }
    
    this.monitoring = true;
    const checkInterval = interval || this.checkInterval;
    
    this.monitorInterval = setInterval(() => {
      const status = this.getMemoryStatus();
      
      // Notify callbacks
      for (const cb of this.callbacks) {
        cb(status);
      }
      
      // Auto-clear buffers on critical pressure
      if (status.level === 'critical') {
        this.clearBuffersOnPressure();
      }
      
      // Process queued operations
      if (status.level !== 'critical') {
        void this.processQueue();
      }
    }, checkInterval);
  }
  
  /**
   * Stop monitoring memory
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    this.monitoring = false;
    this.callbacks.clear();
  }
  
  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    return this.monitoring;
  }
  
  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.operationQueue.length;
  }
  
  /**
   * Get recommendations based on available memory
   */
  getRecommendations(): MemoryRecommendations {
    const status = this.getMemoryStatus();
    const limitMB = status.limit / (1024 * 1024);
    
    let maxTiles: number;
    let maxConcurrentDownloads: number;
    let enableCompression: boolean;
    let cacheStrategy: 'aggressive' | 'moderate' | 'minimal';
    
    if (limitMB < 512) {
      // Low memory device
      maxTiles = 5;
      maxConcurrentDownloads = 1;
      enableCompression = true;
      cacheStrategy = 'minimal';
    } else if (limitMB < 1024) {
      // Medium memory device
      maxTiles = 10;
      maxConcurrentDownloads = 2;
      enableCompression = true;
      cacheStrategy = 'moderate';
    } else if (limitMB < 2048) {
      // Good memory
      maxTiles = 25;
      maxConcurrentDownloads = 3;
      enableCompression = false;
      cacheStrategy = 'moderate';
    } else {
      // High memory device
      maxTiles = 50;
      maxConcurrentDownloads = 5;
      enableCompression = false;
      cacheStrategy = 'aggressive';
    }
    
    return {
      maxTiles,
      maxConcurrentDownloads,
      enableCompression,
      cacheStrategy,
    };
  }
  
  /**
   * Start leak detection
   */
  startLeakDetection(): void {
    if (this.isMemoryAPIAvailable()) {
      this.baselineMemory = (performance as ExtendedPerformance).memory!.usedJSHeapSize;
      this.memoryHistory = [this.baselineMemory];
    }
  }
  
  /**
   * Check for memory leak
   */
  checkForLeak(): boolean {
    if (!this.isMemoryAPIAvailable() || this.baselineMemory === 0) {
      return false;
    }
    
    const current = (performance as ExtendedPerformance).memory!.usedJSHeapSize;
    this.memoryHistory.push(current);
    
    if (this.memoryHistory.length > this.maxHistorySize) {
      this.memoryHistory.shift();
    }
    
    // Check if memory is consistently increasing
    if (this.memoryHistory.length < 10) {
      return false;
    }
    
    // Calculate trend
    let increasing = 0;
    for (let i = 1; i < this.memoryHistory.length; i++) {
      if (this.memoryHistory[i] > this.memoryHistory[i - 1]) {
        increasing++;
      }
    }
    
    // If memory increased in 80% of samples, likely a leak
    const percentIncreasing = increasing / (this.memoryHistory.length - 1);
    return percentIncreasing > 0.8;
  }
  
  /**
   * Reset leak detection
   */
  resetLeakDetection(): void {
    this.baselineMemory = 0;
    this.memoryHistory = [];
  }
  
  /**
   * Check if performance.memory API is available
   */
  private isMemoryAPIAvailable(): boolean {
    return typeof performance !== 'undefined' && 
           'memory' in performance &&
           (performance as ExtendedPerformance).memory !== undefined;
  }
}
