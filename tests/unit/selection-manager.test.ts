import { describe, it, expect } from 'vitest';
import { SelectionManager } from '@/lib/selection-manager';

describe('SelectionManager', () => {
  it('toggles single tiles in add/remove modes', () => {
    const sm = new SelectionManager();
    sm.toggleTile('N10E010', 'add');
    expect(sm.getSelectedTiles().has('N10E010')).toBe(true);
    sm.toggleTile('N10E010', 'remove');
    expect(sm.getSelectedTiles().has('N10E010')).toBe(false);
  });

  it('adds and removes areas', () => {
    const sm = new SelectionManager();
    const areaTiles = ['A','B','C'];
    sm.addArea(areaTiles, 'add');
    let set = sm.getSelectedTiles();
    expect(set.has('A') && set.has('B') && set.has('C')).toBe(true);
    sm.addArea(['B'], 'remove');
    set = sm.getSelectedTiles();
    expect(set.has('B')).toBe(false);
    expect(set.has('A') && set.has('C')).toBe(true);
  });

  it('persists and loads selection state', () => {
    const sm1 = new SelectionManager();
    sm1.toggleTile('X', 'add');
    sm1.addArea(['Y','Z'], 'add');
    sm1.persist();
    const sm2 = new SelectionManager();
    sm2.load();
    const set = sm2.getSelectedTiles();
    expect(set.has('X') && set.has('Y') && set.has('Z')).toBe(true);
  });
});

