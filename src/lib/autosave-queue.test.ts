import { describe, expect, it, vi } from "vitest";
import { createAutosaveQueue } from "./autosave-queue";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createAutosaveQueue", () => {
  it("serializes writes and retains only the newest pending snapshot", async () => {
    const first = deferred();
    const saved: number[] = [];
    const save = vi.fn(async (value: number) => {
      saved.push(value);
      if (value === 1) await first.promise;
    });
    const queue = createAutosaveQueue(save);

    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    expect(queue.hasUnsavedWork()).toBe(true);
    first.resolve();

    await expect(queue.flush()).resolves.toBe(true);
    expect(saved).toEqual([1, 3]);
    expect(queue.hasUnsavedWork()).toBe(false);
  });

  it("keeps a failed snapshot, blocks flush, and retries it", async () => {
    const save = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    const states: boolean[] = [];
    const queue = createAutosaveQueue(save, (failed) => states.push(failed));

    queue.enqueue("latest");
    await expect(queue.flush()).resolves.toBe(false);
    expect(queue.hasUnsavedWork()).toBe(true);

    await expect(queue.retry()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("latest");
    expect(queue.hasUnsavedWork()).toBe(false);
    expect(states).toContain(true);
  });

  it("continues with a newer snapshot when an older in-flight save fails", async () => {
    const first = deferred();
    const saved: number[] = [];
    const queue = createAutosaveQueue(async (value: number) => {
      saved.push(value);
      if (value === 1) await first.promise;
    });

    queue.enqueue(1);
    queue.enqueue(2);
    first.reject(new Error("stale write failed"));

    await expect(queue.flush()).resolves.toBe(true);
    expect(saved).toEqual([1, 2]);
  });
});
