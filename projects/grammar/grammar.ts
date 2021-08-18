import { HashSet } from '../utils/sets';
import { colors } from '../utils/debug';

export enum SymbolKind {
  TERMINAL,
  NONTERMINAL,
}
export type NonTerminal = GSymbol<SymbolKind.NONTERMINAL>;
export type Terminal = GSymbol<SymbolKind.TERMINAL>;

export function terminal(key: string): Terminal {
  return new GSymbol(SymbolKind.TERMINAL, key);
}
export function nonTerminal(key: string): NonTerminal {
  return new GSymbol(SymbolKind.NONTERMINAL, key);
}

export class GSymbol<T extends SymbolKind = SymbolKind> {
  readonly kind: T;
  readonly key: string;
  constructor(kind: T, key: string) {
    this.kind = kind;
    this.key = key;
  }
  isTerminal() {
    return this.kind == SymbolKind.TERMINAL;
  }
  equals(other: GSymbol<SymbolKind>) {
    return this.kind == other.kind && this.key == other.key;
  }
  hash() {
    return this.key;
  }
  toString() {
    if (this.isTerminal()) {
      return colors.underline(colors.green(`'${this.key}'`));
    }
    return colors.red(this.key);
  }
  [Symbol.toStringTag]() {
    return `GSymbol(${this.toString()})`;
  }
}

class EpsilonSymbol extends GSymbol<SymbolKind.TERMINAL> {
  constructor() {
    super(SymbolKind.TERMINAL, 'ϵ');
  }
  toString() {
    return this.key;
  }
}
export class EOFSymbol extends GSymbol<SymbolKind.TERMINAL> {
  static readonly singleton: EOFSymbol = new EOFSymbol();
  private constructor() {
    super(SymbolKind.TERMINAL, 'ⓔⓞⓕ');
  }
  toString() {
    return this.key;
  }
}
export const EOF = EOFSymbol.singleton;
export const EPSILON = new EpsilonSymbol();

export class Grammar<R> {
  private productions: { [index: string]: Production<R>[] } = {};

  addProduction(production: Production<R>) {
    const key = production.nonTerminal.key;
    if (!this.productions[key]) {
      this.productions[key] = [];
    }
    this.productions[key].push(production);
  }

  removeProduction(production: Production<R>) {
    const key = production.nonTerminal.key;
    if (this.productions[key]) {
      this.productions[key] = this.productions[key].filter(
        (p) => !p.equals(production)
      );
      if (this.productions[key].length == 0) {
        delete this.productions[key];
      }
    }
  }

  addProductions(rule: R, nonTerminal: NonTerminal, derivations: GSymbol[][]) {
    for (const derivation of derivations) {
      this.addProduction(new Production(rule, nonTerminal, derivation));
    }
  }
  *productionsIter() {
    for (const key in this.productions) {
      for (const production of this.productions[key]) {
        yield production;
      }
    }
  }
  productionsFrom(nonTerminal: NonTerminal): Readonly<Production<R>[]> {
    return this.productions[nonTerminal.key] || [];
  }
  getNonTerminals(): Readonly<NonTerminal[]> {
    let nonTerminals: NonTerminal[] = [];
    for (const key in this.productions) {
      nonTerminals.push(this.productions[key][0].nonTerminal);
    }
    return nonTerminals;
  }
  getTerminals(): Readonly<Set<Terminal>> {
    let terminals: HashSet<Terminal> = new HashSet((t) => t.hash());
    for (const key in this.productions) {
      for (const p of this.productions[key]) {
        for (const s of p.symbols) {
          if (s.isTerminal()) {
            terminals.add(s as Terminal);
          }
        }
      }
    }
    return terminals;
  }
  toString() {
    let out = '\n';
    for (const key in this.productions) {
      const productions = this.productions[key];
      out += `${productions[0].nonTerminal.key} →\n`;
      for (const production of productions) {
        out += '  | ';
        out += production.symbols.map((s) => s.toString()).join(' ');
        out += '\n';
      }
    }
    return out;
  }
}

export class Production<R> {
  readonly rule: R;
  readonly nonTerminal: NonTerminal;
  readonly symbols: Readonly<GSymbol[]>;
  constructor(rule: R, nonTerminal: NonTerminal, symbols: GSymbol[]) {
    this.rule = rule;
    this.nonTerminal = nonTerminal;
    this.symbols = symbols;
  }

  isLeftRecursive(): boolean {
    return this.symbols[0].equals(this.nonTerminal);
  }

  equals(other: Production<R>): boolean {
    if (!this.nonTerminal.equals(other.nonTerminal)) {
      return false;
    }
    if (this.symbols.length != other.symbols.length) {
      return false;
    }
    for (let i = 0; i < this.symbols.length; i++) {
      if (!this.symbols[i].equals(other.symbols[i])) {
        return false;
      }
    }
    return true;
  }

  toString(): string {
    return `${this.nonTerminal.toString()} -> ${this.symbols
      .map((s) => s.toString())
      .join(' ')}`;
  }
}

export type GrammarSpec = { Root: string[][]; [index: string]: string[][] };
export function buildGrammar<R extends GrammarSpec>(productions: R) {
  const grammar: Grammar<keyof R> = new Grammar();
  const nonTerminals: { [i: string]: NonTerminal } = {};
  const terminals: { [i: string]: Terminal } = {};
  Object.keys(productions).forEach((key) => {
    nonTerminals[key] = nonTerminal(key);
  });
  Object.entries(productions).forEach(([key, value]) => {
    const nonTerminal = nonTerminals[key];
    for (const symbolsKeys of value) {
      const symbols = symbolsKeys.map((s) => {
        if (nonTerminals[s]) {
          return nonTerminals[s];
        } else if (terminals[s]) {
          return terminals[s];
        } else {
          terminals[s] = terminal(s);
          return terminals[s];
        }
      });
      if (symbols.length === 0) {
        // this is an empty rule, put epsilon in it
        symbols.push(EPSILON);
      }
      grammar.addProduction(new Production(key, nonTerminal, symbols));
    }
  });
  return grammar;
}
