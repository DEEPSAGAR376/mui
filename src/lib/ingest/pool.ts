/**
 * Worker pool for tag parsing.
 *
 * Bounded, and the bound matters twice over. Parsing is CPU-bound, so more
 * workers than cores is pure overhead — but each in-flight file is also read
 * fully into memory to be hashed, so at a 128MB ceiling an unbounded pool over a
 * folder of lossless rips would try to hold gigabytes at once. Four is the cap.
 */

import type { ParseRequest, ParseResponse } from './types';

/** Cores minus a little, capped. `hardwareConcurrency` is absent on old Safari. */
function defaultPoolSize(): number {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 0;
  return Math.max(1, Math.min(4, (cores || 4) - 1));
}

function spawn(): Worker {
  // The `new URL(..., import.meta.url)` form is what lets Turbopack see the
  // worker as a bundle entry point. A plain string path would ship unbundled and
  // fail on the bare `music-metadata` import.
  return new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * Parse every request, calling `onResult` as each finishes.
 *
 * Results stream rather than arriving as one array at the end, so the UI can
 * fill the queue progressively — on a large folder the first rows appear in well
 * under a second.
 *
 * Never rejects: a worker that dies takes its one file down as a `ParseFailure`
 * and the pool refills the slot. One corrupt file cannot abort a 200-file drop.
 */
export async function parseFiles(
  requests: ParseRequest[],
  onResult: (result: ParseResponse) => void,
  options: { poolSize?: number; signal?: AbortSignal } = {},
): Promise<void> {
  if (requests.length === 0) return;

  const size = Math.min(options.poolSize ?? defaultPoolSize(), requests.length);
  const workers: Worker[] = [];
  /** Which file each worker currently holds, so a crash can be attributed to it. */
  const inFlight = new Map<Worker, string>();
  let next = 0;
  let settled = 0;

  await new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      for (const worker of workers) worker.terminate();
      resolve();
    };

    if (options.signal?.aborted) {
      finish();
      return;
    }
    options.signal?.addEventListener('abort', finish, { once: true });

    const dispatch = (worker: Worker) => {
      if (finished) return;
      if (next >= requests.length) return;
      const request = requests[next++];
      inFlight.set(worker, request.id);
      // `file` is a File — structured-cloneable, and the clone is by reference
      // to the underlying blob data, so this does not copy the bytes.
      worker.postMessage(request);
    };

    const complete = (result: ParseResponse, worker: Worker) => {
      inFlight.delete(worker);
      onResult(result);
      if (++settled === requests.length) {
        finish();
        return;
      }
      dispatch(worker);
    };

    for (let i = 0; i < size; i++) {
      const worker = spawn();
      workers.push(worker);

      worker.onmessage = (event: MessageEvent<ParseResponse>) => {
        complete(event.data, worker);
      };

      // A worker-level error means we never got a response for its current file.
      // Replace the worker so the slot stays useful, and report the failure under
      // the id it was holding — otherwise that row would hang on "parsing"
      // forever and the batch would never reach its total.
      worker.onerror = (event) => {
        const orphaned = inFlight.get(worker) ?? '';
        const replacement = spawn();
        workers.push(replacement);
        replacement.onmessage = (e: MessageEvent<ParseResponse>) => complete(e.data, replacement);
        replacement.onerror = worker.onerror;
        worker.terminate();
        complete(
          {
            id: orphaned,
            ok: false,
            contentHash: null,
            reason: event.message || 'worker crashed',
            unsupported: false,
          },
          replacement,
        );
      };

      dispatch(worker);
    }
  });
}
