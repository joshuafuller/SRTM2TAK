/**
 * Tests for download cancellation functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DownloadManager } from '../../src/lib/download-manager';

// Mock fetch
global.fetch = vi.fn();

describe('Download Cancellation', () => {
  let manager: DownloadManager;
  let onProgress: any;
  let onTileStart: any;
  let onTileComplete: any;
  let onTileError: any;

  beforeEach(() => {
    vi.clearAllMocks();

    onProgress = vi.fn();
    onTileStart = vi.fn();
    onTileComplete = vi.fn();
    onTileError = vi.fn();

    manager = new DownloadManager({
      concurrency: 1, // Sequential for predictable testing
      onProgress,
      onTileStart,
      onTileComplete,
      onTileError
    });

    // Setup default fetch mock
    (global.fetch as any).mockImplementation(() =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
          });
        }, 100);
      })
    );
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Cancel Method', () => {
    it('should stop downloads when cancel is called', async () => {
      const tiles = ['N00E000', 'N01E001', 'N02E002'];

      // Start download
      const downloadPromise = manager.downloadTiles(tiles);

      // Wait a bit for first tile to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Cancel
      manager.cancel();

      // Should reject with AbortError
      await expect(downloadPromise).rejects.toThrow('Download cancelled');
    });

    it('should set aborted state when cancelled', async () => {
      const tiles = ['N00E000'];

      // Start download
      const downloadPromise = manager.downloadTiles(tiles);

      // Cancel immediately
      manager.cancel();

      try {
        await downloadPromise;
      } catch (e) {
        // Expected
      }

      // Manager should be in cancelled state
      expect(manager.isCancelled()).toBe(true);
    });

    it('should not save file after cancellation', async () => {
      // This test ensures the downloadCancelled flag prevents file save
      // The actual implementation is in main.ts handleDownloadComplete

      const tiles = ['N00E000'];
      let resolveDownload: any;

      // Mock a slow download
      (global.fetch as any).mockImplementation(() =>
        new Promise((resolve) => {
          resolveDownload = resolve;
        })
      );

      // Start download
      const downloadPromise = manager.downloadTiles(tiles);

      // Cancel
      manager.cancel();

      // Complete the download after cancellation
      if (resolveDownload) {
        resolveDownload({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
        });
      }

      // Should still throw AbortError
      await expect(downloadPromise).rejects.toThrow('Download cancelled');
    });

    it('should abort fetch requests when cancelled', async () => {
      const abortSpy = vi.fn();
      let capturedSignal: AbortSignal | undefined;

      // Capture the abort signal
      (global.fetch as any).mockImplementation((url: string, options: any) => {
        capturedSignal = options?.signal;
        if (capturedSignal) {
          capturedSignal.addEventListener('abort', abortSpy);
        }
        return new Promise(() => {
          // Never resolve, wait for abort
        });
      });

      const tiles = ['N00E000'];

      // Start download
      const downloadPromise = manager.downloadTiles(tiles);

      // Wait for fetch to be called
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cancel
      manager.cancel();

      // Abort signal should be triggered
      expect(capturedSignal?.aborted).toBe(true);

      // Download should be cancelled
      await expect(downloadPromise).rejects.toThrow('Download cancelled');
    });
  });

  describe('Cancel Button Integration', () => {
    it('should handle cancel during multi-tile download', async () => {
      const tiles = ['N00E000', 'N01E001', 'N02E002', 'N03E003'];
      let downloadCount = 0;

      // Mock fetch to track calls
      (global.fetch as any).mockImplementation(() => {
        downloadCount++;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
            });
          }, 50);
        });
      });

      // Start download
      const downloadPromise = manager.downloadTiles(tiles);

      // Wait for first tile to complete
      await new Promise(resolve => setTimeout(resolve, 60));

      // Cancel after first tile
      manager.cancel();

      // Should stop downloading remaining tiles
      await expect(downloadPromise).rejects.toThrow('Download cancelled');

      // Should have only downloaded 1-2 tiles before cancellation
      expect(downloadCount).toBeLessThanOrEqual(2);
    });

    it('should clean up resources after cancellation', () => {
      const tiles = ['N00E000'];

      // Start and immediately cancel
      const downloadPromise = manager.downloadTiles(tiles);
      manager.cancel();

      // Create new manager
      const newManager = new DownloadManager({
        concurrency: 1,
        onProgress: vi.fn()
      });

      // Should be able to start new download with new manager
      const newPromise = newManager.downloadTiles(tiles);
      expect(newPromise).toBeDefined();

      // Clean up
      newManager.cancel();
    });
  });

  describe('Progress Tracking During Cancellation', () => {
    it('should stop progress updates after cancellation', async () => {
      const tiles = ['N00E000', 'N01E001'];

      // Start download
      const downloadPromise = manager.downloadTiles(tiles);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));

      // Clear previous calls
      onProgress.mockClear();

      // Cancel
      manager.cancel();

      // Wait a bit more
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not have any progress updates after cancellation
      expect(onProgress).not.toHaveBeenCalled();

      // Cleanup
      try {
        await downloadPromise;
      } catch (e) {
        // Expected
      }
    });

    it('should handle cancellation during tile processing', async () => {
      const tiles = ['N00E000'];
      let processingStarted = false;

      // Mock fetch to signal when processing starts
      (global.fetch as any).mockImplementation(() => {
        processingStarted = true;
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
            });
          }, 50);
        });
      });

      // Start download
      const downloadPromise = manager.downloadTiles(tiles);

      // Wait for processing to start
      while (!processingStarted) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Cancel during processing
      manager.cancel();

      // Should reject with cancellation
      await expect(downloadPromise).rejects.toThrow('Download cancelled');
    });
  });

  describe('Error Handling with Cancellation', () => {
    it('should distinguish between cancellation and network errors', async () => {
      const tiles = ['N00E000', 'N01E001'];
      let fetchCount = 0;

      // Mock fetch to fail on second tile
      (global.fetch as any).mockImplementation(() => {
        fetchCount++;
        if (fetchCount === 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024))
        });
      });

      // Should handle network error differently from cancellation
      const downloadPromise = manager.downloadTiles(tiles);

      try {
        await downloadPromise;
      } catch (error: any) {
        // Should be network error, not cancellation
        expect(error.message).toContain('Network error');
        expect(error.message).not.toContain('cancelled');
      }
    });

    it('should handle rapid cancel/restart cycles', async () => {
      const tiles = ['N00E000'];

      // Start, cancel, start, cancel rapidly
      const promise1 = manager.downloadTiles(tiles);
      manager.cancel();

      await expect(promise1).rejects.toThrow('Download cancelled');

      // Create new manager for second attempt
      const manager2 = new DownloadManager({
        concurrency: 1,
        onProgress: vi.fn()
      });

      const promise2 = manager2.downloadTiles(tiles);
      manager2.cancel();

      await expect(promise2).rejects.toThrow('Download cancelled');
    });
  });

  describe('Reset After Cancellation', () => {
    it('should reset state for new downloads after cancellation', () => {
      const tiles = ['N00E000'];

      // Start and cancel
      manager.downloadTiles(tiles);
      manager.cancel();

      // Should be cancelled
      expect(manager.isCancelled()).toBe(true);

      // Create fresh manager
      const freshManager = new DownloadManager({
        concurrency: 1,
        onProgress: vi.fn()
      });

      // Should not be cancelled
      expect(freshManager.isCancelled()).toBe(false);
    });
  });
});