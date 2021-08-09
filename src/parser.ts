enum NodeKind {
  OR = 'OR',
  STAR = 'STAR',
  PAREN = 'PAREN',
  CHAR = 'CHAR',
  CONCAT = 'CONCAT',
}
class OrNode {
  kind: NodeKind.OR = NodeKind.OR;
  left: Node;
  right: Node;
  constructor(left: Node, right: Node) {
    this.left = left;
    this.right = right;
  }
  toJSON() {
    return { kind: this.kind, left: this.left, right: this.right };
  }
}

class ConcatNode {
  kind: NodeKind.CONCAT = NodeKind.CONCAT;
  left: Node;
  right: Node;
  constructor(left: Node, right: Node) {
    this.left = left;
    this.right = right;
  }
  toJSON() {
    return { kind: this.kind, left: this.left, right: this.right };
  }
}

class StarNode {
  kind: NodeKind.STAR = NodeKind.STAR;
  child: Node;
  constructor(child: Node) {
    this.child = child;
  }
  toJSON() {
    return { kind: this.kind, child: this.child };
  }
}

class ParenNode {
  kind: NodeKind.PAREN = NodeKind.PAREN;
  child: Node;
  constructor(child: Node) {
    this.child = child;
  }
  toJSON() {
    return { kind: this.kind, child: this.child };
  }
}

class CharNode {
  kind: NodeKind.CHAR = NodeKind.CHAR;
  char: string;
  constructor(char: string) {
    this.char = char;
  }
  toJSON() {
    return { kind: this.kind, char: this.char };
  }
}

export type Node = OrNode | StarNode | ParenNode | CharNode | ConcatNode;

export function orNode(left: Node, right: Node) {
  return new OrNode(left, right);
}
export function concatNode(left: Node, right: Node) {
  return new ConcatNode(left, right);
}
export function starNode(child: Node) {
  return new StarNode(child);
}
export function parenNode(child: Node) {
  return new ParenNode(child);
}
export function charNode(char: string) {
  return new CharNode(char);
}

export function parseRegex(input: string): Node {
  let i = 0;
  let last: Node | null = null;
  while (i < input.length) {
    const char = input[i];
    switch (char) {
      case '(':
        let j = i + 1;
        let child: Node | null = null;
        for (; j < input.length; j++) {
          if (input[j] == ')') {
            child = parseRegex(input.slice(i + 1, j));
            break;
          }
        }
        if (child == null) {
          throw new Error('Expected subexpression between ()');
        }
        last = parenNode(child);
        i = j + 1;
        break;
      case '|':
        if (last == null) {
          throw new Error('Expected | operator to follow another expression');
        }
        let right = parseRegex(input.slice(i + 1));
        last = orNode(last, right);
        i = input.length;
        break;
      case '*':
        if (last == null) {
          throw new Error('Expected * operator to follow another expression');
        }
        last = starNode(last);
        i++;
        break;
      default:
        if (last == null) {
          last = charNode(char);
        } else {
          last = concatNode(last, charNode(char));
        }
        i++;
        break;
    }
  }
  if (last == null) {
    throw new Error("Can't parse an empty regex");
  }
  return last;
}
