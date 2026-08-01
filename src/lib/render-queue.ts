/**
 * One PDF render at a time, per server process.
 *
 * @react-pdf lays a document out on the CPU in long synchronous stretches, and
 * this app is a single Node process — so a 600-page transcript does not just
 * make its own request slow, it stalls the event loop for everyone else
 * (measured: ~7 of 10 heartbeats missed while rendering). Serialising means the
 * stall happens once instead of two or three times over, and a second admin
 * pressing print during a big job waits in line rather than making the first
 * job slower too.
 *
 * A caller that would have to wait longer than MAX_WAIT_MS is turned away with
 * a 503 instead: better an honest "ลองใหม่อีกครั้ง" than a browser tab that
 * sits blank for two minutes, which is the thing this whole change is about.
 *
 * No `server-only` here on purpose — it holds nothing secret and touches no
 * node API, and being importable outside Next is what lets the queue itself be
 * tested. A slot that leaked would wedge every export in the process until a
 * restart, so that is worth having covered.
 */

const MAX_WAIT_MS = 45_000;

let running = false;
const waiting: Array<() => void> = [];

export class RenderBusyError extends Error {
  constructor() {
    super('render queue is busy');
    this.name = 'RenderBusyError';
  }
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else running = false;
}

/** Run `job` with the render slot held. Throws RenderBusyError if the wait is too long. */
export async function withRenderSlot<T>(job: () => Promise<T>): Promise<T> {
  if (running) {
    await new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const enter = () => {
        clearTimeout(timer);
        resolve();
      };
      timer = setTimeout(() => {
        const i = waiting.indexOf(enter);
        if (i >= 0) waiting.splice(i, 1);
        reject(new RenderBusyError());
      }, MAX_WAIT_MS);
      waiting.push(enter);
    });
  }
  running = true;
  try {
    return await job();
  } finally {
    release();
  }
}

/** How many requests are queued behind the one being rendered. */
export function renderQueueDepth(): number {
  return waiting.length;
}
