# SRTM2TAK

A Progressive Web Application for downloading and packaging SRTM elevation data for ATAK (Android Team Awareness Kit).

## 🚀 Quick Start

Visit the deployed app: [https://your-username.github.io/SRTM2TAK](https://your-username.github.io/SRTM2TAK)

Or run locally:
```bash
npm install
npm run dev
```

## 📋 Features

- **📍 Area Selection**: Draw rectangles on a map to select elevation tiles
- **📦 Batch Download**: Download multiple SRTM tiles efficiently
- **🗜️ Streaming ZIP**: Uses @zip.js/zip.js for memory‑efficient packaging
- **📱 Mobile Ready**: Works on phones, tablets, and desktops
- **🔌 Offline Mode**: PWA with offline capabilities (GitHub Pages‑ready)
- **⚡ Memory Efficient**: Streaming downloads and compression prevent memory overflow

## 🎯 Use Case

ATAK users need elevation data for 3D terrain visualization and analysis. This tool simplifies the process of:
1. Finding the right SRTM tiles for your area
2. Downloading them from AWS S3
3. Packaging them for ATAK import
4. Managing storage and memory constraints

## 🛠️ Development

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm run test

# Build for production
npm run build
```

### Project Structure
```
SRTM2TAK/
├── src/
│   ├── lib/         # Core libraries
│   ├── ui/          # UI components (map, overlays)
│   ├── models/      # Data models
│   └── main.ts      # Entry point
├── tests/           # Test files
├── docs/            # Documentation
└── validation/      # Validation tests
```

## 📊 Current Status

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 0: Validation | ✅ Complete | 100% |
| Phase 1: Prototype | ✅ Complete | 100% |
| Phase 2: Project Setup | ✅ Complete | 100% |
| Phase 3: Test Infrastructure | 📝 Next | 0% |

See [tasks.md](./specs/001-srtm2tak-the-idea/tasks.md) for detailed progress.

## 🤝 Contributing

Contributions welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) first.

## 📄 License

[MIT License](./LICENSE)

## 🙏 Acknowledgments

- NASA/USGS for SRTM data
- AWS for hosting elevation tiles
- MapLibre GL and zip.js for great open‑source tooling
- ATAK community for the amazing platform
