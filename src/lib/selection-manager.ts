export type AreaMode = 'add' | 'remove';

export interface SelectionArea {
  id: string;
  tiles: Set<string>;
  mode: AreaMode;
}

export interface PersistedSelectionArea {
  id: string;
  tiles: string[];
  mode: AreaMode;
}

export class SelectionManager {
  private singles = new Set<string>();
  private areas: SelectionArea[] = [];
  private storageKey = 'srtm2tak_selection';

  toggleTile(id: string, mode: AreaMode = 'add'): void {
    if (mode === 'add') {
      if (this.singles.has(id)) return;
      this.singles.add(id);
    } else {
      // remove: if present in singles, remove it; else add a tiny removal area
      if (this.singles.has(id)) this.singles.delete(id);
      else this.areas.push({ id: `area-${Date.now()}-${Math.random()}`, tiles: new Set([id]), mode: 'remove' });
    }
  }

  addArea(tiles: string[], mode: AreaMode): string {
    const id = `area-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.areas.push({ id, tiles: new Set(tiles), mode });
    return id;
  }

  removeArea(id: string): void {
    this.areas = this.areas.filter(a => a.id !== id);
  }

  clear(): void {
    this.singles.clear();
    this.areas = [];
  }

  getSelectedTiles(): Set<string> {
    // Start with singles
    const result = new Set(this.singles);
    // Apply areas in order
    for (const area of this.areas) {
      if (area.mode === 'add') {
        for (const t of area.tiles) result.add(t);
      } else {
        for (const t of area.tiles) result.delete(t);
      }
    }
    return result;
  }

  getAreas(): SelectionArea[] {
    return this.areas.slice();
  }

  getSingles(): Set<string> {
    return new Set(this.singles);
  }

  persist(): void {
    try {
      const payload = {
        singles: Array.from(this.singles),
        areas: this.areas.map<PersistedSelectionArea>(a => ({ id: a.id, tiles: Array.from(a.tiles), mode: a.mode }))
      };
      localStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch {
      // Ignore localStorage save errors
    }
  }

  load(): void {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      const data = JSON.parse(raw) as { singles?: string[]; areas?: PersistedSelectionArea[] };
      this.singles = new Set(data.singles || []);
      this.areas = (data.areas || []).map(a => ({ id: a.id, tiles: new Set(a.tiles), mode: a.mode }));
    } catch {
      // Ignore localStorage load errors
    }
  }
}

