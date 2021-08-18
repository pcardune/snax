import { ParseNode } from '../grammar/top-down-parser';
import { LexToken } from '../lexer-gen/lexer-gen';
import { iter, Iter } from '../utils/iter';
import { memoize } from '../utils/utils';

type PestParseNode = ParseNode<LexToken<string>>;

function filterNodes(
  node: PestParseNode,
  predicate: (node: PestParseNode) => boolean
): Iter<PestParseNode> {
  if (predicate(node)) {
    return iter([node]);
  }
  let children = node.children.map((child) => filterNodes(child, predicate));
  return (iter() as Iter<PestParseNode>).chain(...children);
}

abstract class ASTNode {
  protected node: PestParseNode;
  constructor(node: PestParseNode) {
    this.node = node;
  }
}

class Term extends ASTNode {
  get expr(): Expr | null {
    if (this.node.children[0].symbol.key === '(') {
      return new Expr(this.node.children[1]);
    }
    return null;
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
  pretty() {
    return `${this.name} = { ${this.expr.pretty()} }`;
  }
}

export class PestFile extends ASTNode {
  get rules(): Iter<Rule> {
    const nodes = filterNodes(this.node, (n) => n.symbol.key === 'Rule');
    return iter(nodes).map((n) => new Rule(n));
  }
  pretty() {
    return this.rules
      .map((rule) => rule.pretty())
      .toArray()
      .join('\n');
  }
}
