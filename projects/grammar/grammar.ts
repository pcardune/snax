import { OrderedMap } from '../utils/data-structures/OrderedMap';

export const EPSILON = Symbol('ϵ');

export interface ConstGrammar<Symbol> {
  productionsIter(): Generator<Production<Symbol>>;
  productionsFrom(rule: Symbol): Readonly<Production<Symbol>[]>;
  getNonTerminals(): Readonly<Symbol[]>;
  getTerminals(): Readonly<Set<Symbol>>;
  toString(): string;
}

export class Grammar<R> implements ConstGrammar<R> {
  private productions: OrderedMap<R, Production<R>[]> = new OrderedMap();

  addProduction(production: Production<R>) {
    const key = production.rule;
    if (!this.productions.get(key)) {
      this.productions.set(key, []);
    }
    this.productions.get(key)?.push(production);
  }

  removeProduction(production: Production<R>) {
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

  addProductions(rule: R, derivations: R[][]) {
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
  productionsFrom(rule: R): Readonly<Production<R>[]> {
    return this.productions.get(rule as R) || [];
  }
  getNonTerminals(): Readonly<R[]> {
    return [...this.productions.keys()];
  }
  getTerminals(): Readonly<Set<R>> {
    let terminals: Set<R> = new Set();
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

export class Production<LeftHandSymbol extends { toString(): string }> {
  /**
   * The left hand symbol. So the production:
   *   Expr -> Term Op Term
   * the `rule` would be `Expr`
   */
  readonly rule: LeftHandSymbol;

  /**
   * The right hand side of a production. So for the production:
   *   Expr -> Term Op Term
   * the `symbols` would be `[Term, Op, Term]`
   */
  readonly symbols: Readonly<LeftHandSymbol[]>;

  constructor(rule: LeftHandSymbol, symbols: LeftHandSymbol[]) {
    this.rule = rule;
    this.symbols = symbols;
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

  const grammar: Grammar<GrammarSymbol> = new Grammar();
  const nonTerminals: Set<Symbol> = new Set();
  Object.keys(productions).forEach((key) => {
    nonTerminals.add(key as unknown as Symbol);
  });
  Object.entries(productions).forEach(([key, value]) => {
    for (const specSymbols of value) {
      if (specSymbols.length === 0) {
        // this is an empty rule, put epsilon in it
        grammar.addProduction(
          new Production(key as unknown as GrammarSymbol, [EPSILON])
        );
      } else {
        grammar.addProduction(
          new Production(key as unknown as GrammarSymbol, [...specSymbols])
        );
      }
    }
  });
  return grammar;
}
