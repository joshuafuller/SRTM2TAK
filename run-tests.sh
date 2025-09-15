#!/bin/bash

# SRTM2TAK Test Suite Runner
# Validates all components are working

echo "======================================"
echo "   SRTM2TAK Test Suite Runner"
echo "======================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
run_test() {
    local test_name=$1
    local test_command=$2
    
    echo -n "Testing $test_name... "
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

echo "1. Infrastructure Tests"
echo "-----------------------"

run_test "Node.js available" "which node"
run_test "npm available" "which npm"
run_test "curl available" "which curl"
run_test "Git repository" "git status"

echo ""
echo "2. S3 Connectivity Tests"
echo "------------------------"

run_test "S3 endpoint reachable" "curl -I https://s3.amazonaws.com/elevation-tiles-prod/skadi/N36/N36W112.hgt.gz 2>/dev/null | grep '200 OK'"
run_test "CORS headers present" "curl -I https://s3.amazonaws.com/elevation-tiles-prod/skadi/N36/N36W112.hgt.gz 2>/dev/null | grep -i 'access-control'"

echo ""
echo "3. Test Data Validation"
echo "-----------------------"

run_test "N34W081.hgt exists" "[ -f test-data/samples/N34W081.hgt ]"
run_test "N36W112.hgt exists" "[ -f test-data/samples/N36W112.hgt ]"
run_test "N34W081 size correct" "[ $(stat -f%z test-data/samples/N34W081.hgt 2>/dev/null || stat -c%s test-data/samples/N34W081.hgt 2>/dev/null) -eq 25934402 ]"
run_test "N36W112 size correct" "[ $(stat -f%z test-data/samples/N36W112.hgt 2>/dev/null || stat -c%s test-data/samples/N36W112.hgt 2>/dev/null) -eq 25934402 ]"
run_test "Test fixtures created" "[ -f test-data/fixtures/sample-srtm-1mb.hgt ]"

echo ""
echo "4. Prototype Tests"
echo "------------------"

run_test "Node.js prototype exists" "[ -f prototype/download-one-tile.js ]"
run_test "Browser prototype exists" "[ -f prototype/browser-download.html ]"
run_test "Node.js prototype runs" "cd prototype && node download-one-tile.js > /dev/null 2>&1"
run_test "Output directory created" "[ -d prototype/output ]"
run_test "Downloaded file exists" "[ -f prototype/output/N34W081.hgt ]"

echo ""
echo "5. Validation Files"
echo "-------------------"

run_test "S3 test HTML exists" "[ -f validation/s3-test.html ]"
run_test "Memory test HTML exists" "[ -f validation/memory-test.html ]"
run_test "Stream ZIP test exists" "[ -f validation/stream-zip-test.html ]"
run_test "ATAK test checklist exists" "[ -f validation/atak-test.md ]"
run_test "Results template exists" "[ -f validation/RESULTS.md ]"

echo ""
echo "6. Documentation"
echo "----------------"

run_test "Terrain samples doc exists" "[ -f test-data/terrain-samples.md ]"
run_test "Specification exists" "[ -f specs/001-srtm2tak-the-idea/spec.md ]"
run_test "Plan exists" "[ -f specs/001-srtm2tak-the-idea/plan.md ]"
run_test "Tasks defined" "[ -f specs/001-srtm2tak-the-idea/tasks.md ]"
run_test "Research completed" "[ -f specs/001-srtm2tak-the-idea/research.md ]"

echo ""
echo "7. Quick Download Test"
echo "----------------------"

# Test downloading a small amount of data
echo -n "Testing partial download... "
if curl -r 0-1024 https://s3.amazonaws.com/elevation-tiles-prod/skadi/N36/N36W112.hgt.gz > /tmp/srtm-test.tmp 2>/dev/null; then
    if [ -f /tmp/srtm-test.tmp ] && [ $(stat -f%z /tmp/srtm-test.tmp 2>/dev/null || stat -c%s /tmp/srtm-test.tmp 2>/dev/null) -eq 1025 ]; then
        echo -e "${GREEN}✅ PASSED${NC}"
        ((TESTS_PASSED++))
        rm /tmp/srtm-test.tmp
    else
        echo -e "${RED}❌ FAILED${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${RED}❌ FAILED${NC}"
    ((TESTS_FAILED++))
fi

echo ""
echo "======================================"
echo "         TEST RESULTS SUMMARY"
echo "======================================"
echo ""

TOTAL_TESTS=$((TESTS_PASSED + TESTS_FAILED))
PASS_RATE=$((TESTS_PASSED * 100 / TOTAL_TESTS))

echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo "Total Tests:  $TOTAL_TESTS"
echo "Pass Rate:    $PASS_RATE%"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! Ready to proceed.${NC}"
    echo ""
    echo "Next Steps:"
    echo "1. Open prototype/browser-download.html in a browser"
    echo "2. Test downloading Grand Canyon tile (N36W112)"
    echo "3. Copy .hgt file to Android device"
    echo "4. Test in ATAK at 36°N, 112°W"
    exit 0
else
    echo -e "${YELLOW}⚠️  Some tests failed. Review the failures above.${NC}"
    echo ""
    echo "Common fixes:"
    echo "- Run: cd test-data && ./download-sample.sh"
    echo "- Check internet connection for S3 access"
    echo "- Ensure Node.js is installed"
    exit 1
fi