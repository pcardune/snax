interface PeakableIterator<T> extends Iterator<T> {
  peek(): IteratorResult<T>;
}

class Peakable<T> implements PeakableIterator<T> {
  iterator: Iterator<T>;
  buffer: IteratorResult<T> | null;
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

export function peakable<T>(it: Iterator<T>) {
  return new Peakable(it);
}

export function collect<T>(it: Iterator<T>): T[] {
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
