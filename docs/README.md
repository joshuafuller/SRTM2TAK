# SRTM2TAK Documentation

## Overview
SRTM2TAK is a Progressive Web Application (PWA) that downloads and packages SRTM elevation data for use in ATAK (Android Team Awareness Kit).

## Documentation Structure

### User Documentation
- [Quick Start Guide](./quickstart.md) - Get up and running quickly
- [User Guide](./user-guide.md) - Detailed usage instructions
- [FAQ](./faq.md) - Frequently asked questions
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

### Developer Documentation
- [Architecture](./architecture.md) - System design and components
- [Development Setup](./development.md) - Local development environment
- [API Reference](./api-reference.md) - Core library APIs
- [Testing Guide](./testing.md) - Running and writing tests
- [Deployment](./deployment.md) - Deployment instructions

### Technical Specifications
- [SRTM Data Format](./srtm-format.md) - Understanding SRTM files
- [Memory Management](./memory-management.md) - Optimization strategies
- [Browser Compatibility](./browser-compatibility.md) - Supported browsers
- [Performance](./performance.md) - Performance considerations

## Key Features

1. **Browser-Based**: No installation required, works in any modern browser
2. **Offline Capable**: PWA with service worker for offline functionality
3. **Memory Efficient**: Streaming downloads and compression
4. **ATAK Compatible**: Generates files in ATAK-ready format
5. **Mobile Friendly**: Responsive design for phones and tablets

## Technology Stack

- **Frontend**: TypeScript, Leaflet
- **Build**: Vite, PWA Plugin
- **Testing**: Vitest, Playwright
- **Data**: AWS S3 SRTM tiles
- **Compression**: pako.js, @zip.js/zip.js

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for contribution guidelines.

## License

See [LICENSE](../LICENSE) for license information.