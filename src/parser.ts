export enum NodeKind {
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

  enum Token {
    STAR = '*',
    OR = '|',
    OPEN_PAREN = '(',
    CLOSE_PAREN = ')',
    CHAR = 'char',
  }
  const getToken = () => {
    const char = input[i];
    i++;
    switch (char) {
      case '\\':
        i++;
        return { kind: Token.CHAR, char: input[i - 1] };
      case '*':
        return { kind: Token.STAR, char };
      case '|':
        return { kind: Token.OR, char };
      case '(':
        return { kind: Token.OPEN_PAREN, char };
      case ')':
        return { kind: Token.CLOSE_PAREN, char };
      default:
        return { kind: Token.CHAR, char };
    }
  };

  while (i < input.length) {
    const token = getToken();
    switch (token.kind) {
      case Token.OPEN_PAREN:
        let j = i;
        let child: Node | null = null;
        let numToMatch = 1;
        while (i < input.length) {
          const t = getToken();
          if (t.kind == Token.OPEN_PAREN) {
            numToMatch++;
          } else if (t.kind == Token.CLOSE_PAREN) {
            numToMatch--;
          }
          if (numToMatch == 0) {
            child = parseRegex(input.slice(j, i));
            break;
          }
        }
        if (child == null) {
          throw new Error('Expected subexpression between ()');
        }
        last = parenNode(child);
        break;
      case Token.OR:
        if (last == null) {
          throw new Error('Expected | operator to follow another expression');
        }
        let right = parseRegex(input.slice(i));
        last = orNode(last, right);
        i = input.length;
        break;
      case Token.STAR:
        if (last == null) {
          throw new Error('Expected * operator to follow another expression');
        }
        last = starNode(last);
        break;
      case Token.CHAR:
        if (last == null) {
          last = charNode(token.char);
        } else {
          last = concatNode(last, charNode(token.char));
        }
        break;
    }
  }
  if (last == null) {
    throw new Error("Can't parse an empty regex");
  }
  return last;
}
