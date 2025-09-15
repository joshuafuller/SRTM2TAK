import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MemoryMonitor } from '@/lib/memory-monitor';

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;
  
  beforeEach(() => {
    // Mock performance.memory API
    (global.performance as any).memory = {
      usedJSHeapSize: 100 * 1024 * 1024, // 100MB
      totalJSHeapSize: 200 * 1024 * 1024, // 200MB
      jsHeapSizeLimit: 2048 * 1024 * 1024, // 2GB
    };
    
    monitor = new MemoryMonitor({
      warningThreshold: 0.7, // 70%
      criticalThreshold: 0.9, // 90%
      checkInterval: 1000,
    });
  });
  
  describe('checkPressure', () => {
    it('should detect high memory usage', () => {
      // Set high memory usage
      (global.performance as any).memory.usedJSHeapSize = 1900 * 1024 * 1024; // 1.9GB of 2GB
      
      const pressure = monitor.checkPressure();
      
      expect(pressure).toBe(true);
    });
    
    it('should return false when memory usage is low', () => {
      // Set low memory usage
      (global.performance as any).memory.usedJSHeapSize = 100 * 1024 * 1024; // 100MB of 2GB
      
      const pressure = monitor.checkPressure();
      
      expect(pressure).toBe(false);
    });
    
    it('should handle missing memory API gracefully', () => {
      // Remove memory API
      delete (global.performance as any).memory;
      
      const pressure = monitor.checkPressure();
      
      // Should return false when API not available
      expect(pressure).toBe(false);
    });
  });
  
  describe('getMemoryStatus', () => {
    it('should return current memory status', () => {
      const status = monitor.getMemoryStatus();
      
      expect(status).toEqual({
        used: 100 * 1024 * 1024,
        total: 200 * 1024 * 1024,
        limit: 2048 * 1024 * 1024,
        percentUsed: expect.any(Number),
        level: 'normal',
      });
      
      expect(status.percentUsed).toBeCloseTo(4.88, 1); // ~5%
    });
    
    it('should return warning level when threshold exceeded', () => {
      (global.performance as any).memory.usedJSHeapSize = 1500 * 1024 * 1024; // 1.5GB of 2GB (73%)
      
      const status = monitor.getMemoryStatus();
      
      expect(status.level).toBe('warning');
    });
    
    it('should return critical level when threshold exceeded', () => {
      (global.performance as any).memory.usedJSHeapSize = 1900 * 1024 * 1024; // 1.9GB of 2GB (93%)
      
      const status = monitor.getMemoryStatus();
      
      expect(status.level).toBe('critical');
    });
  });
  
  describe('throttleOperations', () => {
    it('should throttle operations under memory pressure', async () => {
      const operation = vi.fn().mockResolvedValue('result');
      
      // Normal memory - should execute immediately
      (global.performance as any).memory.usedJSHeapSize = 100 * 1024 * 1024;
      
      const start = Date.now();
      await monitor.throttleOperation(operation);
      const duration = Date.now() - start;
      
      expect(operation).toHaveBeenCalled();
      expect(duration).toBeLessThan(100); // Should be fast
    });
    
    it('should delay operations when memory is high', async () => {
      const operation = vi.fn().mockResolvedValue('result');
      
      // High memory - should delay
      (global.performance as any).memory.usedJSHeapSize = 1500 * 1024 * 1024;
      
      const start = Date.now();
      await monitor.throttleOperation(operation);
      const duration = Date.now() - start;
      
      expect(operation).toHaveBeenCalled();
      expect(duration).toBeGreaterThanOrEqual(100); // Should have delay
    });
    
    it('should queue operations when critical', async () => {
      // Set critical memory
      (global.performance as any).memory.usedJSHeapSize = 1900 * 1024 * 1024;
      
      const operations = [
        vi.fn().mockResolvedValue('result1'),
        vi.fn().mockResolvedValue('result2'),
        vi.fn().mockResolvedValue('result3'),
      ];
      
      // Start all operations
      const promises = operations.map(op => monitor.throttleOperation(op));
      
      // Should queue them
      expect(monitor.getQueueLength()).toBeGreaterThan(0);
      
      // Reduce memory to allow execution
      (global.performance as any).memory.usedJSHeapSize = 100 * 1024 * 1024;
      
      // Wait for all to complete
      await Promise.all(promises);
      
      // All should have been called
      operations.forEach(op => expect(op).toHaveBeenCalled());
    });
  });
  
  describe('clearBuffers', () => {
    it('should clear buffers on pressure', () => {
      const buffers = [
        new ArrayBuffer(10 * 1024 * 1024),
        new ArrayBuffer(10 * 1024 * 1024),
      ];
      
      monitor.registerBuffers(buffers);
      
      // Trigger memory pressure
      (global.performance as any).memory.usedJSHeapSize = 1900 * 1024 * 1024;
      
      monitor.clearBuffersOnPressure();
      
      // Buffers should be cleared (implementation dependent)
      expect(monitor.getRegisteredBufferCount()).toBe(0);
    });
  });
  
  describe('monitoring', () => {
    it('should start and stop monitoring', () => {
      const callback = vi.fn();
      
      monitor.startMonitoring(callback);
      
      expect(monitor.isMonitoring()).toBe(true);
      
      monitor.stopMonitoring();
      
      expect(monitor.isMonitoring()).toBe(false);
    });
    
    it('should call callback when memory changes', async () => {
      const callback = vi.fn();
      
      monitor.startMonitoring(callback, 100); // Check every 100ms
      
      // Change memory
      (global.performance as any).memory.usedJSHeapSize = 1500 * 1024 * 1024;
      
      // Wait for callback
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warning',
        })
      );
      
      monitor.stopMonitoring();
    });
  });
  
  describe('recommendations', () => {
    it('should provide memory recommendations', () => {
      const recommendations = monitor.getRecommendations();
      
      expect(recommendations).toHaveProperty('maxTiles');
      expect(recommendations).toHaveProperty('maxConcurrentDownloads');
      expect(recommendations).toHaveProperty('enableCompression');
    });
    
    it('should adjust recommendations based on available memory', () => {
      // Low memory device
      (global.performance as any).memory.jsHeapSizeLimit = 512 * 1024 * 1024; // 512MB
      
      const lowMemRecs = monitor.getRecommendations();
      
      // High memory device
      (global.performance as any).memory.jsHeapSizeLimit = 4096 * 1024 * 1024; // 4GB
      
      const highMemRecs = monitor.getRecommendations();
      
      expect(lowMemRecs.maxTiles).toBeLessThan(highMemRecs.maxTiles);
      expect(lowMemRecs.enableCompression).toBe(true);
    });
  });
  
  describe('memory leak detection', () => {
    it('should detect potential memory leaks', async () => {
      const initialMemory = 100 * 1024 * 1024;
      (global.performance as any).memory.usedJSHeapSize = initialMemory;

      monitor.startLeakDetection();

      // Simulate gradual memory increase and populate history
      for (let i = 1; i <= 10; i++) {
        (global.performance as any).memory.usedJSHeapSize = initialMemory + (i * 10 * 1024 * 1024);
        monitor.checkForLeak(); // This populates the memory history
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const leakDetected = monitor.checkForLeak();

      expect(leakDetected).toBe(true);
    });
  });
});