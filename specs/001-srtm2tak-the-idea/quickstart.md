# SRTM2TAK Quick Start Guide

## What is SRTM2TAK?

SRTM2TAK is a web application that helps ATAK users download elevation data for offline use. Simply select an area on a map, and the app downloads the corresponding SRTM (terrain elevation) tiles and packages them into a ZIP file that ATAK can use.

## Requirements

- Modern web browser (Chrome, Firefox, Safari, or Edge)
- Internet connection (for initial tile downloads)
- ATAK installed on your device
- ~25MB storage per map tile

## Quick Start (5 minutes)

### 1. Open the Application

Visit: https://[your-github-username].github.io/SRTM2TAK

No installation required! The app runs entirely in your browser.

### 2. Select Your Area of Interest

1. The map opens centered on the United States
2. Zoom and pan to your area of interest
3. Click the **rectangle tool** in the top-left corner
4. Draw a rectangle around the area you need elevation data for
5. The app shows which tiles will be downloaded (highlighted in yellow)

**Tip**: Start with a small area (2-3 tiles) for your first download

### 3. Review and Download

1. Check the **estimated size** shown in the selection panel
2. Verify the **tile count** (each tile covers 1° x 1°)
3. Click **Download Tiles** to start
4. Watch the progress bar as tiles download
5. The app automatically creates a ZIP file when complete

### 4. Import to ATAK

#### Method 1: Direct Import (Android)
1. When download completes, tap **Save ZIP**
2. Navigate to your device's Downloads folder
3. Long-press the ZIP file
4. Select **Extract to...**
5. Navigate to: `Android/data/com.atakmap.app.civ/files/SRTM/`
6. Tap **Extract Here**
7. Open ATAK - elevation data loads automatically

#### Method 2: Manual Copy
1. Save the ZIP file to your device
2. Use a file manager app
3. Extract contents to: `/ATAK/SRTM/`
4. Restart ATAK if needed

## Offline Usage

After your first visit, SRTM2TAK works offline!

- Previously downloaded tiles are cached
- You can create new packages from cached tiles without internet
- The app installs as a Progressive Web App for easy access

### Install as App (Optional)

**Android Chrome**:
1. Tap the menu (three dots)
2. Select "Add to Home screen"
3. Name it "SRTM2TAK"
4. Tap "Add"

**iOS Safari**:
1. Tap the share button
2. Select "Add to Home Screen"
3. Name it "SRTM2TAK"
4. Tap "Add"

## Understanding SRTM Tiles

- Each tile covers 1° latitude x 1° longitude
- File naming: `N34W081.hgt` = 34°N to 35°N, 81°W to 80°W
- Coverage: 60°N to 56°S (most inhabited areas)
- Resolution: ~30 meters (SRTM1 data)
- No data over oceans

## Tips for Best Results

### Selecting Areas
- Zoom in to see the tile grid overlay
- Yellow tiles = will be downloaded
- Gray tiles = already cached
- Red tiles = no data available (ocean)

### Managing Storage
- Each tile uses ~25MB of storage
- The app caches up to 100 tiles (2.5GB)
- Clear cache in Settings if needed
- Cached tiles speed up future downloads

### Download Strategy
- Download regions you'll need before going offline
- For large areas, download in sections
- The 100-tile limit prevents accidental huge downloads
- Use WiFi for initial large downloads

## Troubleshooting

### "No tiles available for this area"
- You've selected ocean or above 60°N/below 56°S
- Adjust your selection to land areas within coverage

### "Download failed"
- Check your internet connection
- The app automatically retries 3 times
- Try downloading fewer tiles at once
- Clear cache and try again

### "Cannot create ZIP file"
- Check available browser storage
- Clear some cached tiles if needed
- Try a smaller selection

### "ATAK doesn't show elevation"
- Verify files are in `/ATAK/SRTM/` folder
- Check file names match pattern: `N##W###.hgt`
- Restart ATAK after adding new files
- Enable elevation display in ATAK settings

## Validation Checklist

Use this checklist to verify the app is working correctly:

- [ ] Map loads and displays properly
- [ ] Can draw rectangle selection on map
- [ ] Tile grid overlay appears when zoomed in
- [ ] Selection info panel shows tile count and size
- [ ] Download progress bar updates during download
- [ ] ZIP file downloads automatically when complete
- [ ] Can access app offline after first visit
- [ ] Cached tiles show as gray on map
- [ ] Settings panel opens and saves preferences
- [ ] PWA install prompt appears (if not installed)

## CRITICAL: ATAK Integration Testing

**Before Release - MUST Test**:
- [ ] Generated ZIP imports successfully into ATAK CIV
- [ ] Elevation data displays correctly in ATAK 3D view
- [ ] .hgt files are recognized without renaming
- [ ] Works with both manual extraction and import methods
- [ ] Test with at least 3 different geographic areas
- [ ] Verify on Android phone AND tablet
- [ ] Document exact ATAK version tested

**Known Working Configuration**:
- ATAK CIV Version: [TO BE TESTED]
- Android Version: [TO BE TESTED]
- Import Method: [TO BE TESTED]
- Folder Structure: `/ATAK/SRTM/` or `/Android/data/com.atakmap.app.civ/files/SRTM/`

## Advanced Features

### Keyboard Shortcuts
- `Space`: Toggle selection mode
- `Escape`: Cancel current selection
- `Enter`: Start download
- `C`: Clear selection
- `S`: Open settings

### Cache Management
- View cache status in Settings
- Set maximum cache size
- Clear individual tiles or all cache
- Export cache statistics

### Developer Mode
- Press `F12` to open browser console
- View detailed download logs
- Monitor memory usage
- Check IndexedDB contents

## Getting Help

### Common Issues
Check the [FAQ](https://github.com/[username]/SRTM2TAK/wiki/FAQ) for solutions to common problems.

### Bug Reports
Report issues at: https://github.com/[username]/SRTM2TAK/issues

### Source Code
View the code at: https://github.com/[username]/SRTM2TAK

## Privacy & Security

- **No data collection**: The app runs entirely in your browser
- **No accounts required**: No sign-up or login needed
- **Local storage only**: Your selections and cache stay on your device
- **Direct downloads**: Tiles come directly from AWS public datasets
- **Open source**: Inspect the code to verify security

## Credits

- SRTM elevation data: NASA/USGS
- Terrain tiles hosting: AWS Public Datasets
- Map tiles: OpenStreetMap contributors
- Built with: Leaflet, pako, JSZip

---

*Version 0.1.0 - MVP Release*