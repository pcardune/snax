import { NFA } from '../nfa-to-dfa';
import { Lexeme, Lexer, Token } from './lexer';
import { CharacterClass } from './regex-compiler';

export enum NodeKind {
  OR = 'OR',
  STAR = 'STAR',
  PAREN = 'PAREN',
  CHAR = 'CHAR',
  CONCAT = 'CONCAT',
  ANY_CHAR = 'ANY_CHAR',
  CHAR_CLASS = 'CHAR_CLASS',
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

class AnyCharNode {
  kind: NodeKind.ANY_CHAR = NodeKind.ANY_CHAR;
  toJSON() {
    return { kind: this.kind };
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

class CharClassNode {
  kind: NodeKind.CHAR_CLASS = NodeKind.CHAR_CLASS;
  charClass: CharacterClass;
  constructor(charClass: CharacterClass) {
    this.charClass = charClass;
  }
  toJSON() {
    return { kind: this.kind, charClass: this.charClass };
  }
}

export type Node =
  | OrNode
  | StarNode
  | ParenNode
  | CharNode
  | ConcatNode
  | AnyCharNode
  | CharClassNode;

export function orNode(left: Node, right: Node) {
  return new OrNode(left, right);
}
export function concatNode(left: Node | null, right: Node) {
  if (left == null) {
    return right;
  }
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
export function anyCharNode() {
  return new AnyCharNode();
}

export function parseRegex(input: string | Iterator<Lexeme>): Node {
  let last: Node | null = null;

  let tokens: Iterator<Lexeme, Lexeme>;
  if (typeof input == 'string') {
    tokens = new Lexer(input);
    // tokens = makeLexer().parse(charCodes(input));
  } else {
    tokens = input;
  }

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
        if (last instanceof ConcatNode) {
          last = concatNode(last.left, starNode(last.right));
        } else {
          last = starNode(last);
        }
        break;
      case Token.CHAR:
        last = concatNode(last, charNode(token.char));
        break;
      case Token.ANY_CHAR:
        last = concatNode(last, anyCharNode());
        break;
      case Token.ESCAPE:
        const escapedChar = token.char[1];
        let node: Node;
        switch (escapedChar) {
          case CharacterClass.DIGIT:
          case CharacterClass.ALPHANUMBERIC:
            node = new CharClassNode(escapedChar);
            break;
          default:
            node = charNode(escapedChar);
        }
        last = concatNode(last, node);
        break;
    }
  }
  if (last == null) {
    throw new Error("Can't parse an empty regex");
  }
  return last;
}
