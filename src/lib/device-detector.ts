/**
 * Device Detector for identifying platform capabilities and constraints
 * Provides device-specific recommendations for optimal performance
 */

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface NavigatorConnection {
  effectiveType: string;
}

interface ExtendedPerformance extends Performance {
  memory?: PerformanceMemory;
}

interface ExtendedNavigator extends Navigator {
  connection?: NavigatorConnection;
}

export interface DeviceConstraints {
  platform: string;
  browser: string;
  isMobile: boolean;
  maxTiles: number;
  maxMemoryMB: number;
  maxConcurrentDownloads: number;
  supportsServiceWorker: boolean;
  supportsIndexedDB: boolean;
  supportsFileSystemAPI: boolean;
  recommendCompression: boolean;
}

export interface DeviceFeatures {
  serviceWorker: boolean;
  indexedDB: boolean;
  webGL: boolean;
  fileSystemAPI: boolean;
  offscreenCanvas: boolean;
  webWorker: boolean;
  storageQuota: boolean;
}

export interface ScreenInfo {
  width: number;
  height: number;
  pixelRatio: number;
  orientation: 'portrait' | 'landscape';
}

export interface MemoryEstimate {
  estimated: number; // MB
  confidence: number; // 0-1
}

export interface DeviceRecommendations {
  enableCompression: boolean;
  useLowResMode: boolean;
  cacheStrategy: 'aggressive' | 'moderate' | 'minimal';
  downloadStrategy: 'parallel' | 'sequential';
  maxConcurrentDownloads: number;
  tileLimit: number;
}

export class DeviceDetector {
  /**
   * Get device constraints based on platform detection
   */
  static getConstraints(): DeviceConstraints {
    const platform = this.getPlatform();
    const browser = this.getBrowser();
    const isMobile = this.isMobile();
    const features = this.getFeatures();
    
    // Set constraints based on device type
    let maxTiles: number;
    let maxMemoryMB: number;
    let maxConcurrentDownloads: number;
    let recommendCompression: boolean;
    
    if (this.isIOS()) {
      // iOS has strict memory limits
      maxTiles = 10;
      maxMemoryMB = 400;
      maxConcurrentDownloads = 2;
      recommendCompression = true;
    } else if (this.isAndroid()) {
      // Android varies but generally more permissive
      maxTiles = 20;
      maxMemoryMB = 800;
      maxConcurrentDownloads = 3;
      recommendCompression = true;
    } else if (isMobile) {
      // Other mobile devices
      maxTiles = 15;
      maxMemoryMB = 600;
      maxConcurrentDownloads = 2;
      recommendCompression = true;
    } else {
      // Desktop
      maxTiles = 100;
      maxMemoryMB = 2048;
      maxConcurrentDownloads = 5;
      recommendCompression = false;
    }
    
    return {
      platform,
      browser,
      isMobile,
      maxTiles,
      maxMemoryMB,
      maxConcurrentDownloads,
      supportsServiceWorker: features.serviceWorker,
      supportsIndexedDB: features.indexedDB,
      supportsFileSystemAPI: features.fileSystemAPI,
      recommendCompression,
    };
  }
  
  /**
   * Detect platform
   */
  static getPlatform(): string {
    const ua = navigator.userAgent || '';
    const platform = (navigator.platform || '').toString();
    // Prefer UA when platform is unavailable or generic
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(platform) || /Windows/.test(ua)) return 'Windows';
    if (/Mac/.test(platform) || /(Macintosh|Mac OS X)/.test(ua)) return 'macOS';
    if (/Linux/.test(platform) || /Linux/.test(ua)) return 'Linux';
    return 'Unknown';
  }
  
  /**
   * Detect browser
   */
  static getBrowser(): string {
    const ua = navigator.userAgent;
    
    if (/Edg\//.test(ua)) return 'Edge';
    if (/Chrome/.test(ua) && !/Edg/.test(ua)) return 'Chrome';
    if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'Safari';
    if (/Firefox/.test(ua)) return 'Firefox';
    if (/Opera|OPR/.test(ua)) return 'Opera';
    
    return 'Unknown';
  }
  
  /**
   * Check if iOS
   */
  static isIOS(): boolean {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  
  /**
   * Check if Android
   */
  static isAndroid(): boolean {
    return /Android/.test(navigator.userAgent);
  }
  
  /**
   * Check if mobile device
   */
  static isMobile(): boolean {
    return /Mobile|Android|iPhone|iPad|iPod/.test(navigator.userAgent) ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0);
  }
  
  /**
   * Check if desktop device
   */
  static isDesktop(): boolean {
    return !this.isMobile();
  }
  
  /**
   * Get available features
   */
  static getFeatures(): DeviceFeatures {
    return {
      serviceWorker: 'serviceWorker' in navigator,
      indexedDB: 'indexedDB' in window,
      webGL: this.hasWebGL(),
      fileSystemAPI: 'showOpenFilePicker' in window,
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      webWorker: typeof Worker !== 'undefined',
      storageQuota: 'storage' in navigator && 'estimate' in navigator.storage,
    };
  }
  
  /**
   * Check for WebGL support
   */
  private static hasWebGL(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }
  
  /**
   * Check if PWA capable
   */
  static isPWACapable(): boolean {
    const features = this.getFeatures();
    return features.serviceWorker && features.indexedDB;
  }
  
  /**
   * Estimate available memory
   */
  static estimateMemory(): MemoryEstimate {
    // Try to use performance.memory if available
    if ('memory' in performance) {
      const memory = (performance as ExtendedPerformance).memory;
      if (memory && memory.jsHeapSizeLimit) {
        return {
          estimated: Math.floor(memory.jsHeapSizeLimit / (1024 * 1024)),
          confidence: 0.9,
        };
      }
    }
    
    // Fallback estimates based on device type
    if (this.isIOS()) {
      // Conservative estimate for iOS
      const isIPad = /iPad/.test(navigator.userAgent);
      return {
        estimated: isIPad ? 1024 : 512,
        confidence: 0.5,
      };
    }
    
    if (this.isAndroid()) {
      // Android varies widely
      return {
        estimated: 1024,
        confidence: 0.3,
      };
    }
    
    if (this.isMobile()) {
      return {
        estimated: 512,
        confidence: 0.3,
      };
    }
    
    // Desktop estimate
    return {
      estimated: 4096,
      confidence: 0.4,
    };
  }
  
  /**
   * Get device recommendations
   */
  static getRecommendations(): DeviceRecommendations {
    const constraints = this.getConstraints();
    const memory = this.estimateMemory();
    
    let enableCompression = constraints.recommendCompression;
    let useLowResMode = false;
    let cacheStrategy: 'aggressive' | 'moderate' | 'minimal';
    let downloadStrategy: 'parallel' | 'sequential';
    let maxConcurrentDownloads = constraints.maxConcurrentDownloads;
    let tileLimit = constraints.maxTiles;
    
    // Adjust based on memory
    if (memory.estimated < 512) {
      enableCompression = true;
      useLowResMode = true;
      cacheStrategy = 'minimal';
      downloadStrategy = 'sequential';
      maxConcurrentDownloads = 1;
      tileLimit = Math.min(tileLimit, 5);
    } else if (memory.estimated < 1024) {
      enableCompression = true;
      cacheStrategy = 'moderate';
      downloadStrategy = 'sequential';
      maxConcurrentDownloads = Math.min(maxConcurrentDownloads, 2);
    } else if (memory.estimated < 2048) {
      cacheStrategy = 'moderate';
      downloadStrategy = 'parallel';
    } else {
      cacheStrategy = 'aggressive';
      downloadStrategy = 'parallel';
    }
    
    // iOS specific adjustments
    if (this.isIOS()) {
      cacheStrategy = 'minimal';
      enableCompression = true;
    }
    
    return {
      enableCompression,
      useLowResMode,
      cacheStrategy,
      downloadStrategy,
      maxConcurrentDownloads,
      tileLimit,
    };
  }
  
  /**
   * Get screen information
   */
  static getScreenInfo(): ScreenInfo {
    return {
      width: window.screen.width,
      height: window.screen.height,
      pixelRatio: window.devicePixelRatio || 1,
      orientation: window.screen.width > window.screen.height ? 'landscape' : 'portrait',
    };
  }
  
  /**
   * Check if high DPI screen
   */
  static isHighDPI(): boolean {
    return (window.devicePixelRatio || 1) > 1;
  }
  
  /**
   * Get connection type (if available)
   */
  static getConnectionType(): string {
    if ('connection' in navigator) {
      const connection = (navigator as ExtendedNavigator).connection;
      if (connection && connection.effectiveType) {
        return connection.effectiveType;
      }
    }
    return 'unknown';
  }
  
  /**
   * Check if device has good connectivity
   */
  static hasGoodConnectivity(): boolean {
    const type = this.getConnectionType();
    return type === '4g' || type === 'wifi' || type === 'unknown';
  }
  
  /**
   * Get storage quota estimate
   */
  static async getStorageQuota(): Promise<{ usage: number; quota: number } | null> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        return {
          usage: estimate.usage || 0,
          quota: estimate.quota || 0,
        };
      } catch {
        return null;
      }
    }
    return null;
  }
  
  /**
   * Check if persistent storage is available
   */
  static async canPersistStorage(): Promise<boolean> {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      try {
        return await navigator.storage.persist();
      } catch {
        return false;
      }
    }
    return false;
  }
}
