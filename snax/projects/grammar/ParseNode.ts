import type { LexToken } from '../lexer-gen/LexToken.js';
import { iter, Iter } from '../utils/iter.js';

export class ParseNode<R, T extends LexToken<any>> {
  rule: R | null;
  parent: ParseNode<R, T> | null = null;
  children: ParseNode<R, T>[];
  tryNext: number = 0;
  token?: T;

  // used for attribute grammar to store arbitrary data
  data?: any;

  constructor(
    rule: R | null,
    children: ParseNode<R, T>[],
    parent: ParseNode<R, T> | null = null
  ) {
    this.rule = rule;
    this.children = children;
    this.parent = parent;
  }

  static forToken<T extends LexToken<any>>(token: T) {
    const node = new ParseNode(null, []);
    node.token = token;
    return node;
  }

  /**
   * Iterator over every node in the parse tree
   */
  iterTree(): Iter<ParseNode<R, T>> {
    return iter([this as ParseNode<R, T>]).chain(
      ...this.children.map((c) => c.iterTree())
    );
  }

  toJSON(): any {
    return {
      children: this.children.map((c) =>
        c instanceof ParseNode ? c.toJSON() : c
      ),
    };
  }

  pretty(indent: string = ''): string {
    let out = '';
    if (indent == '') {
      out += '\n';
    }
    if (this.token) {
      out += `${indent}${this.token.toString()}\n`;
      return out;
    } else {
      out += `${indent}<${this.rule}>\n`;
      const childIndent = indent + '|  ';
      this.children.forEach((child) => {
        out += child.pretty(childIndent);
      });
      out += `${indent}</${this.rule}>\n`;
    }
    return out;
  }

  toString(): string {
    if (this.token) {
      return this.token.toString();
    }
    return `${this.rule}[${this.children
      .map((c) => (c ? c.toString() : 'ERROR'))
      .join(', ')}]`;
  }
}
