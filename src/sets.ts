export type ConstSet<T> = Pick<Set<T>, 'size' | 'has'> & Iterable<T>;

export class NumberSet implements ConstSet<number> {
  private data: Set<number>;
  constructor(items: number[] | Set<number>) {
    this.data = new Set(items);
  }
  get size(): number {
    return this.data.size;
  }

  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
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
}
