# ATAK Compatibility Test Protocol

## Task T003: Test ATAK compatibility BEFORE building

### Prerequisites
- Android device with ATAK CIV installed
- USB cable for file transfer (or cloud storage app)
- Sample SRTM file from T002 (`test-data/samples/N34W081.hgt`)

### Test Procedure

## 1. Record ATAK Version
- [ ] Open ATAK
- [ ] Go to Settings → About
- [ ] Record version: ________________
- [ ] Record build: ________________
- [ ] Device model: ________________
- [ ] Android version: ________________

## 2. Test Direct HGT File Import

### Method A: Internal SRTM Directory
1. [ ] Connect device via USB
2. [ ] Navigate to: `/storage/emulated/0/atak/SRTM/`
   - If doesn't exist, create it
3. [ ] Copy `N34W081.hgt` to this directory
4. [ ] Open ATAK
5. [ ] Navigate to coordinates: 34.5°N, 81.5°W
6. [ ] Enable elevation display (if not already)
7. [ ] Check 3D view

**Result:**
- [ ] ✅ Elevation data displays correctly
- [ ] ❌ No elevation data visible
- [ ] ⚠️ Partial/corrupted display

**Notes:** _________________________________

### Method B: App-Specific Directory
1. [ ] Navigate to: `/Android/data/com.atakmap.app.civ/files/SRTM/`
   - May need file manager with root/special permissions
2. [ ] Copy `N34W081.hgt` to this directory
3. [ ] Force stop ATAK (Settings → Apps → ATAK → Force Stop)
4. [ ] Restart ATAK
5. [ ] Navigate to coordinates: 34.5°N, 81.5°W
6. [ ] Check elevation display

**Result:**
- [ ] ✅ Elevation data displays correctly
- [ ] ❌ No elevation data visible
- [ ] ⚠️ Partial/corrupted display

**Notes:** _________________________________

## 3. Test ZIP Import

1. [ ] Create ZIP containing `N34W081.hgt`
   ```bash
   cd test-data/samples
   zip srtm-test.zip N34W081.hgt
   ```

2. [ ] Transfer ZIP to device Downloads folder
3. [ ] In ATAK, go to Import Manager
4. [ ] Navigate to Downloads
5. [ ] Select `srtm-test.zip`
6. [ ] Import

**Result:**
- [ ] ✅ Import successful, elevation works
- [ ] ❌ Import failed
- [ ] ⚠️ Import succeeded but no elevation

**Error messages (if any):** _________________________________

## 4. Test Multiple Files

1. [ ] Download additional tiles:
   - N34W082.hgt
   - N35W081.hgt
2. [ ] Place all three files in SRTM directory
3. [ ] Verify ATAK handles multiple tiles

**Result:**
- [ ] ✅ All tiles load correctly
- [ ] ❌ Only some tiles work
- [ ] ❌ Conflicts or crashes

## 5. Performance Testing

With elevation data loaded:

1. [ ] Pan around the map
   - Smooth: ⚪ Yes ⚪ No
   - Lag noted: _____________

2. [ ] Zoom in/out
   - Smooth: ⚪ Yes ⚪ No
   - Elevation updates: ⚪ Yes ⚪ No

3. [ ] Switch to 3D view
   - Loads successfully: ⚪ Yes ⚪ No
   - Terrain visible: ⚪ Yes ⚪ No

4. [ ] Memory usage (Settings → Developer → Memory)
   - Before SRTM: _______ MB
   - After SRTM: _______ MB

## 6. File Format Validation

### Check ATAK's expectations:
1. [ ] File naming: Must be `N##W###.hgt` format?
2. [ ] Case sensitive: `n34w081.hgt` vs `N34W081.hgt`
3. [ ] File permissions required: _____________
4. [ ] Byte order: Big-endian confirmed?

### Test variations:
- [ ] Lowercase filename: Works? ⚪ Yes ⚪ No
- [ ] Different extension (.srtm): Works? ⚪ Yes ⚪ No
- [ ] Compressed (.hgt.gz): Works? ⚪ Yes ⚪ No

## 7. Critical Findings

### ✅ CONFIRMED WORKING:
- Directory path: _________________________________
- File format: _________________________________
- Import method: _________________________________

### ❌ DOES NOT WORK:
- _________________________________
- _________________________________

### ⚠️ IMPORTANT NOTES:
- _________________________________
- _________________________________
- _________________________________

## 8. Screenshots

Take screenshots of:
1. [ ] ATAK elevation display working
2. [ ] ATAK 3D view with terrain
3. [ ] Import manager (if used)
4. [ ] Any error messages
5. [ ] File manager showing SRTM directory

Store in: `validation/screenshots/`

## Final Validation Result

**CAN WE PROCEED?**
- [ ] ✅ YES - ATAK accepts our HGT files
- [ ] ❌ NO - Format issues need investigation
- [ ] ⚠️ MAYBE - Works with caveats: _________________________________

**Tested by:** _________________________________
**Date:** _________________________________
**ATAK Version:** _________________________________

## Next Steps if Failed

If ATAK doesn't recognize the files:
1. Check ATAK logs (if available)
2. Try DTED format instead of SRTM
3. Investigate file byte order (little vs big endian)
4. Test with different ATAK versions
5. Contact ATAK community/forums

---

**Remember**: This validation MUST pass before building the application!