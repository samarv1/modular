export interface AutosaveQueue<T> {
  enqueue(value: T): void;
  flush(): Promise<boolean>;
  retry(): Promise<boolean>;
  hasUnsavedWork(): boolean;
}

export function createAutosaveQueue<T>(
  save: (value: T) => Promise<void>,
  onStateChange: (failed: boolean) => void = () => undefined,
): AutosaveQueue<T> {
  let running = false;
  let pending: T | undefined;
  let failed: T | undefined;
  let waiters: Array<(saved: boolean) => void> = [];

  function settleWaiters() {
    if (running || pending !== undefined) return;
    const saved = failed === undefined;
    const current = waiters;
    waiters = [];
    current.forEach((resolve) => resolve(saved));
  }

  async function drain() {
    if (running) return;
    running = true;
    onStateChange(failed !== undefined);

    while (pending !== undefined) {
      const snapshot = pending;
      pending = undefined;
      try {
        await save(snapshot);
        failed = undefined;
      } catch {
        if (pending === undefined) {
          failed = snapshot;
          break;
        }
      }
    }

    running = false;
    onStateChange(failed !== undefined);
    settleWaiters();
    if (pending !== undefined) void drain();
  }

  function waitForIdle() {
    if (!running && pending === undefined) {
      return Promise.resolve(failed === undefined);
    }
    return new Promise<boolean>((resolve) => waiters.push(resolve));
  }

  return {
    enqueue(value) {
      pending = value;
      failed = undefined;
      onStateChange(false);
      void drain();
    },
    flush() {
      if (pending !== undefined) void drain();
      return waitForIdle();
    },
    retry() {
      if (failed !== undefined) {
        pending = failed;
        failed = undefined;
        onStateChange(false);
        void drain();
      }
      return waitForIdle();
    },
    hasUnsavedWork() {
      return running || pending !== undefined || failed !== undefined;
    },
  };
}
