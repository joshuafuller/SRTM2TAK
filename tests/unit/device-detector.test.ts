import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DeviceDetector } from '@/lib/device-detector';

describe('DeviceDetector', () => {
  let originalUserAgent: string;
  let originalPlatform: string;
  
  beforeEach(() => {
    originalUserAgent = navigator.userAgent;
    originalPlatform = navigator.platform;
  });
  
  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      writable: true,
    });
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
    });
  });
  
  describe('getConstraints', () => {
    it('should identify iOS Safari and return constraints', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        writable: true,
      });
      
      const constraints = DeviceDetector.getConstraints();
      
      expect(constraints.platform).toBe('iOS');
      expect(constraints.browser).toBe('Safari');
      expect(constraints.isMobile).toBe(true);
      expect(constraints.maxTiles).toBeLessThanOrEqual(10);
      expect(constraints.maxMemoryMB).toBeLessThanOrEqual(512);
      expect(constraints.maxConcurrentDownloads).toBeLessThanOrEqual(2);
    });
    
    it('should identify Android Chrome and return constraints', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Mobile Safari/537.36',
        writable: true,
      });
      
      const constraints = DeviceDetector.getConstraints();
      
      expect(constraints.platform).toBe('Android');
      expect(constraints.browser).toBe('Chrome');
      expect(constraints.isMobile).toBe(true);
      expect(constraints.maxTiles).toBeLessThanOrEqual(20);
      expect(constraints.supportsFileSystemAPI).toBe(false);
    });
    
    it('should identify desktop Chrome and return higher limits', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
        writable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        writable: true,
      });
      delete (global as any).ontouchstart;
      
      const constraints = DeviceDetector.getConstraints();
      
      expect(constraints.platform).toBe('Windows');
      expect(constraints.browser).toBe('Chrome');
      expect(constraints.isMobile).toBe(false);
      expect(constraints.maxTiles).toBeGreaterThanOrEqual(50);
      expect(constraints.maxMemoryMB).toBeGreaterThanOrEqual(1024);
      expect(constraints.maxConcurrentDownloads).toBeGreaterThanOrEqual(5);
    });
  });
  
  describe('platform detection', () => {
    it('should detect iOS', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        writable: true,
      });
      
      expect(DeviceDetector.isIOS()).toBe(true);
      expect(DeviceDetector.isAndroid()).toBe(false);
    });
    
    it('should detect Android', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36',
        writable: true,
      });
      
      expect(DeviceDetector.isAndroid()).toBe(true);
      expect(DeviceDetector.isIOS()).toBe(false);
    });
    
    it('should detect mobile devices', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        writable: true,
      });
      
      expect(DeviceDetector.isMobile()).toBe(true);
      expect(DeviceDetector.isDesktop()).toBe(false);
    });
    
    it('should detect desktop devices', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        writable: true,
      });
      Object.defineProperty(navigator, 'maxTouchPoints', {
        value: 0,
        writable: true,
      });
      delete (global as any).ontouchstart;
      
      expect(DeviceDetector.isDesktop()).toBe(true);
      expect(DeviceDetector.isMobile()).toBe(false);
    });
  });
  
  describe('browser detection', () => {
    it('should detect Safari', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Safari/605.1.15',
        writable: true,
      });
      
      expect(DeviceDetector.getBrowser()).toBe('Safari');
    });
    
    it('should detect Firefox', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:95.0) Gecko/20100101 Firefox/95.0',
        writable: true,
      });
      
      expect(DeviceDetector.getBrowser()).toBe('Firefox');
    });
    
    it('should detect Edge', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36 Edg/96.0.1054.62',
        writable: true,
      });
      
      expect(DeviceDetector.getBrowser()).toBe('Edge');
    });
  });
  
  describe('feature detection', () => {
    it('should detect available features', () => {
      const features = DeviceDetector.getFeatures();
      
      expect(features).toHaveProperty('serviceWorker');
      expect(features).toHaveProperty('indexedDB');
      expect(features).toHaveProperty('webGL');
      expect(features).toHaveProperty('fileSystemAPI');
      expect(features).toHaveProperty('offscreenCanvas');
    });
    
    it('should check for PWA support', () => {
      const isPWACapable = DeviceDetector.isPWACapable();
      
      expect(typeof isPWACapable).toBe('boolean');
    });
  });
  
  describe('memory estimation', () => {
    it('should estimate available memory', () => {
      const memory = DeviceDetector.estimateMemory();
      
      expect(memory).toHaveProperty('estimated');
      expect(memory).toHaveProperty('confidence');
      expect(memory.estimated).toBeGreaterThan(0);
      expect(memory.confidence).toBeGreaterThan(0);
      expect(memory.confidence).toBeLessThanOrEqual(1);
    });
    
    it('should use performance.memory when available', () => {
      (global.performance as any).memory = {
        jsHeapSizeLimit: 2147483648, // 2GB
      };
      
      const memory = DeviceDetector.estimateMemory();
      
      expect(memory.estimated).toBeCloseTo(2048, 0); // ~2GB in MB
      expect(memory.confidence).toBeGreaterThan(0.8); // High confidence
    });
  });
  
  describe('recommendations', () => {
    it('should provide device-specific recommendations', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
        writable: true,
      });
      
      const recommendations = DeviceDetector.getRecommendations();
      
      expect(recommendations).toHaveProperty('enableCompression');
      expect(recommendations).toHaveProperty('useLowResMode');
      expect(recommendations).toHaveProperty('cacheStrategy');
      expect(recommendations).toHaveProperty('downloadStrategy');
      
      // iOS should have conservative settings
      expect(recommendations.enableCompression).toBe(true);
      expect(recommendations.cacheStrategy).toBe('minimal');
    });
    
    it('should recommend different settings for desktop', () => {
      Object.defineProperty(navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        writable: true,
      });
      
      const recommendations = DeviceDetector.getRecommendations();
      
      // Desktop should have more aggressive settings
      expect(recommendations.cacheStrategy).toBe('aggressive');
      expect(recommendations.downloadStrategy).toBe('parallel');
    });
  });
  
  describe('screen information', () => {
    it('should get screen dimensions', () => {
      const screen = DeviceDetector.getScreenInfo();
      
      expect(screen).toHaveProperty('width');
      expect(screen).toHaveProperty('height');
      expect(screen).toHaveProperty('pixelRatio');
      expect(screen).toHaveProperty('orientation');
    });
    
    it('should detect high DPI screens', () => {
      Object.defineProperty(window, 'devicePixelRatio', {
        value: 2,
        writable: true,
      });
      
      const isHighDPI = DeviceDetector.isHighDPI();
      
      expect(isHighDPI).toBe(true);
    });
  });
});