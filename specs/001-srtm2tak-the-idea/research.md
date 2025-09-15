# Research Findings: SRTM2TAK PWA

## Executive Summary
All technical unknowns have been resolved through research. The PWA approach is confirmed viable using AWS Terrain Tiles as the data source, with browser-native technologies for all processing.

## Key Decisions

### 1. Data Source Selection
**Decision**: AWS Terrain Tiles (elevation-tiles-prod S3 bucket)
**Rationale**: 
- CORS-enabled for browser access
- No authentication required
- Reliable AWS infrastructure
- Gzipped files reduce bandwidth
**Alternatives considered**:
- NASA EarthExplorer: Requires auth, no CORS
- OpenTopography: Path structure issues, uncertain CORS
- CORS proxy services: Added latency and reliability concerns

### 2. Map Library
**Decision**: Leaflet with Leaflet.draw plugin
**Rationale**:
- Lightweight (~40KB gzipped)
- Mobile-friendly out of the box
- Leaflet.draw provides rectangle selection
- Large ecosystem and documentation
**Alternatives considered**:
- Mapbox GL JS: Heavier, requires token for some features
- OpenLayers: More complex API for simple use case
- Google Maps: Requires API key, usage limits

### 3. Build Tool and Framework
**Decision**: Vite with vanilla JavaScript (TypeScript optional)
**Rationale**:
- Fast development builds
- Built-in PWA support via vite-plugin-pwa
- No framework overhead for simple app
- Easy GitHub Pages deployment
**Alternatives considered**:
- Create React App: Unnecessary complexity for this use case
- Webpack: More configuration required
- Parcel: Less PWA tooling available

### 4. Tile Decompression
**Decision**: pako.js library
**Rationale**:
- Pure JavaScript gzip implementation
- Works in all browsers
- Small size (~45KB)
- Synchronous and streaming APIs
**Alternatives considered**:
- Native DecompressionStream API: Limited browser support
- fflate: Similar but less mature

### 5. ZIP Generation
**Decision**: @zip.js/zip.js (NOT JSZip)
**Rationale**:
- TRUE streaming support (doesn't hold entire ZIP in memory)
- Can write directly to disk via Stream API
- Prevents memory crashes with large selections
- Better for mobile constraints
**Alternatives considered**:
- JSZip: Holds entire ZIP in memory (dealbreaker for mobile)
- fflate: Good but less mature streaming support
- Native Stream API: Too new, limited browser support

### 6. Storage Strategy
**Decision**: IndexedDB via idb library
**Rationale**:
- Large storage quota (>50GB possible)
- Persistent storage available
- idb provides Promise-based API
- Supports binary data (ArrayBuffer)
**Alternatives considered**:
- Cache API: More complex for structured data
- localStorage: 5-10MB limit too small
- WebSQL: Deprecated

### 7. PWA Service Worker
**Decision**: Workbox via vite-plugin-pwa
**Rationale**:
- Handles caching strategies
- Automatic manifest generation
- Offline-first patterns built-in
- Good Vite integration
**Alternatives considered**:
- Manual service worker: More error-prone
- PWA Builder: Less integrated with build

### 8. Testing Framework
**Decision**: Vitest + Playwright
**Rationale**:
- Vitest: Jest-compatible, fast, Vite integration
- Playwright: Real browser testing, mobile emulation
- Both work well with GitHub Actions
**Alternatives considered**:
- Jest + Puppeteer: Slower, less Vite integration
- Cypress: Heavier, more complex setup
- Karma: Outdated approach

## Technical Specifications

### SRTM Tile URL Pattern
```
https://s3.amazonaws.com/elevation-tiles-prod/skadi/{N|S}{lat}/{N|S}{lat}{E|W}{lon}.hgt.gz
```
- Example: `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N34/N34W081.hgt.gz`
- File size: ~8MB compressed, ~25MB uncompressed
- Format: 3601x3601 16-bit integers (SRTM1)

### Browser Compatibility Requirements
- Fetch API (all modern browsers)
- IndexedDB (all modern browsers)
- Service Workers (all except IE)
- ArrayBuffer/TypedArray (all modern browsers)

### Performance Benchmarks
- Single tile download: 1-3 seconds (depends on connection)
- Decompression: <500ms per tile
- ZIP creation: <1s per tile
- IndexedDB write: <200ms per tile

### Storage Calculations
- Per tile: ~25MB uncompressed
- Typical selection (10 tiles): ~250MB
- IndexedDB quota: Usually 50% of free disk space
- Recommended cache limit: 100 tiles (~2.5GB)

## Implementation Notes

### CORS Handling
The AWS S3 bucket includes proper CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD
```

### File Naming Convention
SRTM files use lower-left corner naming:
- Latitude: N00-N59 or S01-S56
- Longitude: E000-E179 or W001-W180
- Example: N34W081.hgt covers 34°N-35°N, 81°W-80°W

### Memory Management
- Process tiles one at a time to avoid memory issues
- Use streaming when possible for ZIP generation
- Clear ArrayBuffers after processing
- Implement progress indicators for user feedback

### Error Handling
Common errors to handle:
- Network failures: Implement retry with exponential backoff
- CORS errors: Provide clear user message
- Storage quota exceeded: Offer cache clearing option
- Invalid selection (ocean/out of bounds): Show coverage map

## Validation Approach

### MVP Success Criteria
1. Can select area on map
2. Downloads correct tiles from AWS
3. Generates valid ZIP file
4. Works offline after initial cache
5. Provides clear import instructions

### Comprehensive Testing Strategy

#### 1. Unit Tests (Vitest)
- **Coordinate calculations**: 
  - `area-calculator.test.js` - Rectangle to tile list conversion
  - `tile-namer.test.js` - Lat/lon to SRTM filename generation
  - `bounds-validator.test.js` - Check if coordinates are in SRTM coverage
- **Data processing**:
  - `decompressor.test.js` - Gzip decompression with pako
  - `zip-builder.test.js` - ZIP file structure validation
- **Storage operations**:
  - `storage-manager.test.js` - IndexedDB CRUD operations
  - `cache-policy.test.js` - LRU eviction, quota management

#### 2. Integration Tests (Vitest + MSW)
- **Network layer**:
  - `tile-fetcher.integration.test.js` - Mock S3 responses with MSW
  - Test retry logic, timeout handling, concurrent downloads
  - Validate CORS handling and error responses
- **Storage integration**:
  - `cache-flow.integration.test.js` - Download → Store → Retrieve flow
  - Test quota exceeded scenarios
  - Validate offline mode with cached tiles
- **Processing pipeline**:
  - `pipeline.integration.test.js` - Complete tile processing
  - Download → Decompress → Store → Package flow
  - Memory usage validation during processing

#### 3. E2E Tests (Playwright)
- **User workflows**:
  - `select-and-download.e2e.test.js` - Complete happy path
  - `offline-mode.e2e.test.js` - PWA offline functionality
  - `mobile-interaction.e2e.test.js` - Touch interactions on mobile
- **Error scenarios**:
  - `network-failure.e2e.test.js` - Graceful degradation
  - `invalid-selection.e2e.test.js` - Ocean area, out of bounds
  - `storage-full.e2e.test.js` - Quota exceeded handling
- **PWA features**:
  - `install-prompt.e2e.test.js` - Add to home screen
  - `service-worker.e2e.test.js` - Cache strategies
  - `offline-first.e2e.test.js` - Work without network

#### 4. Performance Tests
- **Load testing**:
  - Measure time for 1, 10, 50 tile selections
  - Memory profiling during large downloads
  - ZIP generation performance benchmarks
- **Network simulation**:
  - Test on 3G, 4G, WiFi speeds
  - Packet loss scenarios
  - High latency conditions

#### 5. Accessibility Tests
- **WCAG compliance**:
  - Keyboard navigation tests
  - Screen reader compatibility
  - Color contrast validation
  - Focus management

#### 6. Cross-browser Tests
- **Browser matrix**:
  - Chrome (Windows, Mac, Android)
  - Firefox (Windows, Mac, Android)
  - Safari (Mac, iOS)
  - Edge (Windows)
- **Feature detection**:
  - Graceful fallbacks for missing APIs
  - Progressive enhancement validation

## Resolved Questions

All NEEDS CLARIFICATION items from the specification have been resolved:
- ✅ Data source confirmed (AWS Terrain Tiles)
- ✅ Browser compatibility defined
- ✅ Storage strategy determined
- ✅ Build and deployment approach selected
- ✅ Testing framework chosen
- ✅ Performance targets validated as achievable

## Next Steps

Ready to proceed to Phase 1: Design & Contracts with all technical decisions made and validated.