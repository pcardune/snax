import { label, NFA } from '../nfa-to-dfa';
import { Lexeme, Lexer, Token } from './lexer';
import {
  anyCharNFA,
  CharacterClass,
  charClassNFA,
  concatNFA,
  labelNFA,
  nfaForNode,
  orNFA,
  starNFA,
} from './regex-compiler';

export enum NodeKind {
  OR = 'OR',
  STAR = 'STAR',
  PAREN = 'PAREN',
  CHAR = 'CHAR',
  CONCAT = 'CONCAT',
  ANY_CHAR = 'ANY_CHAR',
  ONE_OR_MORE = 'ONE_OR_MORE',
  CHAR_CLASS = 'CHAR_CLASS',
}
export abstract class RNode<Props = unknown> {
  abstract kind: NodeKind;
  props: Props;
  constructor(props: Props) {
    this.props = props;
  }
  toJSON(): any {
    return this.props;
  }
  abstract nfa<D>(data?: D): NFA<D | undefined>;
}

export class OrNode extends RNode<{ left: RNode; right: RNode }> {
  kind = NodeKind.OR;
  nfa<D>(data?: D): NFA<D | undefined> {
    return orNFA(
      nfaForNode(this.props.left, data),
      nfaForNode(this.props.right, data),
      data
    );
  }
}

export class AnyCharNode extends RNode<{}> {
  kind = NodeKind.ANY_CHAR;
  nfa<D>(data?: D): NFA<D | undefined> {
    return anyCharNFA(data);
  }
}

export class ConcatNode extends RNode<{ left: RNode; right: RNode }> {
  kind = NodeKind.CONCAT;
  nfa<D>(data?: D): NFA<D | undefined> {
    return concatNFA(
      nfaForNode(this.props.left, data),
      nfaForNode(this.props.right, data)
    );
  }
}

export class StarNode extends RNode<{ child: RNode }> {
  kind = NodeKind.STAR;
  nfa<D>(data?: D): NFA<D | undefined> {
    return starNFA(nfaForNode(this.props.child, data), data);
  }
}

export class OneOrMoreNode extends RNode<{ child: RNode }> {
  kind = NodeKind.ONE_OR_MORE;
  nfa<D>(data?: D): NFA<D | undefined> {
    return concatNFA(
      nfaForNode(this.props.child, data),
      starNFA(nfaForNode(this.props.child, data), data)
    );
  }
}

export class ParenNode extends RNode<{ child: RNode }> {
  kind = NodeKind.PAREN;
  nfa<D>(data?: D): NFA<D | undefined> {
    return this.props.child.nfa(data);
  }
}

export class CharNode extends RNode<{ char: string }> {
  kind = NodeKind.CHAR;
  nfa<D>(data?: D): NFA<D | undefined> {
    return labelNFA(label(this.props.char), data);
  }
}

export class CharClassNode extends RNode<{ charClass: CharacterClass }> {
  kind = NodeKind.CHAR_CLASS;
  nfa<D>(data?: D): NFA<D | undefined> {
    return charClassNFA(this.props.charClass, data);
  }
}

export function orNode(left: RNode, right: RNode) {
  return new OrNode({ left, right });
}
export function concatNode(left: RNode | null, right: RNode) {
  if (left == null) {
    return right;
  }
  return new ConcatNode({ left, right });
}
export function starNode(child: RNode) {
  return new StarNode({ child });
}
export function parenNode(child: RNode) {
  return new ParenNode({ child });
}
export function charNode(char: string) {
  return new CharNode({ char });
}
export function anyCharNode() {
  return new AnyCharNode({});
}

class RegexParser {
  private tokens: Iterator<Lexeme, Lexeme>;
  private last: RNode | null = null;

  private constructor(input: string | Iterator<Lexeme>) {
    if (typeof input == 'string') {
      this.tokens = new Lexer(input);
    } else {
      this.tokens = input;
    }
  }

  static parse(input: string | Iterator<Lexeme>): RNode {
    return new RegexParser(input).parse();
  }

  parse(): RNode {
    while (true) {
      const { value: token, done } = this.tokens.next();
      if (done) {
        break;
      }
      switch (token.token) {
        case Token.OPEN_PAREN:
          this.parseParens();
          break;
        case Token.OR:
          this.parseOr();
          break;
        case Token.PLUS:
        case Token.STAR:
          this.parseStarPlus(token);
          break;
        case Token.CHAR:
          this.last = concatNode(
            this.last,
            new CharNode({ char: token.substr })
          );
          break;
        case Token.ANY_CHAR:
          this.last = concatNode(this.last, new AnyCharNode({}));
          break;
        case Token.ESCAPE:
          this.parseEscape(token);
          break;
        default:
          throw new Error(`Don't know how to parse ${token}`);
      }
    }
    if (this.last == null) {
      throw new Error("Can't parse an empty regex");
    }
    return this.last;
  }

  private parseEscape(token: Lexeme) {
    const escapedChar = token.substr[1];
    let node: RNode;
    switch (escapedChar) {
      case CharacterClass.DIGIT:
      case CharacterClass.ALPHANUMBERIC:
        node = new CharClassNode({ charClass: escapedChar });
        break;
      default:
        node = new CharNode({ char: escapedChar });
    }
    this.last = concatNode(this.last, node);
  }

  private parseStarPlus(token: Lexeme) {
    if (this.last == null) {
      throw new Error('Expected * operator to follow another expression');
    }
    {
      let child: RNode =
        this.last instanceof ConcatNode ? this.last.props.right : this.last;
      let right =
        token.token == Token.STAR
          ? new StarNode({ child: child })
          : new OneOrMoreNode({ child: child });
      if (this.last instanceof ConcatNode) {
        this.last = concatNode(this.last.props.left, right);
      } else {
        this.last = right;
      }
    }
  }

  private parseOr() {
    if (this.last == null) {
      throw new Error('Expected | operator to follow another expression');
    }
    let right = parseRegex(this.tokens);
    this.last = new OrNode({ left: this.last, right });
  }

  private parseParens() {
    let child: RNode | null = null;
    let numToMatch = 1;

    let childTokens: Lexeme[] = [];
    while (true) {
      const { value: nextToken, done } = this.tokens.next();
      if (done) {
        throw new Error('Reached end of input before finding matching )');
      }
      if (nextToken.token == Token.OPEN_PAREN) {
        numToMatch++;
      } else if (nextToken.token == Token.CLOSE_PAREN) {
        numToMatch--;
      }
      if (numToMatch > 0) {
        childTokens.push(nextToken);
      } else {
        child = parseRegex(childTokens[Symbol.iterator]());
        break;
      }
    }
    this.last = new ParenNode({ child });
  }
}

export const parseRegex = RegexParser.parse;
