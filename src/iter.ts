interface PeakableIterator<T> extends Iterator<T> {
  peek(): IteratorResult<T>;
}

class Peakable<T> implements PeakableIterator<T> {
  private iterator: Iterator<T>;
  private buffer: IteratorResult<T> | null;
  constructor(iterator: Iterator<T>) {
    this.iterator = iterator;
    this.buffer = null;
  }
  next(): IteratorResult<T> {
    let result = this.peek();
    this.buffer = null;
    return result;
  }
  peek(): IteratorResult<T> {
    if (this.buffer == null) {
      this.buffer = this.iterator.next();
      return this.buffer;
    }
    return this.buffer;
  }
}

class MapIterator<I, O> implements IterableIterator<O> {
  private iterator: Iterator<I>;
  private mapper: (i: I) => O;
  constructor(iterator: Iterator<I>, mapper: (i: I) => O) {
    this.iterator = iterator;
    this.mapper = mapper;
  }
  next() {
    const { value, done } = this.iterator.next();
    if (done) {
      return { done, value: undefined };
    }
    return { value: this.mapper(value), done };
  }
  [Symbol.iterator]() {
    return this;
  }
}

export function peakable<T>(it: Iterator<T>) {
  return new Peakable(it);
}

export function collect<T>(it: Iterator<T, T>): T[] {
  let values: T[] = [];
  let result;
  do {
    result = it.next();
    if (result.done == false) {
      values.push(result.value);
    }
  } while (result.done == false);
  return values;
}

export function map<I, O>(it: Iterator<I>, map: (i: I) => O): Iterator<O> {
  return new MapIterator(it, map);
}

class CharCodeIterator implements Iterator<number> {
  private input: string;
  private index: number = 0;
  constructor(input: string) {
    this.input = input;
  }
  next(): IteratorResult<number> {
    if (this.index >= this.input.length) {
      return { done: true, value: undefined };
    }
    return { done: false, value: this.input.charCodeAt(this.index++) };
  }
  prefix(): string {
    return this.input.slice(0, this.index);
  }
  suffix(): string {
    return this.input.slice(this.index);
  }
}

export function charCodes(input: string) {
  return new CharCodeIterator(input);
}

class ConcatIterator<T> implements Iterator<T> {
  private iters: Iterator<T, T>[];
  private index: number = 0;
  constructor(...iters: Iterator<T>[]) {
    this.iters = iters;
  }
  next(): IteratorResult<T> {
    if (this.index >= this.iters.length) {
      return { done: true, value: undefined };
    }
    const iter = this.iters[this.index];
    const { done, value } = iter.next();
    if (done) {
      this.index++;
      return this.next();
    }
    return { done, value };
  }
}

export function concat<T>(...iters: Iterator<T>[]) {
  return new ConcatIterator(...iters);
}

export class RewindableIterator<T> implements Iterator<T> {
  private iter: Iterator<T, T>;
  private buffer: T[] = [];
  private index: number = 0;
  constructor(iter: Iterator<T>) {
    this.iter = iter;
  }
  next(): IteratorResult<T> {
    if (this.index < this.buffer.length) {
      return { done: false, value: this.buffer[this.index++] };
    }
    const { value, done } = this.iter.next();
    if (done) {
      return { done, value: undefined };
    }
    this.buffer.push(value);
    this.index++;
    return { done: false, value };
  }
  reset(n: number) {
    this.buffer = this.buffer.slice(n);
    this.index = 0;
  }
  get buffered() {
    return this.buffer.length;
  }
}

export function rewindable<T>(iter: Iterator<T>) {
  return new RewindableIterator(iter);
}

export function iterable<T>(it: Iterator<T>): IterableIterator<T> {
  const iterable = {
    next() {
      return it.next();
    },
    [Symbol.iterator]() {
      return iterable;
    },
  };
  return iterable;
}

export function* range(start: number, end: number) {
  for (let i = start; i < end; i++) {
    yield i;
  }
}
