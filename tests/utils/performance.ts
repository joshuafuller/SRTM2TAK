/**
 * Performance benchmarking utilities
 */

interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface ExtendedPerformance extends Performance {
  memory?: PerformanceMemory;
}

export interface PerformanceMetrics {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  memoryUsed?: number;
  throughput?: number;
  operations?: number;
}

export interface BenchmarkResult {
  name: string;
  runs: number;
  average: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  throughput?: number;
  memoryDelta?: number;
}

/**
 * Measure the performance of a function
 */
export async function measurePerformance<T>(
  name: string,
  fn: () => Promise<T> | T,
  options: {
    warmup?: boolean;
    measureMemory?: boolean;
  } = {}
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  // Warmup run if requested
  if (options.warmup) {
    await Promise.resolve(fn());
  }
  
  const startMemory = options.measureMemory && (performance as ExtendedPerformance).memory
    ? (performance as ExtendedPerformance).memory?.usedJSHeapSize ?? 0
    : 0;
  
  const startTime = performance.now();
  const result = await Promise.resolve(fn());
  const endTime = performance.now();
  
  const endMemory = options.measureMemory && (performance as ExtendedPerformance).memory
    ? (performance as ExtendedPerformance).memory?.usedJSHeapSize ?? 0
    : 0;
  
  return {
    result,
    metrics: {
      name,
      duration: endTime - startTime,
      startTime,
      endTime,
      memoryUsed: endMemory - startMemory,
    },
  };
}

/**
 * Run a benchmark with multiple iterations
 */
export async function benchmark<T>(
  name: string,
  fn: () => Promise<T> | T,
  options: {
    runs?: number;
    warmupRuns?: number;
    measureMemory?: boolean;
  } = {}
): Promise<BenchmarkResult> {
  const runs = options.runs || 10;
  const warmupRuns = options.warmupRuns || 2;
  
  // Warmup runs
  for (let i = 0; i < warmupRuns; i++) {
    await Promise.resolve(fn());
  }
  
  // Actual benchmark runs
  const results: PerformanceMetrics[] = [];
  let totalMemoryDelta = 0;
  
  for (let i = 0; i < runs; i++) {
    const { metrics } = await measurePerformance(name, fn, {
      measureMemory: options.measureMemory,
    });
    results.push(metrics);
    if (metrics.memoryUsed) {
      totalMemoryDelta += metrics.memoryUsed;
    }
  }
  
  // Calculate statistics
  const durations = results.map(r => r.duration);
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = durations.reduce((a, b) => a + b, 0);
  const average = sum / runs;
  const median = sorted[Math.floor(runs / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  // Calculate standard deviation
  const squaredDiffs = durations.map(d => Math.pow(d - average, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / runs;
  const stdDev = Math.sqrt(avgSquaredDiff);
  
  return {
    name,
    runs,
    average,
    median,
    min,
    max,
    stdDev,
    memoryDelta: options.measureMemory ? totalMemoryDelta / runs : undefined,
  };
}

/**
 * Compare performance of multiple implementations
 */
export async function compareBenchmarks(
  benchmarks: Array<{
    name: string;
    fn: () => Promise<unknown>;
  }>,
  options?: Parameters<typeof benchmark>[2]
): Promise<{
  results: BenchmarkResult[];
  fastest: string;
  rankings: Array<{ name: string; relativeSpeed: number }>;
}> {
  const results = await Promise.all(
    benchmarks.map(b => benchmark(b.name, b.fn, options))
  );
  
  // Find fastest (lowest average time)
  const fastest = results.reduce((prev, curr) =>
    curr.average < prev.average ? curr : prev
  );
  
  // Calculate relative speeds
  const rankings = results
    .map(r => ({
      name: r.name,
      relativeSpeed: fastest.average / r.average,
    }))
    .sort((a, b) => b.relativeSpeed - a.relativeSpeed);
  
  return {
    results,
    fastest: fastest.name,
    rankings,
  };
}

/**
 * Measure download speed
 */
export async function measureDownloadSpeed(
  url: string,
  options: RequestInit = {}
): Promise<{
  bytesPerSecond: number;
  megabitsPerSecond: number;
  duration: number;
  size: number;
}> {
  const startTime = performance.now();
  const response = await fetch(url, options);
  const blob = await response.blob();
  const endTime = performance.now();
  
  const duration = endTime - startTime;
  const size = blob.size;
  const bytesPerSecond = (size / duration) * 1000;
  const megabitsPerSecond = (bytesPerSecond * 8) / (1024 * 1024);
  
  return {
    bytesPerSecond,
    megabitsPerSecond,
    duration,
    size,
  };
}

/**
 * Profile a function and create a performance report
 */
export class PerformanceProfiler {
  private marks: Map<string, number> = new Map();
  private measures: PerformanceMetrics[] = [];
  
  mark(name: string): void {
    this.marks.set(name, performance.now());
  }
  
  measure(name: string, startMark: string, endMark?: string): void {
    const startTime = this.marks.get(startMark);
    const endTime = endMark ? this.marks.get(endMark) : performance.now();
    
    if (!startTime || (endMark && !endTime)) {
      throw new Error(`Mark not found: ${!startTime ? startMark : endMark}`);
    }
    
    this.measures.push({
      name,
      startTime,
      endTime: endTime!,
      duration: endTime! - startTime,
    });
  }
  
  getMeasures(): PerformanceMetrics[] {
    return [...this.measures];
  }
  
  getReport(): string {
    const total = this.measures.reduce((sum, m) => sum + m.duration, 0);
    
    let report = `Performance Report\n`;
    report += `==================\n`;
    report += `Total time: ${total.toFixed(2)}ms\n\n`;
    
    for (const measure of this.measures) {
      const percent = (measure.duration / total) * 100;
      report += `${measure.name}: ${measure.duration.toFixed(2)}ms (${percent.toFixed(1)}%)\n`;
    }
    
    return report;
  }
  
  clear(): void {
    this.marks.clear();
    this.measures = [];
  }
}

/**
 * Throttle function execution for performance testing
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): T {
  let lastCall = 0;
  
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return fn(...args);
    }
    return undefined;
  }) as T;
}

/**
 * Create a performance observer for long tasks
 */
export function observeLongTasks(threshold: number = 50): () => void {
  if (!('PerformanceObserver' in window)) {
    console.warn('PerformanceObserver not supported');
    return () => {};
  }
  
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration > threshold) {
        console.warn(`Long task detected: ${entry.name} (${entry.duration}ms)`);
      }
    }
  });
  
  try {
    observer.observe({ entryTypes: ['longtask'] });
  } catch {
    console.warn('Long task observation not supported');
  }
  
  return () => observer.disconnect();
}