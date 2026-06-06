import assert from "node:assert/strict";
import { asyncIterableToObservable } from "../src/interview/interview-sse";

async function collectObservable<T>(observable: { subscribe: Function }): Promise<T[]> {
  const values: T[] = [];
  await new Promise<void>((resolve, reject) => {
    observable.subscribe({
      next(value: T) {
        values.push(value);
      },
      error(error: unknown) {
        reject(error);
      },
      complete() {
        resolve();
      },
    });
  });
  return values;
}

async function main() {
  async function* events() {
    yield { type: "token", content: "hello" };
    yield { type: "done" };
  }

  assert.deepEqual(await collectObservable(asyncIterableToObservable(events())), [
    { type: "token", content: "hello" },
    { type: "done" },
  ]);

  let returned = false;
  const iterable: AsyncIterable<string> = {
    [Symbol.asyncIterator]() {
      return {
        next() {
          return new Promise<IteratorResult<string>>(() => {});
        },
        return() {
          returned = true;
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };

  const subscription = asyncIterableToObservable(iterable).subscribe();
  subscription.unsubscribe();

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(returned, true);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
