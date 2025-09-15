# Recommended SRTM Tiles for Terrain Demonstration

## Top Recommendations with Dramatic Terrain

### 1. **Grand Canyon, Arizona** 🏜️ ⭐⭐⭐⭐⭐
- **Tile:** N36W112
- **URL:** `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N36/N36W112.hgt.gz`
- **Features:** Extreme elevation changes, iconic canyon walls, Colorado River
- **Elevation Range:** ~700m to 2800m (2100m variation!)
- **Why:** Most recognizable terrain feature in USA

### 2. **Mount Rainier, Washington** 🏔️ ⭐⭐⭐⭐⭐
- **Tile:** N46W121
- **URL:** `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N46/N46W121.hgt.gz`
- **Features:** Massive volcanic peak, glaciers, dramatic slopes
- **Elevation Range:** ~200m to 4392m (4200m variation!)
- **Why:** Highest peak in Cascades, extremely prominent

### 3. **Yosemite Valley, California** 🏔️ ⭐⭐⭐⭐⭐
- **Tile:** N37W119
- **URL:** `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N37/N37W119.hgt.gz`
- **Features:** Half Dome, El Capitan, dramatic granite cliffs
- **Elevation Range:** ~1200m to 3997m
- **Why:** Iconic valley walls, waterfalls, recognizable landmarks

### 4. **Mount St. Helens, Washington** 🌋 ⭐⭐⭐⭐
- **Tile:** N46W122
- **URL:** `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N46/N46W122.hgt.gz`
- **Features:** Volcanic crater, blast zone, Spirit Lake
- **Elevation Range:** ~300m to 2549m
- **Why:** Active volcano with dramatic crater from 1980 eruption

### 5. **Rocky Mountain National Park, Colorado** ⛰️ ⭐⭐⭐⭐
- **Tile:** N40W105
- **URL:** `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N40/N40W105.hgt.gz`
- **Features:** Longs Peak, Continental Divide, alpine terrain
- **Elevation Range:** ~2400m to 4345m
- **Why:** Classic Rocky Mountain terrain

### 6. **Death Valley, California** 🏜️ ⭐⭐⭐⭐
- **Tile:** N36W116
- **URL:** `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N36/N36W116.hgt.gz`
- **Features:** Badwater Basin (lowest point in North America), Telescope Peak
- **Elevation Range:** -86m to 3368m (3454m variation!)
- **Why:** Extreme elevation range, below sea level

### 7. **San Francisco Bay Area** 🌉 ⭐⭐⭐⭐
- **Tile:** N37W122
- **URL:** `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N37/N37W122.hgt.gz`
- **Features:** Golden Gate, Bay, Mount Tamalpais, urban terrain
- **Elevation Range:** 0m to 784m
- **Why:** Mix of ocean, bay, hills, and urban - very recognizable

### 8. **Mount Shasta, California** 🏔️ ⭐⭐⭐⭐
- **Tile:** N41W122
- **URL:** `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N41/N41W122.hgt.gz`
- **Features:** Isolated volcanic peak, massive prominence
- **Elevation Range:** ~900m to 4317m
- **Why:** Stands alone, extremely prominent

## Quick Download Script

```bash
#!/bin/bash
# Download a dramatic terrain tile for testing

# Pick one:
TILE="N36W112"  # Grand Canyon
# TILE="N46W121"  # Mount Rainier
# TILE="N37W119"  # Yosemite
# TILE="N37W122"  # San Francisco

# Extract latitude band
LAT_BAND="${TILE:0:3}"

# Download
echo "Downloading $TILE..."
curl -O "https://s3.amazonaws.com/elevation-tiles-prod/skadi/$LAT_BAND/$TILE.hgt.gz"

# Decompress
echo "Decompressing..."
gunzip "$TILE.hgt.gz"

echo "Done! File: $TILE.hgt"
echo "Copy to Android: /ATAK/SRTM/$TILE.hgt"
```

## Best for Different Demos

### For Maximum Drama
**Mount Rainier (N46W121)** - 4200m elevation range in single tile!

### For Recognition
**Grand Canyon (N36W112)** - Everyone knows this landmark

### For Urban + Nature Mix
**San Francisco Bay (N37W122)** - City, ocean, mountains

### For Volcanic Features
**Mount St. Helens (N46W122)** - Crater clearly visible

### For Desert Extremes
**Death Valley (N36W116)** - Below sea level to high peaks

## Testing in ATAK

1. Download chosen tile
2. Copy .hgt file to `/ATAK/SRTM/` on device
3. Open ATAK and navigate to tile coordinates
4. Enable 3D view to see terrain
5. Look for landmarks:
   - Grand Canyon: Follow the Colorado River
   - Mount Rainier: Look for the peak at 46.85°N, 121.76°W
   - Yosemite: Find Half Dome at 37.75°N, 119.53°W
   - San Francisco: Golden Gate at 37.82°N, 122.48°W

## Coordinates for ATAK Navigation

```
Grand Canyon South Rim: 36.05°N, 112.14°W
Mount Rainier Summit: 46.85°N, 121.76°W
Half Dome, Yosemite: 37.75°N, 119.53°W
Mount St. Helens: 46.20°N, 122.18°W
Golden Gate Bridge: 37.82°N, 122.48°W
Badwater Basin: 36.23°N, 116.77°W
```

---

**Recommendation:** Start with **Grand Canyon (N36W112)** for the most recognizable and dramatic terrain demonstration!