export interface LNode {
  items(): Generator<string, void, unknown>;
  match(s: string): boolean;
}

export class UnionNode implements LNode {
  l1: LNode;
  l2: LNode;
  constructor(l1: LNode, l2: LNode) {
    this.l1 = l1;
    this.l2 = l2;
  }
  *items() {
    for (const item of this.l1.items()) {
      yield item;
    }
    for (const item of this.l2.items()) {
      yield item;
    }
  }
  match(s: string) {
    return this.l1.match(s) || this.l2.match(s);
  }
}

export class ConcatNode implements LNode {
  l1: LNode;
  l2: LNode;
  constructor(l1: LNode, l2: LNode) {
    this.l1 = l1;
    this.l2 = l2;
  }
  *items() {
    for (const s1 of this.l1.items()) {
      for (const s2 of this.l2.items()) {
        yield s1 + s2;
      }
    }
  }
  match(s: string) {
    return false;
  }
}

export class StaticNode implements LNode {
  chars: string[];
  constructor(chars: string[]) {
    this.chars = chars;
  }

  *items() {
    for (const item of this.chars) {
      yield item;
    }
  }

  match(s: string) {
    for (const char of this.chars) {
      if (s == char) {
        return true;
      }
    }
    return false;
  }
}

export class ClosureNode implements LNode {
  around: LNode;
  constructor(around: LNode) {
    this.around = around;
  }
  *items(): Generator<string, void, unknown> {
    yield '';
    for (const prefix of this.around.items()) {
      yield prefix;
      for (const item of this.items()) {
        yield prefix + item;
      }
    }
  }
  match() {
    return false;
  }
}

// const empty = new StaticNode([]);

// const ab = new StaticNode(['a', 'b']);
// const cd = new StaticNode(['c', 'd']);
// const ef = new StaticNode(['e', 'f']);
// const union = new UnionNode(new UnionNode(ab, cd), ef);
// const concat = new ConcatNode(ab, union);
// for (let i of concat.items()) {
//   console.log(i);
// }

// const closure = new ClosureNode(concat);
// const items = closure.items();
// for (let i = 0; i < 10; i++) {
//   console.log(`${i}: `, items.next().value);
// }
