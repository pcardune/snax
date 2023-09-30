import { iterable, map } from './iter.js';

export type ConstSet<T> = Pick<Set<T>, 'size' | 'has'> & Iterable<T>;

export class HashMap<K, V> implements Map<K, V> {
  private hasher: (item: K) => string;
  private keyset: HashSet<K>;
  private data: { [index: string]: V } = {};
  constructor(hasher: (item: K) => string) {
    this.hasher = hasher;
    this.keyset = new HashSet(hasher);
  }
  clear(): void {
    this.data = {};
    this.keyset.clear();
  }
  delete(key: K): boolean {
    this.data[this.hasher(key)];
    const had = this.keyset.has(key);
    this.keyset.delete(key);
    return had;
  }
  forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any
  ): void {
    throw new Error('Method not implemented.');
  }
  get(key: K): V | undefined {
    return this.data[this.hasher(key)];
  }
  has(key: K): boolean {
    return this.keyset.has(key);
  }
  set(key: K, value: V): this {
    this.data[this.hasher(key)] = value;
    this.keyset.add(key);
    return this;
  }
  get size(): number {
    return this.keyset.size;
  }
  entries(): IterableIterator<[K, V]> {
    return iterable(map(this.keys(), (k) => [k, this.get(k)] as [K, V]));
  }
  keys(): IterableIterator<K> {
    return this.keyset[Symbol.iterator]();
  }
  values(): IterableIterator<V> {
    return Object.values(this.data)[Symbol.iterator]();
  }
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }
  get [Symbol.toStringTag](): string {
    return 'HashMap';
  }
}

export class HashSet<T> implements Set<T> {
  private data: { [index: string]: T } = {};
  private hasher: (item: T) => string;
  constructor(hasher: (item: T) => string, items?: T[]) {
    this.hasher = hasher;
    if (items) {
      for (const item of items) {
        this.add(item);
      }
    }
  }
  get size() {
    return Object.keys(this.data).length;
  }
  add(value: T): this {
    this.data[this.hasher(value)] = value;
    return this;
  }
  clear(): void {
    this.data = {};
  }
  delete(value: T): boolean {
    const had = this.has(value);
    delete this.data[this.hasher(value)];
    return had;
  }
  forEach(
    callbackfn: (value: T, value2: T, set: Set<T>) => void,
    thisArg?: any
  ): void {
    for (const value of this) {
      callbackfn.call(thisArg, value, value, this);
    }
  }
  has(value: T): boolean {
    return this.data[this.hasher(value)] !== undefined;
  }
  entries(): IterableIterator<[T, T]> {
    return iterable(map(this.values(), (v) => [v, v] as [T, T]));
  }
  keys(): IterableIterator<T> {
    return this.values();
  }
  values(): IterableIterator<T> {
    return Object.values(this.data)[Symbol.iterator]();
  }
  [Symbol.iterator](): IterableIterator<T> {
    return this.values();
  }
  get [Symbol.toStringTag](): string {
    return 'HashSet';
  }
}

export class NumberSet implements ConstSet<number> {
  private data: Set<number>;
  constructor(items: number[] | Set<number> = []) {
    this.data = new Set(items);
  }
  get size(): number {
    return this.data.size;
  }

  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }

  first() {
    for (let item of this) {
      return item;
    }
  }

  has(a: number): boolean {
    return this.data.has(a);
  }
  equals(other: NumberSet): boolean {
    if (this.size != other.size) {
      return false;
    }
    for (const a of this.data) {
      if (!other.has(a)) {
        return false;
      }
    }
    return true;
  }

  hash(): string {
    let values: number[] = Array.from(this.data.values());
    values.sort((a, b) => a - b);
    return `{${values.join(',')}}`;
  }
}

export class MultiSet implements ConstSet<NumberSet> {
  private data: NumberSet[];
  constructor(items?: NumberSet[]) {
    this.data = [];
    if (items) {
      for (const item of items) {
        this.add(item);
      }
    }
  }
  get size(): number {
    return this.data.length;
  }

  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }

  delete(item: NumberSet): void {
    this.data = this.data.filter((n) => !n.equals(item));
  }

  pop(): NumberSet | undefined {
    return this.data.pop();
  }

  has(item: NumberSet): boolean {
    for (const h of this.data.values()) {
      if (h.equals(item)) {
        return true;
      }
    }
    return false;
  }

  add(item: NumberSet): void {
    if (!this.has(item)) {
      this.data.push(item);
    }
  }

  equals(other: MultiSet): boolean {
    if (other.size != this.size) {
      return false;
    }
    for (const otherSet of other) {
      if (!this.has(otherSet)) {
        return false;
      }
    }
    return true;
  }
}
