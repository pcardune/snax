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

export function parseRegex(input: string | Iterator<Lexeme>): RNode {
  let last: RNode | null = null;

  let tokens: Iterator<Lexeme, Lexeme>;
  if (typeof input == 'string') {
    tokens = new Lexer(input);
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
        let child: RNode | null = null;
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
        last = new ParenNode({ child });
        break;
      case Token.OR:
        if (last == null) {
          throw new Error('Expected | operator to follow another expression');
        }
        let right = parseRegex(tokens);
        last = new OrNode({ left: last, right });
        break;
      case Token.STAR:
        if (last == null) {
          throw new Error('Expected * operator to follow another expression');
        }
        if (last instanceof ConcatNode) {
          last = concatNode(
            last.props.left,
            new StarNode({ child: last.props.right })
          );
        } else {
          last = new StarNode({ child: last });
        }
        break;
      case Token.CHAR:
        last = concatNode(last, new CharNode({ char: token.char }));
        break;
      case Token.ANY_CHAR:
        last = concatNode(last, new AnyCharNode({}));
        break;
      case Token.ESCAPE:
        const escapedChar = token.char[1];
        let node: RNode;
        switch (escapedChar) {
          case CharacterClass.DIGIT:
          case CharacterClass.ALPHANUMBERIC:
            node = new CharClassNode({ charClass: escapedChar });
            break;
          default:
            node = new CharNode({ char: escapedChar });
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
