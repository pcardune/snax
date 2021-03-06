import { err, ok, Result } from 'neverthrow';

export abstract class Iter<T> implements IterableIterator<T> {
  [Symbol.iterator]() {
    return this;
  }

  abstract next(): IteratorResult<T>;

  map<O>(mapper: (i: T) => O): Iter<O> {
    return new MapIter(this, mapper);
  }
  filter(predicate: (i: T) => boolean): Iter<T> {
    return new FilterIter(this, predicate);
  }

  chain(...iters: Iter<T>[]): Iter<T> {
    return new ChainIter(this, ...iters);
  }

  catch(): CatchIter<T> {
    return new CatchIter(this);
  }

  first(): T | undefined {
    let next = this.next();
    return next.value;
  }

  peekable(): PeakableIterator<T> {
    return new Peakable(this);
  }

  toArray(): T[] {
    return [...this];
  }

  forEach(f: (item: T, index: number) => void): void {
    let index = 0;
    for (const item of this) {
      f(item, index++);
    }
  }

  join(sep: string): string {
    let s = '';
    let next = this.next();
    if (next.done) {
      return s;
    }
    for (const item of this) {
      s += sep;
      s += item;
    }
    return s;
  }
}

class PlainIter<T> extends Iter<T> {
  private iterator: Iterator<T>;
  constructor(iterable: Iterable<T>) {
    super();
    this.iterator = iterable[Symbol.iterator]();
  }
  next() {
    return this.iterator.next();
  }
}

export function iter<T>(iterable: Iterable<T> = []): Iter<T> {
  return new PlainIter(iterable);
}

class FilterIter<T> extends Iter<T> {
  private iterator: Iterator<T>;
  private predicate: (item: T) => boolean;
  constructor(iterable: Iterable<T>, predicate: (item: T) => boolean) {
    super();
    this.iterator = iterable[Symbol.iterator]();
    this.predicate = predicate;
  }
  next() {
    let next = this.iterator.next();
    while (!next.done) {
      if (this.predicate(next.value)) {
        return next;
      }
      next = this.iterator.next();
    }
    return next;
  }
}

class CatchIter<T> extends Iter<Result<T, any>> {
  private iterator: Iterator<T>;
  private error: any;

  constructor(iterable: Iterable<T>) {
    super();
    this.iterator = iterable[Symbol.iterator]();
  }
  next(): IteratorResult<Result<T, any>> {
    if (this.error !== undefined) {
      return { done: true, value: undefined };
    }
    try {
      let next = this.iterator.next();
      if (next.done) {
        return next;
      }
      return { done: false, value: ok(next.value) };
    } catch (e) {
      this.error = e;
      return { done: false, value: err(e) };
    }
  }
}

class ChainIter<T> extends Iter<T> {
  private iters: Iter<T>[];
  constructor(...iters: Iter<T>[]) {
    super();
    this.iters = iters;
  }
  next(): IteratorResult<T, undefined> {
    while (this.iters.length > 0) {
      const next = this.iters[0].next();
      if (next.done) {
        this.iters.shift();
      } else {
        return next;
      }
    }
    return { done: true, value: undefined };
  }
}

class MapIter<I, O> extends Iter<O> {
  private iterator: Iterator<I>;
  private mapper: (i: I) => O;
  constructor(iterable: Iterable<I>, mapper: (i: I) => O) {
    super();
    this.iterator = iterable[Symbol.iterator]();
    this.mapper = mapper;
  }
  next(): IteratorResult<O> {
    const { value, done } = this.iterator.next();
    if (done) {
      return { done, value: undefined };
    }
    return { value: this.mapper(value), done: false };
  }
}

interface PeakableIterator<T> extends Iter<T> {
  peek(): IteratorResult<T>;
}

class Peakable<T> extends Iter<T> implements PeakableIterator<T> {
  private iterator: Iterator<T>;
  private buffer: IteratorResult<T> | null;
  constructor(iterator: Iterator<T>) {
    super();
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

export function map<I, O>(
  it: Iterable<I>,
  map: (i: I) => O
): IterableIterator<O> {
  return new MapIter(it, map);
}

class CharCodeIterator implements IterableIterator<number> {
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
  [Symbol.iterator]() {
    return this;
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

export class RewindableIterator<T> implements IterableIterator<T> {
  private iter: Iterator<T, T>;
  private _buffer: T[] = [];
  private index: number = 0;
  constructor(iter: Iterator<T>) {
    this.iter = iter;
  }
  next(): IteratorResult<T> {
    if (this.index < this._buffer.length) {
      return { done: false, value: this._buffer[this.index++] };
    }
    const { value, done } = this.iter.next();
    if (done) {
      return { done, value: undefined };
    }
    this._buffer.push(value);
    this.index++;
    return { done: false, value };
  }
  reset(n: number) {
    this._buffer = this._buffer.slice(n);
    this.index = 0;
  }
  [Symbol.iterator]() {
    return this;
  }
  get buffer(): Readonly<T[]> {
    return this._buffer;
  }
  get buffered() {
    return this._buffer.length;
  }
}

export class BacktrackableIterator<T> implements IterableIterator<T> {
  private iter: Iterator<T, T>;
  private buffer: T[] = [];
  constructor(iter: Iterator<T>) {
    this.iter = iter;
  }
  [Symbol.iterator]() {
    return this;
  }
  next(): IteratorResult<T> {
    let item = this.buffer.pop();
    if (item !== undefined) {
      return { done: false, value: item };
    }
    return this.iter.next();
  }
  pushBack(item: T) {
    this.buffer.push(item);
  }
}

export function backtrackable<T>(iter: Iterator<T>) {
  return new BacktrackableIterator(iter);
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
