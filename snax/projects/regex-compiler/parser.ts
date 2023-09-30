import { range } from '../utils/iter.js';
import {
  chars,
  notChars,
  type RegexNFA,
  SingleCharNFA,
} from '../nfa-to-dfa/regex-nfa.js';
import { type Lexeme, Lexer, Token } from './lexer.js';
import { err, ok, Result } from 'neverthrow';
import { LexToken } from '../lexer-gen/LexToken.js';

enum CharacterClass {
  DIGIT = 'd',
  ALPHANUMBERIC = 'w',
}

export enum NodeKind {
  OR = 'OR',
  STAR = 'STAR',
  PAREN = 'PAREN',
  CHAR = 'CHAR',
  CONCAT = 'CONCAT',
  ANY_CHAR = 'ANY_CHAR',
  ONE_OR_MORE = 'ONE_OR_MORE',
  CHAR_CLASS = 'CHAR_CLASS',
  MULTI_CHAR_CLASS = 'MULTI_CHARR_CLASS',
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
  abstract nfa(): RegexNFA;
}

export class OrNode extends RNode<{ left: RNode; right: RNode }> {
  kind = NodeKind.OR;
  nfa() {
    return this.props.left.nfa().or(this.props.right.nfa());
  }
}

export class AnyCharNode extends RNode<{}> {
  kind = NodeKind.ANY_CHAR;
  nfa() {
    return notChars('\n\r');
  }
}

export class ConcatNode extends RNode<{ left: RNode; right: RNode }> {
  kind = NodeKind.CONCAT;
  nfa() {
    return this.props.left.nfa().concat(this.props.right.nfa());
  }
}

export class StarNode extends RNode<{ child: RNode }> {
  kind = NodeKind.STAR;
  nfa() {
    return this.props.child.nfa().star();
  }
}

export class OneOrMoreNode extends RNode<{ child: RNode }> {
  kind = NodeKind.ONE_OR_MORE;
  nfa() {
    let child = this.props.child.nfa();
    return child.concat(child.clone().star());
  }
}

export class ParenNode extends RNode<{ child: RNode }> {
  kind = NodeKind.PAREN;
  nfa() {
    return this.props.child.nfa();
  }
}

export class CharNode extends RNode<{ char: string }> {
  kind = NodeKind.CHAR;
  nfa() {
    return new SingleCharNFA(this.props.char);
  }
}
type CharClassSpec =
  | { kind: 'charClass'; class: CharacterClass }
  | { kind: 'charRange'; range: { start: string; end: string } }
  | { kind: 'charList'; chars: string };

export class CharClassNode extends RNode<{ charClass: CharClassSpec }> {
  kind = NodeKind.CHAR_CLASS;

  private charClassCodes(charClass: CharacterClass): number[] {
    const digits = '0123456789';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = lower.toUpperCase();
    const alphaNumeric = digits + lower + upper + '_';
    let validChars: string;
    switch (charClass) {
      case CharacterClass.DIGIT:
        validChars = digits;
        break;
      case CharacterClass.ALPHANUMBERIC:
        validChars = alphaNumeric;
        break;
      default:
        throw new Error(`${charClass} is not a valid character class`);
    }
    const validCharCodes = validChars
      .split('')
      .map((char) => char.charCodeAt(0));
    return validCharCodes;
  }

  getValidCharCodes(): number[] {
    const { charClass } = this.props;
    switch (charClass.kind) {
      case 'charClass':
        return this.charClassCodes(charClass.class);
      case 'charRange':
        const { start, end } = charClass.range;
        return [...range(start.charCodeAt(0), end.charCodeAt(0) + 1)];
      case 'charList': {
        return charClass.chars.split('').map((char) => char.charCodeAt(0));
      }
      default:
        throw new Error(
          `Unrecognized CharClassSpec kind ${(charClass as any).kind}`
        );
    }
  }
  nfa() {
    return chars(this.getValidCharCodes());
  }
}

class MultiCharClassNode extends RNode<{
  charClassNodes: CharClassNode[];
  negate: boolean;
}> {
  kind: NodeKind.MULTI_CHAR_CLASS = NodeKind.MULTI_CHAR_CLASS;
  nfa() {
    let charCodes: Set<number> = new Set();
    for (const charClass of this.props.charClassNodes) {
      for (const charCode of charClass.getValidCharCodes()) {
        charCodes.add(charCode);
      }
    }
    if (this.props.negate) {
      return notChars(charCodes);
    }
    return chars(charCodes);
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
export function plusNode(child: RNode) {
  return new OneOrMoreNode({ child });
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
export function charRangeNode(start: string, end: string) {
  return charClassNode({ kind: 'charRange', range: { start, end } });
}
export function charListNode(chars: string) {
  return charClassNode({ kind: 'charList', chars });
}
export function charClassNode(charClass: CharClassSpec) {
  return new CharClassNode({ charClass });
}
export function multiCharClassNode(
  charClasses: CharClassNode[],
  negate = false
) {
  return new MultiCharClassNode({ charClassNodes: charClasses, negate });
}

export class RegexParser {
  private tokens: Iterator<Lexeme, Lexeme>;
  private last: RNode | null = null;

  private constructor(input: string | Iterator<Lexeme>) {
    if (typeof input == 'string') {
      this.tokens = new Lexer(input);
    } else {
      this.tokens = input;
    }
  }

  static parse(input: string | Iterator<Lexeme>): RNode | null {
    return (
      RegexParser.parseResult(input) as Result<RNode | null, any>
    ).unwrapOr(null);
  }

  static parseOrThrow(input: string | Iterator<Lexeme>): RNode {
    return new RegexParser(input).parse();
  }

  static parseResult(input: string | Iterator<Lexeme>): Result<RNode, any> {
    try {
      return ok(new RegexParser(input).parse());
    } catch (e) {
      return err(e);
    }
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
        case Token.OPEN_BRACKET:
          this.parseBracket();
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
        node = new CharClassNode({
          charClass: { kind: 'charClass', class: escapedChar },
        });
        break;
      case '(':
      case '[':
      case '+':
      case '*':
      case '.':
        node = charNode(escapedChar);
        break;
      default:
        node = concatNode(charNode('\\'), charNode(escapedChar));
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
    let right = RegexParser.parseOrThrow(this.tokens);
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
        child = RegexParser.parseOrThrow(childTokens[Symbol.iterator]());
        break;
      }
    }
    const parenNode = new ParenNode({ child });
    if (this.last != null) {
      this.last = new ConcatNode({ left: this.last, right: parenNode });
    } else {
      this.last = parenNode;
    }
  }

  private parseBracket() {
    // step 1: collect tokens up until first ]
    let innerTokens: Lexeme[] = [];
    outer: while (true) {
      const nextToken = this.tokens.next();
      if (nextToken.done) {
        throw new Error('Reached end of input before finding matching ]');
      }
      const token = nextToken.value;
      switch (token.token) {
        case Token.CLOSE_BRACKET:
          break outer;
        case Token.CHAR:
          innerTokens.push(token);
          break;
        case Token.ESCAPE:
          // convert ESCAPE tokens to two CHAR tokens
          // so they get treated like chars
          innerTokens.push(
            new LexToken(
              Token.CHAR,
              { from: token.span.from, to: token.span.to - 1 },
              token.substr[0]
            )
          );
          innerTokens.push(
            new LexToken(
              Token.CHAR,
              { from: token.span.from + 1, to: token.span.to },
              token.substr[1]
            )
          );
          break;
        default:
          throw new Error(`Unexpected token ${token.substr} inside []`);
      }
    }
    // step 2: collect valid char classes, or a range of them.
    let charClassNodes: CharClassNode[] = [];
    let validChars = '';
    let ti = 0;
    let negate: boolean = false;
    while (ti < innerTokens.length) {
      const token = innerTokens[ti++];
      if (ti - 1 == 0 && token.substr == '^') {
        negate = true;
        continue;
      } else if (
        token.substr == '-' &&
        validChars.length > 0 &&
        ti < innerTokens.length
      ) {
        if (validChars.length > 1) {
          charClassNodes.push(
            new CharClassNode({
              charClass: {
                kind: 'charList',
                chars: validChars.slice(0, validChars.length - 1),
              },
            })
          );
        }
        const start = validChars[validChars.length - 1];
        const end = innerTokens[ti++].substr;
        charClassNodes.push(
          new CharClassNode({
            charClass: { kind: 'charRange', range: { start, end } },
          })
        );
        validChars = '';
      } else {
        validChars += token.substr;
      }
    }

    // step 3: finish up
    if (validChars.length > 0) {
      charClassNodes.push(
        new CharClassNode({
          charClass: {
            kind: 'charList',
            chars: validChars,
          },
        })
      );
    }
    const charClassNode = new MultiCharClassNode({ charClassNodes, negate });
    if (this.last) {
      this.last = new ConcatNode({ left: this.last, right: charClassNode });
    } else {
      this.last = charClassNode;
    }
  }
}

export const parseRegex = RegexParser.parseOrThrow;
