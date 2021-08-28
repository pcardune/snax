import { LexToken } from '../lexer-gen/lexer-gen';
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { ParseNode } from './top-down-parser';

export const EPSILON = Symbol('ϵ');
export const EOF = Symbol('EOF');
export type Epsilon = typeof EPSILON;
export type Eof = typeof EOF;

export interface ConstGrammar<Symbol, ActionValue = any> {
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
    symbols: (Symbol | SemanticAction<ActionValue>)[],
    action?: ActionFunction<ActionValue>
  ) {
    if (action) {
      symbols.push(new SemanticAction(action));
    }
    const production: Production<Symbol, ActionValue> = new Production(
      rule,
      symbols
    );
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

class SemanticAction<ActionValue> {
  func: ActionFunction<ActionValue>;
  constructor(func: ActionFunction<ActionValue>) {
    this.func = func;
  }
}

export class Production<Symbol, ActionValue = void> {
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
  readonly body: Readonly<(Symbol | SemanticAction<ActionValue>)[]>;

  constructor(
    rule: Symbol,
    symbols: (Symbol | SemanticAction<ActionValue>)[],
    action?: ActionFunction<ActionValue>
  ) {
    if (action) {
      symbols.push(new SemanticAction(action));
    }
    this.rule = rule;
    this.body = symbols;
  }

  get symbols(): Symbol[] {
    return this.body.filter((s) => !(s instanceof SemanticAction)) as Symbol[];
  }

  /**
   * @deprecated
   */
  get action(): ActionFunction<ActionValue> {
    const action = this.body.find((s) => s instanceof SemanticAction) as
      | SemanticAction<ActionValue>
      | undefined;
    if (action) {
      return action.func;
    }
    return () => {
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
    return `${this.rule} -> ${this.symbols.map((s) => String(s)).join(' ')}`;
  }
}
export type ParseNodeGrammar = Grammar<
  string | typeof EPSILON,
  ParseNode<string | typeof EPSILON | null, LexToken<any>>
>;
export type GrammarSpec = { [index: string]: string[][] };
export function buildGrammar(productions: GrammarSpec) {
  type GrammarSymbol = string | typeof EPSILON;

  const grammar: ParseNodeGrammar = new Grammar();
  const nonTerminals: Set<Symbol> = new Set();
  Object.keys(productions).forEach((key) => {
    nonTerminals.add(key as unknown as Symbol);
  });
  Object.entries(productions).forEach(([key, value]) => {
    const symbol = key;
    for (const specSymbols of value) {
      if (specSymbols.length === 0) {
        // this is an empty rule, put epsilon in it
        grammar.createProduction(symbol, [
          EPSILON,
          new SemanticAction(
            (children, tokens) => new ParseNode(symbol, children)
          ),
        ]);
      } else {
        grammar.createProduction(symbol, [
          ...specSymbols,
          new SemanticAction((children, tokens) => {
            let spliced: ParseNode<GrammarSymbol | null, LexToken<any>>[] = [];
            for (let [i, child] of children.entries()) {
              if (child) {
                spliced.push(child);
              } else {
                spliced.push(ParseNode.forToken(tokens[i]));
              }
            }
            return new ParseNode(symbol, spliced);
          }),
        ]);
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

type FirstSet<S> = ReadonlySet<S | Eof | Epsilon>;
type FirstMap<S> = Map<S | Eof | Epsilon, FirstSet<S>>;
/**
 * Algorithm to calculate the set of terminal symbols
 * that can appear as the first word in some string of symbols.
 * @returns a map from symbols in the given grammar to their "first" sets
 *
 * See Page 104 of Engineering a Compiler 2nd Edition
 */
export function calcFirst<S>(grammar: ConstGrammar<S>): FirstMap<S> {
  const firstMap: FirstMap<S> = new Map();

  let done = false;
  const setFirst = (k: S, newFirst: FirstSet<S>) => {
    const existingFirst = getFirst(k);
    firstMap.set(k, newFirst);
    if (!setsAreEqual(existingFirst, newFirst)) {
      done = false;
    }
  };
  const getFirst = (k: S) => {
    if (!firstMap.has(k)) {
      firstMap.set(k, new Set());
    }
    return firstMap.get(k) as FirstSet<S>;
  };

  for (const terminal of grammar.getTerminals()) {
    firstMap.set(terminal, new Set([terminal]));
    firstMap.set(EPSILON, new Set([EPSILON]));
    firstMap.set(EOF, new Set([EOF]));
  }

  while (!done) {
    done = true;
    for (const production of grammar.productionsIter()) {
      const B = production.symbols;
      const b1 = B[0];
      let rhs: Set<S | Eof | Epsilon> = new Set([...getFirst(b1)]);
      rhs.delete(EPSILON);
      let i = 0;
      let k = production.symbols.length - 1;
      while (getFirst(B[i]).has(EPSILON) && i <= k - 1) {
        for (const s of getFirst(B[i + 1])) {
          rhs.add(s);
        }
        rhs.delete(EPSILON);
        i++;
      }
      if (i == k && getFirst(B[k]).has(EPSILON)) {
        rhs.add(EPSILON);
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
export function calcFollow<S>(
  grammar: ConstGrammar<S>,
  firstMap: FirstMap<S>,
  start: S
): FirstMap<S> {
  const getFirst = (k: S) => firstMap.get(k) as FirstSet<S>;

  const followMap: FirstMap<S> = new Map();
  const nonTerminals = new Set(grammar.getNonTerminals());
  for (const nonTerminal of nonTerminals) {
    followMap.set(nonTerminal, new Set());
  }
  followMap.set(start, new Set([EOF]));
  let done = false;
  const setFollow = (k: S, newFollow: FirstSet<S>) => {
    const existingFirst = getFollow(k);
    followMap.set(k, newFollow);
    if (!setsAreEqual(existingFirst, newFollow)) {
      done = false;
    }
  };
  const getFollow = (k: S) => {
    return followMap.get(k) as FirstSet<S>;
  };

  while (!done) {
    done = true;
    for (const production of grammar.productionsIter()) {
      let B = production.symbols;
      let k = B.length - 1;
      let trailer: Set<S | Eof | Epsilon> = new Set(getFollow(production.rule));
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

function intersection<S>(a: ReadonlySet<S>, b: ReadonlySet<S>): Set<S> {
  const result: Set<S> = new Set();
  for (const i of a) {
    if (b.has(i)) {
      result.add(i);
    }
  }
  return result;
}

export function isBacktrackFree<S>(grammar: ConstGrammar<S>, start: S) {
  try {
    new BacktrackFreeGrammar(grammar, start);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Tests whether a given array has a given prefix
 *
 * @param string array to test
 * @param prefix prefix of the array
 * @returns whether or not prefix is a prefix of string
 */
export function startsWith<S>(
  string: readonly S[],
  prefix: readonly S[]
): boolean {
  if (string.length < prefix.length) {
    return false;
  }
  for (let i of prefix.keys()) {
    if (string[i] != prefix[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Given a list of strings, find the longest prefix that matches
 * more than one of those strings.
 *
 * @param strings
 * @returns
 */
export function findLongestPrefix<S>(strings: readonly (readonly S[])[]): S[] {
  if (strings.length <= 1) {
    return [];
  }
  let longestPrefix: S[] = [];
  for (const [i, si] of strings.entries()) {
    if (si.length === 0) {
      continue;
    }
    for (let j = si.length; j > 0; j--) {
      let prefix = si.slice(0, j);
      let matches = strings.filter((m) => startsWith(m, prefix));
      if (matches.length > 1 && prefix.length > longestPrefix.length) {
        longestPrefix = prefix;
      }
    }
  }
  return longestPrefix;
}

/**
 * Left factoring algorithm for grammars to make them backtrack free
 * Described on Page 108 of Engineering a Compiler 2nd Edition.
 */
export function leftFactor<S, A>(
  grammar: Grammar<S, A>
): Grammar<S | string, A> {
  const newGrammar: Grammar<S | string, A> = new Grammar();

  const nonTerminals = grammar.getNonTerminals();

  let newSymbolCount = 0;
  function createSymbol(): string {
    return `__left_factor_${newSymbolCount++}`;
  }

  for (const A of nonTerminals) {
    const productions = grammar.productionsFrom(A);
    if (productions.length == 1) {
      // no need to left factor productions with one right-hand-side
      newGrammar.addProduction(productions[0]);
      continue;
    }

    const prefix = findLongestPrefix(productions.map((p) => p.symbols));
    if (prefix.length == 0) {
      for (const p of productions) {
        newGrammar.addProduction(p);
      }
    } else {
      // now we need to create a new production.
      const newRule = createSymbol();
      newGrammar.addProduction(new Production(A, [...prefix, newRule]));
      for (const p of productions) {
        if (startsWith(p.symbols, prefix)) {
          const suffix: (S | string)[] = p.symbols.slice(prefix.length);
          newGrammar.addProduction(new Production(newRule, suffix));
        } else {
          newGrammar.addProduction(p);
        }
      }
    }
  }
  return newGrammar;
}

/**
 * A wrapper around Grammar that provides additional information
 * unique to backtrack free grammars.
 */
export class BacktrackFreeGrammar<S, A> implements ConstGrammar<S, A> {
  private readonly grammar: ConstGrammar<S, A>;
  private readonly firstMap: FirstMap<S>;
  private readonly followMap: FirstMap<S>;
  constructor(grammar: ConstGrammar<S, A>, start: S) {
    this.grammar = grammar;
    this.firstMap = calcFirst(this.grammar);
    this.followMap = calcFollow(this.grammar, this.firstMap, start);
    if (!this.isValid()) {
      throw new Error('Grammar is not backtrack free...');
    }
  }

  productionsIter(): Generator<Production<S, A>, any, unknown> {
    return this.grammar.productionsIter();
  }

  productionsFrom(rule: S): readonly Production<S, A>[] {
    return this.grammar.productionsFrom(rule);
  }

  getNonTerminals(): readonly S[] {
    return this.grammar.getNonTerminals();
  }

  getTerminals(): Readonly<Set<S>> {
    return this.grammar.getTerminals();
  }

  toString(): string {
    return this.grammar.toString();
  }

  getFirst(B: S | Readonly<S[]>): FirstSet<S> {
    if (!(B instanceof Array)) {
      return this.firstMap.get(B) as FirstSet<S>;
    }
    let first: Set<S | Epsilon | Eof> = new Set();
    for (let i = 0; i < B.length; i++) {
      const Bi = B[i];
      const firstBi = this.firstMap.get(Bi) as FirstSet<S>;
      first = new Set([...first, ...firstBi]);
      if (!firstBi.has(EPSILON)) {
        break;
      }
    }
    return first;
  }

  getFirstPlus(production: Production<S, A>): FirstSet<S> {
    const A = production.rule;
    const B = production.symbols;
    const firstB = this.getFirst(B);
    if (firstB.has(EPSILON)) {
      const followA = this.followMap.get(A) as FirstSet<S>;
      return new Set([...firstB, ...followA]);
    } else {
      return firstB;
    }
  }

  /**
   * Detect whether or not a grammar is backtrack free, according
   * to the definition on Page 107 of Engineering a Compiler 2nd Edition
   *
   * @param grammar a Grammar
   */
  isValid() {
    for (const A of this.getNonTerminals()) {
      const B = this.productionsFrom(A);
      for (let i = 0; i < B.length; i++) {
        const firstPlusBi = this.getFirstPlus(B[i]);
        for (let j = 0; j < B.length; j++) {
          if (i !== j) {
            const firstPlusBj = this.getFirstPlus(B[j]);
            if (intersection(firstPlusBi, firstPlusBj).size > 0) {
              // not backtrack free
              return false;
            }
          }
        }
      }
    }
    return true;
  }
}
