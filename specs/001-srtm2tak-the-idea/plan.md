# Implementation Plan: SRTM2TAK PWA

**Branch**: `001-srtm2tak-the-idea` | **Date**: 2025-01-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/home/joshuafuller/development/joshuafuller_github/SRTM2TAK/specs/001-srtm2tak-the-idea/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (web=frontend+backend, mobile=app+api)
   → Set Structure Decision based on project type
3. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
4. Execute Phase 0 → research.md
   → If NEEDS CLARIFICATION remain: ERROR "Resolve unknowns"
5. Execute Phase 1 → contracts, data-model.md, quickstart.md, agent-specific template file (e.g., `CLAUDE.md` for Claude Code, `.github/copilot-instructions.md` for GitHub Copilot, or `GEMINI.md` for Gemini CLI).
6. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
7. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
8. STOP - Ready for /tasks command
```

**IMPORTANT**: The /plan command STOPS at step 7. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary
A Progressive Web App (PWA) that enables ATAK users to select geographic areas on an interactive map and download SRTM elevation data packaged as ZIP files for import into ATAK. The application runs entirely in the browser using CORS-enabled AWS Terrain Tiles, requires no backend server, and can be hosted on GitHub Pages for free, achieving the user's goal of maximum simplicity and accessibility.

## Technical Context
**Language/Version**: JavaScript ES6+ / TypeScript 5.x  
**Primary Dependencies**: Leaflet (map), pako.js (gzip), @zip.js/zip.js (streaming ZIP), Workbox (PWA)  
**Storage**: IndexedDB for tile caching, localStorage for settings  
**Testing**: Vitest for unit tests, Playwright for E2E  
**Target Platform**: Modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
**Project Type**: single (PWA with no backend)  
**Performance Goals**: <2s tile download, <5s ZIP generation for 10 tiles  
**Constraints**: Browser memory limits (~2GB), IndexedDB quota (~50% available disk), offline-capable  
**Scale/Scope**: Single-user client-side app, ~5K LOC, 3 main views (map, selection, download)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Simplicity**:
- Projects: 1 (PWA only - no backend, single codebase) ✅
- Using framework directly? Yes - Leaflet, pako, JSZip used directly ✅
- Single data model? Yes - Simple tile metadata and selection state ✅
- Avoiding patterns? Yes - Direct function calls, no unnecessary abstractions ✅

**Architecture**:
- EVERY feature as library? Core features modularized:
  - `lib/tile-fetcher` - Download with retry logic and resume capability
  - `lib/stream-zip` - Stream-based ZIP creation (using @zip.js/zip.js, NOT JSZip)
  - `lib/area-calculator` - Convert map selection to tile list
  - `lib/storage-manager` - IndexedDB operations with quota management
  - `lib/memory-monitor` - Track memory pressure and throttle operations
  - `lib/device-detector` - Mobile constraints and capability detection
- CLI per library: N/A for browser PWA
- Library docs: Each module will have JSDoc comments

**Testing (NON-NEGOTIABLE)**:
- RED-GREEN-Refactor cycle enforced? Yes - tests written first ✅
- Git commits show tests before implementation? Yes ✅
- Order: Integration→E2E→Unit (no contracts for client-only) ✅
- Real dependencies used? Browser APIs, actual S3 endpoints ✅
- Integration tests for: tile fetching, ZIP generation, storage ✅
- FORBIDDEN: Implementation before test - will be enforced

**Observability**:
- Structured logging included? Console with levels (error, warn, info)
- Frontend logs → backend? N/A (no backend)
- Error context sufficient? User-friendly messages with retry options

**Versioning**:
- Version number assigned? 0.1.0 (MVP)
- BUILD increments on every change? Via git tags
- Breaking changes handled? N/A for initial release

## Project Structure

### Documentation (this feature)
```
specs/[###-feature]/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure]
```

**Structure Decision**: Option 1 (Single project) - PWA is a single client-side application

## Phase 0: Outline & Research
1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:
   ```
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Generate contract tests** from contracts:
   - One test file per endpoint
   - Assert request/response schemas
   - Tests must fail (no implementation yet)

4. **Extract test scenarios** from user stories:
   - Each story → integration test scenario
   - Quickstart test = story validation steps

5. **Update agent file incrementally** (O(1) operation):
   - Run `/scripts/update-agent-context.sh [claude|gemini|copilot]` for your AI assistant
   - If exists: Add only NEW tech from current plan
   - Preserve manual additions between markers
   - Update recent changes (keep last 3)
   - Keep under 150 lines for token efficiency
   - Output to repository root

**Output**: data-model.md, /contracts/*, failing tests, quickstart.md, agent-specific file

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy for SRTM2TAK PWA**:

1. **Testing Foundation** (Tasks 1-15):
   - Unit test files for each library module [P]
   - Integration tests for S3 fetching with MSW
   - E2E test setup with Playwright
   - Each test must fail initially (RED phase)

2. **Core Libraries** (Tasks 16-25):
   - `lib/area-calculator` - Coordinate to tile conversion [P]
   - `lib/tile-fetcher` - S3 download with retry logic [P]
   - `lib/storage-manager` - IndexedDB operations [P]
   - `lib/zip-builder` - Create ZIP from tiles [P]
   - `lib/decompressor` - Gzip decompression with pako [P]

3. **PWA Foundation** (Tasks 26-30):
   - Service worker with Workbox
   - Manifest.json for installability
   - Offline page and fallbacks
   - Cache strategies for static assets

4. **UI Components** (Tasks 31-40):
   - Map initialization with Leaflet
   - Rectangle selection tool
   - Tile grid overlay
   - Progress indicators
   - Settings panel
   - Download manager UI

5. **Integration** (Tasks 41-45):
   - Wire up UI to libraries
   - Error handling and user feedback
   - Performance optimizations
   - Accessibility improvements

**Ordering Strategy**:
- Tests MUST come before implementation (TDD)
- Libraries can be developed in parallel [P]
- UI depends on libraries
- Integration requires both libraries and UI
- Each task ~2-4 hours of work

**Estimated Output**: 45-50 numbered tasks focusing on MVP delivery

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)  
**Phase 4**: Implementation (execute tasks.md following constitutional principles)  
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Critical Design Decisions for Browser Constraints

### Memory Management Strategy
- **Sequential Processing**: Process one tile at a time, never hold all in memory
- **Streaming ZIP**: Use @zip.js/zip.js for streaming, not JSZip's memory-heavy approach
- **Immediate Cleanup**: Clear ArrayBuffers after each tile is added to ZIP
- **Mobile Limits**: Max 10 tiles on mobile, 100 on desktop
- **Memory Monitoring**: Check performance.memory API if available

### Mobile-Specific Constraints
```javascript
const constraints = {
  ios: {
    maxTiles: 10,
    serviceWorkerCache: '50MB',
    backgroundThrottle: true,
    requiresUserGesture: true  // For downloads
  },
  android: {
    maxTiles: 20,
    serviceWorkerCache: '100MB',
    backgroundThrottle: true,
    requiresUserGesture: false
  }
};
```

### Download Resume Architecture
- Store manifest in localStorage with completed/pending tiles
- On failure, allow resume from last successful tile
- Provide "partial package" option if some tiles fail
- Session timeout after 24 hours

## Complexity Tracking
*No violations - design remains simple despite critical additions*


## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved
- [x] Complexity deviations documented (none needed)

---
*Based on Constitution v2.1.1 - See `/memory/constitution.md`*