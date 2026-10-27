import { describe, it, expect, vi, afterEach } from 'vitest';
import { TileFetcher } from '@/lib/tile-fetcher';

// fetch that never answers and rejects on abort, like a slow S3 request
function hangingFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) =>
    new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) reject(new DOMException('The operation was aborted', 'AbortError'));
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted', 'AbortError'));
      }, { once: true });
    })
  );
}

// fetch whose headers arrive at once but whose body never ends until aborted
function stalledBodyFetch() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.signal?.aborted) throw new DOMException('The operation was aborted', 'AbortError');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(16));
        init?.signal?.addEventListener('abort', () => {
          controller.error(new DOMException('The operation was aborted', 'AbortError'));
        }, { once: true });
      },
    });
    return new Response(body, { status: 200, headers: { 'content-length': '1024' } });
  });
}

describe('TileFetcher cancellation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects with AbortError on cancel and does not retry', async () => {
    const fetchSpy = hangingFetch();
    const fetcher = new TileFetcher({ maxRetries: 3, retryDelay: 10, timeout: 10_000 });
    const controller = new AbortController();

    const result = fetcher.fetch('N10E000', controller.signal).catch((err) => err);
    controller.abort();

    const err = await result;
    expect(err.name).toBe('AbortError');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not start a fetch when already cancelled', async () => {
    const fetchSpy = hangingFetch();
    const fetcher = new TileFetcher({ maxRetries: 3, retryDelay: 10 });
    const controller = new AbortController();
    controller.abort();

    const err = await fetcher.fetch('N10E000', controller.signal).catch((e) => e);
    expect(err.name).toBe('AbortError');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cancel stops a body download that is in progress', async () => {
    const fetchSpy = stalledBodyFetch();
    const fetcher = new TileFetcher({ maxRetries: 3, retryDelay: 10, timeout: 10_000 });
    const controller = new AbortController();

    const result = fetcher.fetch('N10E000', controller.signal).catch((err) => err);
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();

    const err = await result;
    expect(err.name).toBe('AbortError');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('times out a body that stops sending data', async () => {
    stalledBodyFetch();
    const fetcher = new TileFetcher({ maxRetries: 1, retryDelay: 10, timeout: 50 });

    const err = await fetcher.fetch('N10E000').catch((e) => e);
    expect(err.message).toMatch(/Timeout/);
  });
});
