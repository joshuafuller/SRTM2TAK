import { describe, it, expect } from 'vitest';

describe('Smoke Test', () => {
  it('should run tests', () => {
    expect(true).toBe(true);
  });

  it('should have test environment configured', () => {
    expect(globalThis).toBeDefined();
    expect(vi).toBeDefined();
  });
});