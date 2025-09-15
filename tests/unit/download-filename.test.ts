/**
 * Test for download filename generation
 * Ensures zip files get meaningful, descriptive names
 */

import { describe, it, expect } from 'vitest';

/**
 * Function to generate download filename from friendly description
 * This is the logic we're testing - extracted from main.ts
 */
function generateDownloadFilename(friendlyDescription: string | null | undefined): string {
  let filename = 'srtm_tiles';

  if (friendlyDescription) {
    // Clean the description for use as filename
    // Keep parentheses for tile count but replace with brackets
    filename = friendlyDescription
      .replace(/\(/g, '[')         // Replace ( with [
      .replace(/\)/g, ']')         // Replace ) with ]
      .replace(/[^\w\s[\]-]/g, '') // Remove special chars except spaces, brackets, and hyphens
      .replace(/\s+/g, '_')        // Replace spaces with underscores
      .replace(/_+/g, '_')         // Remove duplicate underscores
      .toLowerCase();
  }

  // Don't include timestamp in test - we'll test without it
  return filename;
}

/**
 * Improved function that handles edge cases better
 * This is what we WANT the function to do
 */
function generateDownloadFilenameImproved(friendlyDescription: string | null | undefined): string {
  // Default fallback
  let filename = 'srtm_tiles';

  if (!friendlyDescription || friendlyDescription.trim() === '') {
    return filename;
  }

  const description = friendlyDescription.trim();

  // Special handling for "N tiles" pattern (just a number and "tiles")
  const simpleTilePattern = /^(\d+)\s+tiles?$/i;
  const match = description.match(simpleTilePattern);
  if (match) {
    // For simple counts, prepend "srtm_" to make it clear what kind of tiles
    return `srtm_${match[1]}_tiles`;
  }

  // For descriptions with area names and tile counts
  // Clean the description for use as filename
  filename = description
    .replace(/\(/g, '[')           // Replace ( with [
    .replace(/\)/g, ']')           // Replace ) with ]
    .replace(/[^\w\s[\]-]/g, '')  // Remove special chars except spaces, brackets, and hyphens
    .replace(/\s+/g, '_')          // Replace spaces with underscores
    .replace(/_+/g, '_')           // Remove duplicate underscores
    .replace(/^_|_$/g, '')         // Trim underscores from start/end
    .toLowerCase();

  // Ensure we don't return empty or just numbers
  if (!filename || /^\d+$/.test(filename)) {
    return 'srtm_tiles';
  }

  return filename;
}

describe('Download Filename Generation', () => {
  describe('Current implementation issues', () => {
    it('loses context for simple tile counts', () => {
      const result = generateDownloadFilename('45 tiles');
      // This is what currently happens - not ideal
      expect(result).toBe('45_tiles');
      // Missing "srtm_" prefix makes it unclear what kind of tiles these are
    });

    it('handles area descriptions correctly', () => {
      const result = generateDownloadFilename('Colorado Area (5 tiles)');
      // This works OK currently
      expect(result).toBe('colorado_area_[5_tiles]');
    });
  });

  describe('Improved implementation', () => {
    it('should handle area with tile count', () => {
      expect(generateDownloadFilenameImproved('Colorado Area (5 tiles)'))
        .toBe('colorado_area_[5_tiles]');

      expect(generateDownloadFilenameImproved('Denver-Boulder Area (3 tiles)'))
        .toBe('denver-boulder_area_[3_tiles]');

      expect(generateDownloadFilenameImproved('USA Tiles (10 tiles)'))
        .toBe('usa_tiles_[10_tiles]');
    });

    it('should handle simple tile counts with srtm prefix', () => {
      expect(generateDownloadFilenameImproved('45 tiles'))
        .toBe('srtm_45_tiles');

      expect(generateDownloadFilenameImproved('1 tile'))
        .toBe('srtm_1_tiles');

      expect(generateDownloadFilenameImproved('100 tiles'))
        .toBe('srtm_100_tiles');
    });

    it('should handle empty or null descriptions', () => {
      expect(generateDownloadFilenameImproved(null))
        .toBe('srtm_tiles');

      expect(generateDownloadFilenameImproved(undefined))
        .toBe('srtm_tiles');

      expect(generateDownloadFilenameImproved(''))
        .toBe('srtm_tiles');

      expect(generateDownloadFilenameImproved('   '))
        .toBe('srtm_tiles');
    });

    it('should handle special characters properly', () => {
      expect(generateDownloadFilenameImproved('North/South Region (5 tiles)'))
        .toBe('northsouth_region_[5_tiles]');

      expect(generateDownloadFilenameImproved('Area @ 40°N (2 tiles)'))
        .toBe('area_40n_[2_tiles]');

      expect(generateDownloadFilenameImproved('Test & Region (8 tiles)'))
        .toBe('test_region_[8_tiles]');
    });

    it('should handle edge cases gracefully', () => {
      // Just numbers should get srtm prefix
      expect(generateDownloadFilenameImproved('123'))
        .toBe('srtm_tiles');

      // Excessive spaces
      expect(generateDownloadFilenameImproved('Rocky    Mountain    Area   (5   tiles)'))
        .toBe('rocky_mountain_area_[5_tiles]');

      // Leading/trailing spaces
      expect(generateDownloadFilenameImproved('  Western Region (3 tiles)  '))
        .toBe('western_region_[3_tiles]');
    });

    it('should not have leading or trailing underscores', () => {
      expect(generateDownloadFilenameImproved('_Region_ (5 tiles)'))
        .toBe('region_[5_tiles]');

      expect(generateDownloadFilenameImproved('###Area### (3 tiles)'))
        .toBe('area_[3_tiles]');
    });
  });

  describe('Integration with timestamp', () => {
    it('should create proper full filename', () => {
      const baseFilename = generateDownloadFilenameImproved('Colorado Area (5 tiles)');
      const timestamp = 1234567890;
      const fullFilename = `${baseFilename}_${timestamp}.zip`;

      expect(fullFilename).toBe('colorado_area_[5_tiles]_1234567890.zip');
    });

    it('should create proper full filename for simple counts', () => {
      const baseFilename = generateDownloadFilenameImproved('45 tiles');
      const timestamp = 1234567890;
      const fullFilename = `${baseFilename}_${timestamp}.zip`;

      expect(fullFilename).toBe('srtm_45_tiles_1234567890.zip');
    });
  });
});