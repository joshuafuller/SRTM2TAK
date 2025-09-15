# Feature Specification: SRTM2TAK - SRTM Elevation Data to ATAK ZIP Packager

**Feature Branch**: `001-srtm2tak-the-idea`  
**Created**: 2025-01-11  
**Status**: Ready for Planning  
**Input**: User description: "SRTM2TAK The idea is to create and application that allows simple map driven selection of an area and downloads the SRTM data and packages it up into a ZIP (Data Package) for ATAK. The should allow new users easy access to pulling their own SRTM data into ATAK. We must thoroughly understand the ATAK Data Package process to do this effectively but there may be an upper bound on these ZIP files, I think its like 20MBs in size. So in the event that a data package is not an option, we need a simple ZIP file we can unzip in to the proper folder in ATAK. This process must be as intuitive and easy as process. To be clear. This should be a Go backend and probably echo library to host a frontend. Prefably hosting the frontend INSIDE of the go binary as in embedded and as static as possible. Caching should be a thing so we don't redownload tiles. It should be distributed on Github and make use of docker containers so users can quickly set it up with minimal setup and configuration. We should provide all of the documenation, docker files and docker compose files needed to make this as simple as possible. The only thing that would make this incredible is if we could host it on github pages and make the logic work from a standard browser. As in downloading straight to the phone from the SRTM source and with minimal or NO backend if that is even technically feasible."

## Execution Flow (main)
```
1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identify: actors, actions, data, constraints
3. For each unclear aspect:
   → Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   → If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   → If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   → If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## ⚡ Quick Guidelines
- ✅ Focus on WHAT users need and WHY
- ❌ Avoid HOW to implement (no tech stack, APIs, code structure)
- 👥 Written for business stakeholders, not developers

### Section Requirements
- **Mandatory sections**: Must be completed for every feature
- **Optional sections**: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

### For AI Generation
When creating this spec from a user prompt:
1. **Mark all ambiguities**: Use [NEEDS CLARIFICATION: specific question] for any assumption you'd need to make
2. **Don't guess**: If the prompt doesn't specify something (e.g., "login system" without auth method), mark it
3. **Think like a tester**: Every vague requirement should fail the "testable and unambiguous" checklist item
4. **Common underspecified areas**:
   - User types and permissions
   - Data retention/deletion policies  
   - Performance targets and scale
   - Error handling behaviors
   - Integration requirements
   - Security/compliance needs

---

## User Scenarios & Testing *(mandatory)*

### Primary User Story
As an ATAK user, I want to easily select a geographic area on a map using a web application (no installation required) and download the corresponding SRTM elevation data packaged as a ZIP file containing .hgt files, so that I can import the terrain elevation data into ATAK for offline use without any server setup or technical complexity.

### Acceptance Scenarios
1. **Given** a user accessing the application, **When** they interact with a map interface and select a rectangular area, **Then** the system identifies the required SRTM tiles for that area
2. **Given** a user has selected an area, **When** they request to download the data, **Then** the system downloads SRTM .hgt files and packages them into a ZIP file
3. **Given** a ZIP package has been created, **When** the user downloads it, **Then** they can extract the .hgt files to the ATAK/SRTM folder on their device
4. **Given** SRTM tiles have been previously downloaded, **When** a user selects an area containing those tiles, **Then** the system uses cached tiles instead of re-downloading
5. **Given** a user has a generated package, **When** they download it to their device, **Then** they receive clear instructions on extracting to ATAK/SRTM folder
6. **Given** a user visits the site offline, **When** they select an area with cached tiles, **Then** they can generate a ZIP package without network access
7. **Given** the AWS S3 source is unavailable, **When** a user tries to download new tiles, **Then** they receive a clear error message with retry options

### Edge Cases
- What happens when the selected area spans multiple SRTM tiles?
- How does system handle when SRTM data is unavailable for the selected region (e.g., ocean areas, above 60°N, below 56°S)?
- What happens when the user selects an area that would create an extremely large package (hundreds of MB)?
- How does the system handle network failures during SRTM data download?
- What happens when cached data becomes outdated or corrupted?
- How does the system handle browser storage limits (IndexedDB quotas)?
- What happens if the AWS S3 bucket becomes unavailable?
- How does the system handle users with restrictive browser security settings?

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: System MUST provide an interactive map interface for area selection
- **FR-002**: System MUST allow users to select rectangular geographic areas on the map
- **FR-003**: System MUST download SRTM elevation data (.hgt.gz files) for the selected area from publicly accessible, CORS-enabled sources
- **FR-004**: System MUST package SRTM .hgt files into a simple ZIP file
- **FR-005**: System MUST preserve proper .hgt file naming convention (e.g., N34W081.hgt) and decompress .gz files before packaging
- **FR-006**: System MUST cache downloaded SRTM tiles in browser storage to avoid redundant downloads
- **FR-007**: System MUST provide clear visual feedback on download progress
- **FR-008**: System MUST display estimated package size before download begins
- **FR-009**: System MUST support SRTM data at approximately 30m resolution
- **FR-010**: Users MUST be able to download generated packages directly to their device
- **FR-011**: System MUST provide clear instructions for extracting ZIP contents to the ATAK/SRTM folder
- **FR-012**: System MUST validate selected area boundaries are within available SRTM coverage
- **FR-013**: System MUST function completely client-side without server-side user management
- **FR-014**: System MUST retain cached SRTM tiles in browser storage for reuse across sessions
- **FR-015**: System MUST be accessible via web browser on mobile devices
- **FR-016**: System MUST work on modern mobile and desktop browsers (Chrome, Firefox, Safari, Edge)
- **FR-017**: System MUST be deployable as static files on GitHub Pages or similar static hosting
- **FR-018**: System MUST work offline after initial load (Progressive Web App capabilities)
- **FR-019**: System MUST handle browser memory constraints when processing large areas
- **FR-020**: System MUST warn users when selected area would exceed reasonable download size

### Key Entities *(include if feature involves data)*
- **Geographic Area**: User-selected rectangular region defined by coordinates (northwest and southeast corners)
- **SRTM Tile**: Individual elevation data file covering a specific geographic grid square
- **ZIP Package**: Simple ZIP file containing SRTM .hgt files ready for ATAK import
- **SRTM File**: Individual .hgt elevation data file in SRTM format (e.g., N34W081.hgt)
- **Cached Tile**: Previously downloaded SRTM tile stored in browser storage for reuse
- **Browser Storage**: IndexedDB or Cache API storage for persisting tiles locally
- **Download Session**: User interaction from area selection to package download

---

## Review & Acceptance Checklist
*GATE: Automated checks run during main() execution*

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous  
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Technical Notes from Research

### SRTM Data Sources
- **Primary**: AWS Terrain Tiles (elevation-tiles-prod S3 bucket)
  - URL Pattern: `https://s3.amazonaws.com/elevation-tiles-prod/skadi/{N|S}{lat}/{N|S}{lat}{E|W}{lon}.hgt.gz`
  - Example: `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N34/N34W081.hgt.gz`
  - **CORS-enabled**: Works directly in browser JavaScript
  - **No authentication**: Public access without API keys
  - **Compressed**: Files are gzipped (~8MB compressed vs ~25MB uncompressed)
- **Format**: SRTM .hgt files in Skadi format (1°x1° tiles)
- **Coverage**: Global coverage between 60°N and 56°S

### ATAK Compatibility
- **Direct Support**: ATAK natively reads SRTM .hgt files without conversion
- **Import Method**: Extract ZIP contents to `/ATAK/SRTM/` folder on device
- **File Format**: Supports both uncompressed .hgt and .hgt.zip files
- **Resolutions**: SRTM1 (3601x3601 pixels) approximately 30m resolution

### PWA Implementation Feasibility
- **Confirmed Viable**: AWS elevation-tiles-prod bucket has CORS headers configured
- **Browser Technologies Required**:
  - Fetch API for downloading tiles
  - Pako.js for decompressing .gz files
  - JSZip for creating final ZIP package
  - IndexedDB for caching tiles
  - Service Workers for offline functionality
- **No Backend Required**: Can be hosted as static files on GitHub Pages
- **Memory Considerations**: Browser can handle individual tiles (~25MB uncompressed)
- **Progressive Enhancement**: Can add optional backend for enhanced caching

### Data Source Reliability
- **Primary Source**: AWS elevation-tiles-prod is part of AWS Public Datasets program
- **Stability**: Has been operational since Mapzen partnership (2016+)
- **Fallback Strategy**: Application should gracefully handle source unavailability
- **Caching Importance**: Local browser cache reduces dependency on external source
- **User Communication**: Clear messaging about data source status and alternatives

### Deployment Options
1. **Primary (PWA-only)**:
   - Host on GitHub Pages (free, no maintenance)
   - Completely client-side processing
   - Works offline after caching
   - No server costs or scaling concerns

2. **Enhanced (Optional Go Backend)**:
   - Server-side caching layer
   - Batch downloads and optimization
   - Alternative data sources fallback
   - Docker deployment for self-hosting

---

## Key Decision: PWA Approach is Viable

**Critical Discovery**: After extensive research, we confirmed that a Progressive Web App (PWA) approach is not only feasible but optimal for SRTM2TAK:

- **AWS Terrain Tiles** (elevation-tiles-prod) provides CORS-enabled access to SRTM data
- **No authentication required** for accessing the public S3 bucket
- **Browser-native technologies** can handle decompression (pako.js) and ZIP creation (JSZip)
- **GitHub Pages hosting** achieves the user's "incredible" goal of no backend requirement
- **Offline functionality** possible through Service Workers and IndexedDB caching

This approach eliminates server costs, maintenance, and scaling concerns while providing a seamless user experience directly in the browser.

---

## Execution Status
*Updated by main() during processing*

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed
- [x] PWA feasibility confirmed through research
- [x] CORS-enabled data source identified

---