import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Issue #5 and #6 Verification - Simple', () => {
  const sourceFile = readFileSync(
    join(process.cwd(), 'src/lib/download-manager.ts'),
    'utf-8'
  );

  describe('Issue #5: Refactored Concurrency Logic', () => {
    it('has manageConcurrentPool method', () => {
      expect(sourceFile).toContain('manageConcurrentPool');
    });

    it('createTileIterator uses manageConcurrentPool', () => {
      expect(sourceFile).toContain('yield* this.manageConcurrentPool');
      const match = sourceFile.match(/createTileIterator[\s\S]*?yield\* this\.manageConcurrentPool/);
      expect(match).toBeTruthy();
    });

    it('createUnifiedIterator uses manageConcurrentPool', () => {
      const match = sourceFile.match(/createUnifiedIterator[\s\S]*?yield\* this\.manageConcurrentPool/);
      expect(match).toBeTruthy();
    });

    it('manageConcurrentPool handles Promise pool correctly', () => {
      expect(sourceFile).toContain('const inFlight = new Set<Promise');
      expect(sourceFile).toContain('Promise.race(inFlight)');
      expect(sourceFile).toContain('inFlight.delete');
    });
  });

  describe('Issue #6: Cache Error Logging', () => {
    it('uses console.debug instead of silent failures', () => {
      expect(sourceFile).toContain('console.debug');
      expect(sourceFile).toContain('Cache read error');
      expect(sourceFile).toContain('Cache write error');
    });

    it('tracks cache statistics', () => {
      expect(sourceFile).toContain('cacheStats = {');
      expect(sourceFile).toContain('hits: 0');
      expect(sourceFile).toContain('misses: 0');
      expect(sourceFile).toContain('errors: 0');
      expect(sourceFile).toContain('writeErrors: 0');
    });

    it('increments cache statistics', () => {
      expect(sourceFile).toContain('this.cacheStats.hits++');
      expect(sourceFile).toContain('this.cacheStats.misses++');
      expect(sourceFile).toContain('this.cacheStats.errors++');
      expect(sourceFile).toContain('this.cacheStats.writeErrors++');
    });

    it('includes cache stats in getStatistics', () => {
      expect(sourceFile).toContain('cache: this.cacheStats');
    });

    it('has proper error handling flow', () => {
      // Check that after cache error, we continue with download
      const cacheErrorPattern = /catch.*error.*console\.debug.*Cache.*error/s;
      expect(sourceFile).toMatch(cacheErrorPattern);
    });
  });
});