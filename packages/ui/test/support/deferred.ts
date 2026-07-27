export interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: Error): void;
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function last<T>(items: T[], waitingFor: string): T {
  const item = items[items.length - 1];
  if (item === undefined) {
    throw new Error(`${waitingFor} has not called the api yet`);
  }
  return item;
}
