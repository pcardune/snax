import { Grammar } from '../grammar/grammar';
import { ParseNode } from '../grammar/top-down-parser';
import { buildLexer, LexToken } from '../lexer-gen/lexer-gen';
import { PatternLexer } from '../lexer-gen/recognizer';
import { ConstNFA } from '../nfa-to-dfa/nfa';
import { charRange, chars, charSeq } from '../nfa-to-dfa/regex-nfa';
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { iter, Iter } from '../utils/iter';

type PestParseNode = ParseNode<LexToken<string>>;

function filterNodes(
  node: PestParseNode,
  predicate: (node: PestParseNode) => boolean
): Iter<PestParseNode> {
  if (predicate(node)) {
    return iter([node]);
  }
  let children = iter(node.children).map((child) =>
    filterNodes(child, predicate)
  );
  return (iter() as Iter<PestParseNode>).chain(...children);
}

abstract class TreeNode {
  abstract iterChildren(): Iter<TreeNode>;
  iterNodes(): Iter<TreeNode> {
    let root = iter([this as TreeNode]);
    return root.chain(...this.iterChildren().map((c) => c.iterNodes()));
  }
}

abstract class ASTNode extends TreeNode {
  readonly node: PestParseNode;
  constructor(node: PestParseNode) {
    super();
    this.node = node;
  }
}
export type { ASTNode };

class Term extends ASTNode {
  get expr(): Expr | null {
    if (this.node.children[0].symbol.key === '(') {
      return new Expr(this.node.children[1]);
    }
    return null;
  }

  get stringLiteral(): string | null {
    if (this.node.children[0].symbol.key === 'STRING') {
      let lexeme = this.node.children[0].token?.substr;
      if (lexeme) {
        return lexeme.slice(1, lexeme.length - 1);
      }
    }
    return null;
  }

  get ruleName(): string | null {
    if (this.node.children[0].symbol.key === 'ID') {
      return this.node.children[0].token?.substr || null;
    }
    return null;
  }

  iterChildren() {
    if (this.expr) {
      return iter([this.expr]);
    }
    return iter([]);
  }

  pretty(): string {
    if (this.expr) {
      return '(' + this.expr.pretty() + ')';
    }
    return '' + this.node.children[0].token?.substr;
  }
}

class Choice extends ASTNode {
  get terms(): Iter<Term> {
    return filterNodes(this.node, (n) => n.symbol.key === 'Term').map(
      (n) => new Term(n)
    );
  }

  iterChildren() {
    return this.terms;
  }

  pretty() {
    return this.terms
      .map((t) => t.pretty())
      .toArray()
      .join(' | ');
  }
}

class Sequence extends ASTNode {
  get terms(): Iter<UnaryOp> {
    return filterNodes(this.node, (n) => n.symbol.key === 'Unary').map(
      (n) => new UnaryOp(n)
    );
  }
  iterChildren() {
    return this.terms;
  }
  pretty() {
    return this.terms
      .map((t) => t.pretty())
      .toArray()
      .join(' ~ ');
  }
}

class UnaryOp extends ASTNode {
  get term(): Term {
    return new Term(this.node.children[0]);
  }
  get type(): '*' | '+' | '?' | null {
    if (this.node.children.length == 1) {
      return null;
    }
    const key = this.node.children[1].symbol.key;
    switch (key) {
      case '*':
      case '+':
      case '?':
        return key;
    }
    throw new Error(`unregonized unary operator: ${key}`);
  }
  iterChildren() {
    return iter([this.term]);
  }
  pretty() {
    return this.term.pretty() + (this.type || '');
  }
}

class Expr extends ASTNode {
  get child(): Term | Sequence | Choice | UnaryOp {
    if (this.node.children.length == 1) {
      return new UnaryOp(this.node.children[0]);
    }
    switch (this.node.children[1].symbol.key) {
      case '~':
        return new Sequence(this.node);
      case '|':
        return new Choice(this.node);
    }
    throw new Error('unrecognized');
  }
  iterChildren() {
    return iter([this.child]);
  }
  pretty() {
    return this.child.pretty();
  }
}

class Rule extends ASTNode {
  get name() {
    return this.node.children[0].token?.substr;
  }
  get expr() {
    return new Expr(this.node.children[3]);
  }
  iterChildren() {
    return iter([this.expr]);
  }
  pretty() {
    return `${this.name} = { ${this.expr.pretty()} }`;
  }
}

export class PestFile extends ASTNode {
  get rules(): Iter<Rule> {
    const nodes = filterNodes(this.node, (n) => n.symbol.key === 'Rule');
    return iter(nodes).map((n) => new Rule(n));
  }
  iterChildren() {
    return this.rules;
  }
  pretty() {
    return this.rules
      .map((rule) => rule.pretty())
      .toArray()
      .join('\n');
  }

  buildLexer() {
    const prebuilt: { [i: string]: ConstNFA } = {
      ASCII_ALPHANUMERIC: charRange('0', '9')
        .or(charRange('a', 'z'))
        .or(charRange('A', 'Z')),
      NEWLINE: chars('\n'),
    };

    const patterns: OrderedMap<string, ConstNFA> = new OrderedMap();
    for (let node of this.iterNodes()) {
      if (node instanceof Term) {
        if (node.stringLiteral != null) {
          const seq = node.stringLiteral as string;
          patterns.push(seq, charSeq(seq));
        } else if (node.ruleName && prebuilt[node.ruleName]) {
          patterns.set(node.ruleName, prebuilt[node.ruleName]);
        }
      }
    }
    patterns.push('WHITESPACE', chars(' '));
    return buildLexer(patterns, ['WHITESPACE']);
  }
}
