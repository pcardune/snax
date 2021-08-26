import { LexToken } from '../lexer-gen/lexer-gen';
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { ParseNode } from './top-down-parser';

export const EPSILON = Symbol('ϵ');

export interface ConstGrammar<Symbol, ActionValue = void> {
  productionsIter(): Generator<Production<Symbol, ActionValue>>;
  productionsFrom(rule: Symbol): Readonly<Production<Symbol, ActionValue>[]>;
  getNonTerminals(): Readonly<Symbol[]>;
  getTerminals(): Readonly<Set<Symbol>>;
  toString(): string;
}

export type ActionFunction<ActionValue> = (
  childValues: ActionValue[],
  tokens: LexToken<unknown>[]
) => ActionValue;

// TODO: make specific generic type for terminal
// and non terminal symbols
export class Grammar<Symbol, ActionValue = any>
  implements ConstGrammar<Symbol, ActionValue>
{
  private productions: OrderedMap<Symbol, Production<Symbol, ActionValue>[]> =
    new OrderedMap();

  createProduction(
    rule: Symbol,
    symbols: Symbol[],
    action?: ActionFunction<ActionValue>
  ) {
    const production = new Production(rule, symbols, action);
    this.addProduction(production);
    return production;
  }
  addProduction(production: Production<Symbol, ActionValue>) {
    const key = production.rule;
    if (!this.productions.get(key)) {
      this.productions.set(key, []);
    }
    this.productions.get(key)?.push(production);
  }

  removeProduction(production: Production<Symbol>) {
    const key = production.rule;
    const prods = this.productions.get(key);
    if (prods) {
      this.productions.set(
        key,
        prods.filter((p) => !p.equals(production))
      );
      if (this.productions.get(key)?.length == 0) {
        this.productions.delete(key);
      }
    }
  }

  addProductions(rule: Symbol, derivations: Symbol[][]) {
    for (const derivation of derivations) {
      this.addProduction(new Production(rule, derivation));
    }
  }
  *productionsIter() {
    for (const key of this.productions.keys()) {
      for (const production of this.productions.get(key) || []) {
        yield production;
      }
    }
  }
  productionsFrom(rule: Symbol): Readonly<Production<Symbol, ActionValue>[]> {
    return this.productions.get(rule as Symbol) || [];
  }
  getNonTerminals(): Readonly<Symbol[]> {
    return [...this.productions.keys()];
  }
  getTerminals(): Readonly<Set<Symbol>> {
    let terminals: Set<Symbol> = new Set();
    for (const value of this.productions.values()) {
      for (const p of value) {
        for (const s of p.symbols) {
          if (!this.productions.get(s)) {
            terminals.add(s);
          }
        }
      }
    }
    return terminals;
  }
  toString() {
    let out = '\n';
    let terminals = this.getTerminals();
    for (const productions of this.productions.values()) {
      out += `${productions[0].rule} →\n`;
      for (const production of productions) {
        out += '  | ';
        out += production.symbols
          .map((s) => {
            if ((s as any) === EPSILON) {
              return 'ϵ';
            }
            return terminals.has(s) ? `'${s}'` : s;
          })
          .join(' ');
        out += '\n';
      }
    }
    return out;
  }
}

export class Production<
  Symbol extends { toString(): string },
  ActionValue = void
> {
  /**
   * The left hand symbol. So the production:
   *   Expr -> Term Op Term
   * the `rule` would be `Expr`
   */
  readonly rule: Symbol;

  /**
   * The right hand side of a production. So for the production:
   *   Expr -> Term Op Term
   * the `symbols` would be `[Term, Op, Term]`
   */
  readonly symbols: Readonly<Symbol[]>;

  readonly action: ActionFunction<ActionValue>;

  constructor(
    rule: Symbol,
    symbols: Symbol[],
    action?: ActionFunction<ActionValue>
  ) {
    this.rule = rule;
    this.symbols = symbols;
    this.action = action
      ? action
      : () => {
          throw new Error('No action for production ' + this.toString());
        };
  }

  isLeftRecursive(): boolean {
    return (this.symbols[0] as any) === this.rule;
  }

  equals(other: Production<any>): boolean {
    if (this.rule != other.rule) {
      return false;
    }
    if (this.symbols.length != other.symbols.length) {
      return false;
    }
    for (let i = 0; i < this.symbols.length; i++) {
      if (!this.symbols[i] === other.symbols[i]) {
        return false;
      }
    }
    return true;
  }

  toString(): string {
    return `${this.rule} -> ${this.symbols.map((s) => s.toString()).join(' ')}`;
  }
}

export type GrammarSpec<R> = { Root: R[][]; [index: string]: R[][] };
export function buildGrammar<Symbol>(productions: GrammarSpec<Symbol>) {
  type GrammarSymbol = Symbol | typeof EPSILON;

  const grammar: Grammar<
    GrammarSymbol,
    ParseNode<GrammarSymbol | null, LexToken<any>>
  > = new Grammar();
  const nonTerminals: Set<Symbol> = new Set();
  Object.keys(productions).forEach((key) => {
    nonTerminals.add(key as unknown as Symbol);
  });
  Object.entries(productions).forEach(([key, value]) => {
    const symbol = key as unknown as GrammarSymbol;
    for (const specSymbols of value) {
      if (specSymbols.length === 0) {
        // this is an empty rule, put epsilon in it
        grammar.createProduction(
          symbol,
          [EPSILON],
          () => new ParseNode(symbol, [])
        );
      } else {
        grammar.createProduction(
          symbol,
          [...specSymbols],
          (children, tokens) => {
            let spliced: ParseNode<GrammarSymbol | null, LexToken<any>>[] = [];
            for (let [i, child] of children.entries()) {
              if (child) {
                spliced.push(child);
              } else {
                spliced.push(ParseNode.forToken(tokens[i]));
              }
            }
            return new ParseNode(symbol, spliced);
          }
        );
      }
    }
  });
  return grammar;
}

function setsAreEqual(s1: ReadonlySet<any>, s2: ReadonlySet<any>) {
  if (s1.size !== s2.size) {
    return false;
  }
  for (const s of s1) {
    if (!s2.has(s)) {
      return false;
    }
  }
  return true;
}

/**
 * Algorithm to calculate the set of terminal symbols
 * that can appear as the first word in some string of symbols.
 * @returns a map from symbols in the given grammar to their "first" sets
 *
 * See Page 104 of Engineering a Compiler 2nd Edition
 */
export function calcFirst<Symbol>(
  grammar: Grammar<Symbol>
): Map<Symbol, ReadonlySet<Symbol>> {
  const firstMap: Map<Symbol, ReadonlySet<Symbol>> = new Map();

  let done = false;
  const setFirst = (k: Symbol, newFirst: ReadonlySet<Symbol>) => {
    const existingFirst = getFirst(k);
    firstMap.set(k, newFirst);
    if (!setsAreEqual(existingFirst, newFirst)) {
      done = false;
    }
  };
  const getFirst = (k: Symbol) => {
    if (!firstMap.has(k)) {
      firstMap.set(k, new Set());
    }
    return firstMap.get(k) as ReadonlySet<Symbol>;
  };

  for (const terminal of grammar.getTerminals()) {
    firstMap.set(terminal, new Set([terminal]));
  }

  while (!done) {
    done = true;
    for (const production of grammar.productionsIter()) {
      const B = production.symbols;
      const b1 = B[0];
      let rhs = new Set([...getFirst(b1)]);
      rhs.delete(EPSILON as any);
      let i = 0;
      let k = production.symbols.length - 1;
      while (getFirst(B[i]).has(EPSILON as any) && i <= k - 1) {
        for (const s of getFirst(B[i + 1])) {
          rhs.add(s);
        }
        rhs.delete(EPSILON as any);
        i++;
      }
      if (i == k && getFirst(B[k]).has(EPSILON as any)) {
        rhs.add(EPSILON as any);
      }
      const A = production.rule;
      const fA = new Set([...getFirst(A), ...rhs]);
      setFirst(A, fA);
    }
  }
  return firstMap;
}

/**
 * Calculate follow sets as described on page 106 of
 * Engineering a Compiler 2nd Edition
 *
 * @param grammar a grammar
 * @param firstMap the first sets calculated with {@link calcFirst}
 * @returns a mapping from non terminal symbols in the given grammar
 * to their follow sets
 */
export function calcFollow<Symbol>(
  grammar: Grammar<Symbol>,
  firstMap: ReadonlyMap<Symbol, ReadonlySet<Symbol>>
): Map<Symbol, ReadonlySet<Symbol>> {
  const getFirst = (k: Symbol) => firstMap.get(k) as ReadonlySet<Symbol>;

  const followMap: Map<Symbol, ReadonlySet<Symbol>> = new Map();
  const nonTerminals = new Set(grammar.getNonTerminals());
  for (const nonTerminal of nonTerminals) {
    followMap.set(nonTerminal, new Set());
  }
  let done = false;
  const setFollow = (k: Symbol, newFollow: ReadonlySet<Symbol>) => {
    const existingFirst = getFollow(k);
    followMap.set(k, newFollow);
    if (!setsAreEqual(existingFirst, newFollow)) {
      done = false;
    }
  };
  const getFollow = (k: Symbol) => {
    return followMap.get(k) as ReadonlySet<Symbol>;
  };

  while (!done) {
    done = true;
    for (const production of grammar.productionsIter()) {
      let B = production.symbols;
      let k = B.length - 1;
      let trailer = new Set(getFollow(production.rule));
      for (let i = k; i >= 0; i--) {
        if (nonTerminals.has(B[i])) {
          setFollow(B[i], new Set([...getFollow(B[i]), ...trailer]));
          const firstBi = getFirst(B[i]);
          if (firstBi.has(EPSILON as any)) {
            trailer = new Set([...trailer, ...firstBi]);
            trailer.delete(EPSILON as any);
          } else {
            trailer = new Set(firstBi);
          }
        } else {
          trailer = new Set(getFirst(B[i]));
        }
      }
    }
  }
  return followMap;
}
