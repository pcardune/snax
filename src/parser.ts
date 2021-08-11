import { Lexeme, Lexer, Token } from './lexer';

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

export function parseRegex(input: string | Iterator<Lexeme>): Node {
  let last: Node | null = null;

  let tokens: Iterator<Lexeme, Lexeme> =
    typeof input == 'string' ? new Lexer(input) : input;

  while (true) {
    const { value: token, done } = tokens.next();
    if (done) {
      break;
    }
    switch (token.kind) {
      case Token.OPEN_PAREN:
        let child: Node | null = null;
        let numToMatch = 1;

        let childTokens: Lexeme[] = [];
        while (true) {
          const { value: nextToken, done } = tokens.next();
          if (done) {
            throw new Error('Reached end of input before finding matching )');
          }
          if (nextToken.kind == Token.OPEN_PAREN) {
            numToMatch++;
          } else if (nextToken.kind == Token.CLOSE_PAREN) {
            numToMatch--;
          }
          if (numToMatch > 0) {
            childTokens.push(nextToken);
          } else {
            child = parseRegex(childTokens[Symbol.iterator]());
            break;
          }
        }
        last = parenNode(child);
        break;
      case Token.OR:
        if (last == null) {
          throw new Error('Expected | operator to follow another expression');
        }
        let right = parseRegex(tokens);
        last = orNode(last, right);
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
