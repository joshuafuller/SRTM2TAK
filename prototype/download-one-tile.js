#!/usr/bin/env node

/**
 * SRTM2TAK Minimal Prototype - T009
 * Downloads one SRTM tile, decompresses it, and creates a ZIP file
 * This proves the core concept works before building the full PWA
 */

const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const path = require('path');
const { performance } = require('perf_hooks');

// Track memory usage
function getMemoryUsage() {
    const used = process.memoryUsage();
    return {
        rss: (used.rss / 1024 / 1024).toFixed(2),
        heapTotal: (used.heapTotal / 1024 / 1024).toFixed(2),
        heapUsed: (used.heapUsed / 1024 / 1024).toFixed(2),
        external: (used.external / 1024 / 1024).toFixed(2)
    };
}

// Log with timestamp and memory
function log(message) {
    const mem = getMemoryUsage();
    const time = new Date().toISOString().split('T')[1].split('.')[0];
    console.log(`[${time}] ${message} | Heap: ${mem.heapUsed}MB`);
}

// Download file from URL
function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        log(`Downloading from ${url}`);
        const startTime = performance.now();
        
        const file = fs.createWriteStream(outputPath);
        let downloadedBytes = 0;
        
        https.get(url, (response) => {
            const totalBytes = parseInt(response.headers['content-length'], 10);
            
            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                const percentComplete = ((downloadedBytes / totalBytes) * 100).toFixed(1);
                process.stdout.write(`\rDownloading: ${percentComplete}% (${(downloadedBytes / 1024 / 1024).toFixed(2)}MB / ${(totalBytes / 1024 / 1024).toFixed(2)}MB)`);
            });
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
                const speed = (totalBytes / 1024 / 1024 / elapsed).toFixed(2);
                console.log(''); // New line after progress
                log(`✅ Downloaded ${(totalBytes / 1024 / 1024).toFixed(2)}MB in ${elapsed}s (${speed}MB/s)`);
                resolve(outputPath);
            });
        }).on('error', (err) => {
            fs.unlink(outputPath, () => {}); // Delete partial file
            reject(err);
        });
    });
}

// Decompress gzip file
function decompressFile(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        log(`Decompressing ${path.basename(inputPath)}`);
        const startTime = performance.now();
        
        const input = fs.createReadStream(inputPath);
        const output = fs.createWriteStream(outputPath);
        const gunzip = zlib.createGunzip();
        
        input.pipe(gunzip).pipe(output);
        
        output.on('finish', () => {
            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
            const size = fs.statSync(outputPath).size;
            log(`✅ Decompressed to ${(size / 1024 / 1024).toFixed(2)}MB in ${elapsed}s`);
            
            // Verify SRTM format (should be exactly 25934402 bytes for SRTM1)
            if (size === 25934402) {
                log('✅ File size matches SRTM1 format (3601x3601 pixels)');
            } else {
                log(`⚠️ Unexpected size: ${size} bytes (expected 25934402)`);
            }
            
            resolve(outputPath);
        });
        
        output.on('error', reject);
        gunzip.on('error', reject);
    });
}

// Create simple ZIP file (using Node's built-in zlib for now)
// Note: In the browser, we'll use @zip.js/zip.js for proper ZIP creation
async function createSimpleZip(inputFile, outputZip) {
    log(`Creating ZIP file ${outputZip}`);
    
    // For the prototype, we'll just use gzip compression
    // The browser version will create proper ZIP archives
    return new Promise((resolve, reject) => {
        const input = fs.createReadStream(inputFile);
        const output = fs.createWriteStream(outputZip);
        const gzip = zlib.createGzip({ level: 6 });
        
        input.pipe(gzip).pipe(output);
        
        output.on('finish', () => {
            const size = fs.statSync(outputZip).size;
            log(`✅ Created compressed file: ${(size / 1024 / 1024).toFixed(2)}MB`);
            resolve(outputZip);
        });
        
        output.on('error', reject);
    });
}

// Main workflow
async function main() {
    console.log('===========================================');
    console.log('SRTM2TAK Minimal Prototype - Node.js');
    console.log('===========================================\n');
    
    // Configuration
    const tileId = 'N34W081';
    const s3Url = `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N34/${tileId}.hgt.gz`;
    
    // Create output directory
    const outputDir = path.join(__dirname, 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // File paths
    const compressedFile = path.join(outputDir, `${tileId}.hgt.gz`);
    const decompressedFile = path.join(outputDir, `${tileId}.hgt`);
    const outputZip = path.join(outputDir, `${tileId}-package.gz`);
    
    try {
        log('Starting memory usage:');
        console.log(getMemoryUsage());
        console.log('');
        
        // Step 1: Download compressed tile
        await downloadFile(s3Url, compressedFile);
        
        // Step 2: Decompress
        await decompressFile(compressedFile, decompressedFile);
        
        // Step 3: Create package (simplified for prototype)
        await createSimpleZip(decompressedFile, outputZip);
        
        // Clean up intermediate files (optional)
        log('Cleaning up intermediate files...');
        fs.unlinkSync(compressedFile);
        
        console.log('\n===========================================');
        console.log('✅ PROTOTYPE SUCCESS!');
        console.log('===========================================');
        console.log(`\nOutput files in ${outputDir}:`);
        console.log(`  - ${tileId}.hgt (25MB) - Ready for ATAK`);
        console.log(`  - ${tileId}-package.gz - Compressed package`);
        
        console.log('\nFinal memory usage:');
        console.log(getMemoryUsage());
        
        console.log('\n📋 Next Steps:');
        console.log('1. Copy N34W081.hgt to Android device');
        console.log('2. Place in /ATAK/SRTM/ folder');
        console.log('3. Open ATAK and verify elevation data');
        console.log('4. Port this workflow to browser JavaScript');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

// Run the prototype
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { downloadFile, decompressFile, createSimpleZip };