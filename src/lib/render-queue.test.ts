import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderBusyError, renderQueueDepth, withRenderSlot } from './render-queue';

const tick = () => new Promise((r) => setTimeout(r, 5));

/** A job that only finishes when the test says so. */
function gate() {
  let open!: () => void;
  const held = new Promise<void>((r) => (open = r));
  return { open, job: () => held };
}

test('two renders never overlap', async () => {
  const order: string[] = [];
  const a = gate();
  const b = gate();

  const first = withRenderSlot(async () => {
    order.push('a:start');
    await a.job();
    order.push('a:end');
  });
  await tick();

  const second = withRenderSlot(async () => {
    order.push('b:start');
    await b.job();
    order.push('b:end');
  });
  await tick();

  assert.deepEqual(order, ['a:start'], 'b waits for the slot');
  assert.equal(renderQueueDepth(), 1);

  a.open();
  await first;
  await tick();
  assert.deepEqual(order, ['a:start', 'a:end', 'b:start']);

  b.open();
  await second;
  assert.deepEqual(order, ['a:start', 'a:end', 'b:start', 'b:end']);
  assert.equal(renderQueueDepth(), 0);
});

test('a job that throws still hands the slot on', async () => {
  const a = gate();
  const first = withRenderSlot(async () => {
    await a.job();
    throw new Error('render blew up');
  });
  await tick();

  let ran = false;
  const second = withRenderSlot(async () => {
    ran = true;
  });

  a.open();
  await assert.rejects(first, /render blew up/);
  await second;
  assert.equal(ran, true, 'the queue is not wedged by a failed render');
  assert.equal(renderQueueDepth(), 0);
});

test('the queue drains in order and leaves nothing behind', async () => {
  const done: number[] = [];
  const first = gate();
  const held = withRenderSlot(async () => {
    await first.job();
    done.push(0);
  });
  await tick();

  const rest = [1, 2, 3].map((n) =>
    withRenderSlot(async () => {
      done.push(n);
    }),
  );
  await tick();
  assert.equal(renderQueueDepth(), 3);

  first.open();
  await Promise.all([held, ...rest]);
  assert.deepEqual(done, [0, 1, 2, 3]);
  assert.equal(renderQueueDepth(), 0);
});

test('RenderBusyError is what a caller can recognise a full queue by', () => {
  assert.equal(new RenderBusyError() instanceof Error, true);
  assert.equal(new RenderBusyError().name, 'RenderBusyError');
});
