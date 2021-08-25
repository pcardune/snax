import { iter } from '../iter';

export class OrderedMap<K, V> {
  private keyMap: Map<K, V>;
  private keyList: K[];

  constructor(pairs: Iterable<[K, V]> = []) {
    this.keyMap = new Map();
    this.keyList = [];
    for (const [key, value] of pairs) {
      this.push(key, value);
    }
  }

  get length() {
    return this.keyList.length;
  }

  set(key: K, value: V) {
    if (this.keyMap.get(key) === undefined) {
      this.push(key, value);
    } else {
      this.keyMap.set(key, value);
    }
  }

  has(key: K) {
    return this.keyMap.has(key);
  }

  delete(key: K) {
    this.keyMap.delete(key);
    this.keyList.splice(this.keyList.indexOf(key), 1);
  }

  get(key: K) {
    return this.keyMap.get(key);
  }

  getAt(index: number): V | undefined {
    return this.keyMap.get(this.keyList[index]);
  }

  indexOf(key: K) {
    this.keyList.indexOf(key);
  }

  findIndex(callbackFn: (k: K, v: V) => boolean) {
    for (const [i, k, v] of this.entries()) {
      if (callbackFn(k, v)) {
        return i;
      }
    }
  }

  findKey(callbackFn: (v: V) => boolean) {
    for (const [i, k, v] of this.entries()) {
      if (callbackFn(v)) {
        return k;
      }
    }
  }

  push(key: K, value: V) {
    if (this.keyMap.get(key) !== undefined) {
      throw new Error(`key ${key} already in map`);
    }
    this.keyMap.set(key, value);
    this.keyList.push(key);
  }

  keys() {
    return iter(this.keyList);
  }

  *values() {
    for (const [i, key] of this.keyList.entries()) {
      yield this.get(key) as V;
    }
  }

  entries() {
    let i = 0;
    return this.keys().map(
      (key) => [i++, key, this.get(key) as V] as [number, K, V]
    );
  }

  map<W>(f: (value: V, index: number, key: K) => W): OrderedMap<K, W> {
    const map: OrderedMap<K, W> = new OrderedMap();
    for (const [i, k, v] of this.entries()) {
      map.push(k, f(v, i, k));
    }
    return map;
  }
}
