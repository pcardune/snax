import { HashSet } from '../utils/sets';
import { colors } from '../utils/debug';
import { ParseNode } from './top-down-parser';
import { LexToken } from '../lexer-gen/lexer-gen';
import { OrderedMap } from '../utils/data-structures/OrderedMap';

export enum SymbolKind {
  TERMINAL,
  NONTERMINAL,
}

export function terminal<K>(key: K): Terminal<K> {
  return new Terminal(key);
}
export function nonTerminal<K>(key: K): NonTerminal<K> {
  return new NonTerminal(key);
}
interface GSymbol<K> {
  readonly key: K;
  hash(): string;
  equals(other: GSymbol<any>): boolean;
  toString(): string;
}
export type BaseSymbol<K> = Terminal<K> | NonTerminal<K>;
export class Terminal<K> implements GSymbol<K> {
  readonly key: K;
  constructor(key: K) {
    this.key = key;
  }
  hash(): string {
    return '' + this.key;
  }
  equals(other: GSymbol<any>): boolean {
    return other instanceof Terminal && this.key === other.key;
  }
  toString(): string {
    return colors.underline(colors.green(`'${this.key}'`));
  }
}

export class NonTerminal<K> implements GSymbol<K> {
  readonly key: K;
  constructor(key: K) {
    this.key = key;
  }
  hash(): string {
    return '' + this.key;
  }
  equals(other: GSymbol<any>): boolean {
    return other instanceof NonTerminal && this.key === other.key;
  }
  toString() {
    return colors.red('' + this.key);
  }
}

class EpsilonSymbol extends Terminal<'ϵ'> {
  constructor() {
    super('ϵ');
  }
  toString() {
    return this.key;
  }
}
export class EOFSymbol extends Terminal<'ⓔⓞⓕ'> {
  static readonly singleton: EOFSymbol = new EOFSymbol();
  private constructor() {
    super('ⓔⓞⓕ');
  }
  toString() {
    return this.key;
  }
}
export const EOF = EOFSymbol.singleton;
export const EPSILON = new EpsilonSymbol();

export interface ConstGrammar<R> {
  productionsIter(): Generator<Production<R>>;
  productionsFrom(rule: R | GSymbol<R>): Readonly<Production<R>[]>;
  getNonTerminals(): Readonly<NonTerminal<R>[]>;
  getTerminals(): Readonly<Set<Terminal<R>>>;
  toString(): string;
}

export class Grammar<R> implements ConstGrammar<R> {
  private productions: OrderedMap<R, Production<R>[]> = new OrderedMap();

  addProduction(production: Production<R>) {
    const key = production.nonTerminal.key;
    if (!this.productions.get(key)) {
      this.productions.set(key, []);
    }
    this.productions.get(key)?.push(production);
  }

  removeProduction(production: Production<R>) {
    const key = production.nonTerminal.key;
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

  addProductions(
    rule: R,
    nonTerminal: NonTerminal<R>,
    derivations: GSymbol<R>[][]
  ) {
    for (const derivation of derivations) {
      this.addProduction(new Production(rule, nonTerminal, derivation));
    }
  }
  *productionsIter() {
    for (const key of this.productions.keys()) {
      for (const production of this.productions.get(key) || []) {
        yield production;
      }
    }
  }
  productionsFrom(rule: R | GSymbol<R>): Readonly<Production<R>[]> {
    if (rule instanceof NonTerminal || rule instanceof Terminal) {
      rule = rule.key;
    }
    return this.productions.get(rule as R) || [];
  }
  getNonTerminals(): Readonly<NonTerminal<R>[]> {
    let nonTerminals: NonTerminal<R>[] = [];
    for (const value of this.productions.values()) {
      nonTerminals.push(value[0].nonTerminal);
    }
    return nonTerminals;
  }
  getTerminals(): Readonly<Set<Terminal<R>>> {
    let terminals: HashSet<Terminal<R>> = new HashSet((t) => t.hash());
    for (const value of this.productions.values()) {
      for (const p of value) {
        for (const s of p.symbols) {
          if (s instanceof Terminal) {
            terminals.add(s);
          }
        }
      }
    }
    return terminals;
  }
  toString() {
    let out = '\n';
    for (const productions of this.productions.values()) {
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
  readonly nonTerminal: NonTerminal<R>;
  readonly symbols: Readonly<GSymbol<R>[]>;
  action?: (node: ParseNode<R, LexToken<unknown>>) => void;
  constructor(rule: R, nonTerminal: NonTerminal<R>, symbols: GSymbol<R>[]) {
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

export type GrammarSpec<R> = { Root: R[][]; [index: string]: R[][] };
export function buildGrammar<R>(productions: GrammarSpec<R>) {
  type Rule = R;
  const grammar: Grammar<Rule | typeof EPSILON.key> = new Grammar();
  const nonTerminals: Map<Rule, NonTerminal<Rule>> = new Map();
  const terminals: Map<Rule, Terminal<Rule>> = new Map();
  Object.keys(productions).forEach((key) => {
    nonTerminals.set(key as unknown as R, nonTerminal(key as unknown as R));
  });
  Object.entries(productions).forEach(([key, value]) => {
    const nonTerminal = nonTerminals.get(
      key as unknown as R
    ) as NonTerminal<Rule>;
    for (const symbolsKeys of value) {
      const symbols: (BaseSymbol<R> | typeof EPSILON)[] = symbolsKeys.map(
        (s) => {
          let result = nonTerminals.get(s) || terminals.get(s);
          if (!result) {
            result = terminal(s);
            terminals.set(s, result);
          }
          return result;
        }
      );
      if (symbols.length === 0) {
        // this is an empty rule, put epsilon in it
        symbols.push(EPSILON);
      }
      grammar.addProduction(
        new Production(
          key as unknown as R | typeof EPSILON.key,
          nonTerminal,
          symbols
        )
      );
    }
  });
  return grammar;
}
