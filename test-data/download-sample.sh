#!/bin/bash

# SRTM2TAK - Download and validate real SRTM tile
# Task T002: Download and validate real SRTM tile

echo "==================================="
echo "SRTM2TAK - Sample Tile Download"
echo "==================================="
echo ""

# Create directories
mkdir -p fixtures
mkdir -p samples

# Test tile: N34W081 (South Carolina area)
TILE_URL="https://s3.amazonaws.com/elevation-tiles-prod/skadi/N34/N34W081.hgt.gz"
TILE_NAME="N34W081"

echo "1. Downloading ${TILE_NAME}.hgt.gz from AWS S3..."
curl -o "${TILE_NAME}.hgt.gz" "${TILE_URL}"

if [ ! -f "${TILE_NAME}.hgt.gz" ]; then
    echo "❌ ERROR: Failed to download tile"
    exit 1
fi

echo "✅ Download complete"
echo ""

# Check compressed size
COMPRESSED_SIZE=$(stat -f%z "${TILE_NAME}.hgt.gz" 2>/dev/null || stat -c%s "${TILE_NAME}.hgt.gz" 2>/dev/null)
echo "2. Compressed size: ${COMPRESSED_SIZE} bytes ($((COMPRESSED_SIZE / 1024 / 1024)) MB)"
echo ""

# Decompress
echo "3. Decompressing..."
gunzip -k "${TILE_NAME}.hgt.gz"

if [ ! -f "${TILE_NAME}.hgt" ]; then
    echo "❌ ERROR: Failed to decompress tile"
    exit 1
fi

echo "✅ Decompression complete"
echo ""

# Verify uncompressed size (should be exactly 25934402 bytes for SRTM1)
UNCOMPRESSED_SIZE=$(stat -f%z "${TILE_NAME}.hgt" 2>/dev/null || stat -c%s "${TILE_NAME}.hgt" 2>/dev/null)
EXPECTED_SIZE=25934402

echo "4. Validating SRTM format..."
echo "   Uncompressed size: ${UNCOMPRESSED_SIZE} bytes"
echo "   Expected size: ${EXPECTED_SIZE} bytes"

if [ "${UNCOMPRESSED_SIZE}" -eq "${EXPECTED_SIZE}" ]; then
    echo "   ✅ Size validation PASSED"
else
    echo "   ❌ Size validation FAILED"
    exit 1
fi
echo ""

# Create test fixtures
echo "5. Creating test fixtures..."

# Save first 1MB as test fixture
head -c 1048576 "${TILE_NAME}.hgt" > "fixtures/sample-srtm-1mb.hgt"
echo "   Created: fixtures/sample-srtm-1mb.hgt (1 MB sample)"

# Save first 100KB as mini fixture
head -c 102400 "${TILE_NAME}.hgt" > "fixtures/sample-srtm-100kb.hgt"
echo "   Created: fixtures/sample-srtm-100kb.hgt (100 KB sample)"

# Create metadata file
cat > "fixtures/sample-metadata.json" << EOF
{
    "tile": "${TILE_NAME}",
    "source": "${TILE_URL}",
    "compressedSize": ${COMPRESSED_SIZE},
    "uncompressedSize": ${UNCOMPRESSED_SIZE},
    "expectedSize": ${EXPECTED_SIZE},
    "format": "SRTM1",
    "resolution": "1 arc-second",
    "dimensions": "3601x3601",
    "dataType": "16-bit signed integer",
    "byteOrder": "big-endian",
    "downloadDate": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
echo "   Created: fixtures/sample-metadata.json"
echo ""

# Move full files to samples directory
mv "${TILE_NAME}.hgt" "samples/"
mv "${TILE_NAME}.hgt.gz" "samples/"
echo "6. Full files moved to samples/ directory"
echo ""

# Summary
echo "==================================="
echo "Summary:"
echo "==================================="
echo "✅ Successfully downloaded and validated SRTM tile"
echo ""
echo "Files created:"
echo "  - samples/${TILE_NAME}.hgt (25 MB)"
echo "  - samples/${TILE_NAME}.hgt.gz (8 MB)"
echo "  - fixtures/sample-srtm-1mb.hgt (1 MB)"
echo "  - fixtures/sample-srtm-100kb.hgt (100 KB)"
echo "  - fixtures/sample-metadata.json"
echo ""
echo "Next steps:"
echo "1. Copy samples/${TILE_NAME}.hgt to Android device"
echo "2. Place in /ATAK/SRTM/ or /Android/data/com.atakmap.app.civ/files/SRTM/"
echo "3. Open ATAK and navigate to 34°N, 81°W"
echo "4. Verify elevation data appears"
echo ""