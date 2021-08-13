import { HashMap, HashSet } from '../sets';
import {
  Grammar,
  nonTerminal,
  Production,
  EPSILON,
  GSymbol,
  EOF,
  SymbolKind,
  NonTerminal,
  GrammarSpec,
  buildGrammar,
} from './grammar';

export function removeDirectLeftRecursion(grammar: Grammar) {
  const NTs = grammar.getNonTerminals();
  for (const nt of NTs) {
    let isLeftRecursive = false;
    for (const p of grammar.productionsFrom(nt)) {
      if (p.isLeftRecursive()) {
        isLeftRecursive = true;
      }
    }
    if (isLeftRecursive) {
      const ntPrime = nonTerminal(nt.key + 'P');
      for (const p of grammar.productionsFrom(nt)) {
        let newP: Production;
        if (p.isLeftRecursive()) {
          newP = new Production(ntPrime, [...p.symbols.slice(1), ntPrime]);
        } else {
          newP = new Production(p.nonTerminal, [...p.symbols, ntPrime]);
        }
        grammar.removeProduction(p);
        grammar.addProduction(newP);
      }
      if (grammar.productionsFrom(nt).length == 0) {
        grammar.addProduction(new Production(nt, [ntPrime]));
      }
      grammar.addProduction(new Production(ntPrime, [EPSILON]));
    }
  }
}

/**
 * Removes left recursion from a grammar.
 * See p. 103 of "Engineering a Compiler"
 */
export function removeLeftRecursion(sourceGrammar: Grammar): Grammar {
  let A = sourceGrammar.getNonTerminals(); // A
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < i; j++) {
      // if there exists a production from A[i] => A[j]y
      for (const Ai of sourceGrammar.productionsFrom(A[i])) {
        if (Ai.symbols[0].key == A[j].key) {
          // then replace it with the expansions of A[j]
          sourceGrammar.removeProduction(Ai);
          for (const Aj of sourceGrammar.productionsFrom(A[j])) {
            const newAi = new Production(A[i], [
              ...Aj.symbols,
              ...Ai.symbols.slice(1),
            ]);
            sourceGrammar.addProduction(newAi);
            // console.log('replacing', Ai.toString(), 'with', newAi.toString());
          }
        }
      }
    }
    removeDirectLeftRecursion(sourceGrammar);
  }
  return sourceGrammar;
}

class DefaultHashMap<K, V> extends HashMap<K, V> {
  private getDefault: () => V;
  constructor(hasher: (k: K) => string, getDefault: () => V) {
    super(hasher);
    this.getDefault = getDefault;
  }
  override get(key: K): V {
    const value = super.get(key);
    if (value != undefined) {
      return value;
    }
    return this.getDefault();
  }
}

/**
 * TODO: this needs to be finished
 * p. 104 of Engineering a Compiler
 */
export function calcFirst(grammar: Grammar) {
  let hasher = (s: GSymbol) => s.hash();
  const set = (items?: GSymbol[]) => new HashSet(hasher, items);
  let first: DefaultHashMap<GSymbol, HashSet<GSymbol>> = new DefaultHashMap(
    hasher,
    set
  );

  // step 1: add terminals and ϵ and EOF
  for (const symbol of grammar.getTerminals()) {
    first.set(symbol, set([symbol as GSymbol]));
  }
  first.set(EOF, set([EOF as GSymbol]));
  first.set(EPSILON, set([EPSILON as GSymbol]));

  // step 2: initialize non-terminals with empty set
  for (const symbol of grammar.getNonTerminals()) {
    first.set(symbol, set());
  }

  // step 3:
  let needsWork = true;
  while (needsWork) {
    needsWork = false;
    for (const A of grammar.productionsIter()) {
      const B = A.symbols;
      if (B.length > 0) {
        let rhs = set([...first.get(B[0]).values()]);
        rhs.delete(EPSILON);
        let i = 0;
        while (first.get(B[i]).has(EPSILON) && i < B.length - 1) {
          let temp = first.get(B[i + 1]);
          temp.delete(EPSILON);
          for (const value of temp) {
            rhs.add(value);
          }
          i++;
        }
        if (i == B.length - 1 && first.get(B[B.length - 1]).has(EPSILON)) {
          rhs.add(EPSILON);
        }
        let firstA = first.get(A.nonTerminal);
        for (const rh of rhs) {
          firstA.add(rh);
        }
      }
    }
  }
  return first;
}
export class ParseNode {
  symbol: GSymbol;
  parent: ParseNode | null = null;
  children: (ParseNode | string)[];
  tryNext: number = 0;

  constructor(
    symbol: GSymbol,
    children: (ParseNode | string)[],
    parent: ParseNode | null = null
  ) {
    this.symbol = symbol;
    this.children = children;
    this.parent = parent;
  }

  toJSON(): any {
    return {
      symbol: this.symbol.key,
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
    out += indent + '|-' + this.symbol.toString() + '\n';
    const childIndent = indent + '|  ';
    if (!this.symbol.isTerminal()) {
      this.children.forEach((child) => {
        if (typeof child == 'string') {
          out += childIndent + child + '\n';
        } else {
          out += child.pretty(childIndent);
        }
      });
    }
    return out;
  }

  toString(): string {
    if (this.symbol.isTerminal()) {
      return this.symbol.toString();
    }
    return `${this.symbol.toString()}[${this.children
      .map((c) => c.toString())
      .join(', ')}]`;
  }
}

export class Parser {
  grammar: Grammar;
  start: GSymbol<SymbolKind>;
  constructor(grammar: Grammar, start: GSymbol) {
    this.grammar = grammar;
    this.start = start;
  }
  parse(tokens: string[]) {
    return parse(this.grammar, this.start, tokens);
  }
}

export function buildParser(grammarSpec: GrammarSpec) {
  const grammar = buildGrammar(grammarSpec);
  removeDirectLeftRecursion(grammar);
  return new Parser(grammar, nonTerminal('Root'));
}

/**
 * Parse a string of tokens according to the specified grammar.
 * Assumes the grammar is not left recursive (otherwise it will infinit loop)
 */
export function parse(grammar: Grammar, start: GSymbol, tokens: string[]) {
  let wi = 0;
  const nextWord = () => {
    if (wi < tokens.length) {
      return tokens[wi++];
    }
    return EOF.key;
  };

  const root = new ParseNode(start, []);
  let focus: ParseNode | null = root;
  let stack: ParseNode[] = [];
  let word = nextWord();

  const backtrack = () => {
    // backtrack
    if (focus && focus.parent) {
      // set focus to it's parent and disconnect children
      focus = focus.parent;
      const disconnectChildren = (node: ParseNode) => {
        let numToPop = node.children.length - 1;
        while (node.children.length > 0) {
          const child = node.children[0];
          if (typeof child == 'string') {
            // console.log('Disconnecting leaf', child);
          } else {
            disconnectChildren(child);
            node.children = node.children.slice(1);
          }
        }
        while (numToPop > 0) {
          stack.pop();
          numToPop--;
        }
      };
      disconnectChildren(focus);
      // point to the next thing to try
      focus.tryNext++;
    } else {
      throw new Error('No place to backtrack to');
    }
  };

  while (true) {
    // if focus is non terminal
    if (focus?.symbol.kind == SymbolKind.NONTERMINAL) {
      // pick next rule to expand focus (A->B1,B2,...,Bn)
      const productions = grammar.productionsFrom(focus.symbol as NonTerminal);
      const nextRule: Production = productions[focus.tryNext];
      if (nextRule) {
        // build nodes for B1,B2,...,Bn
        const nodes = nextRule.symbols.map((s) => new ParseNode(s, [], focus));
        focus.children = nodes;
        // push(Bn,Bn-1,Bn-2,...,B2)
        for (let i = 0; i < nodes.length - 1; i++) {
          stack.push(nodes[nodes.length - 1 - i]);
        }
        // focus B1
        focus = nodes[0];
      } else {
        backtrack();
      }
    } else if (focus?.symbol.key == word) {
      word = nextWord();
      focus = stack.pop() || null;
    } else if (focus?.symbol.equals(EPSILON)) {
      focus = stack.pop() || null;
    } else if (word == EOF.key && focus == null) {
      return root;
    } else {
      backtrack();
    }
  }
}
