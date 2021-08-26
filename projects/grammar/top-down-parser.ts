import { backtrackable, iter, Iter } from '../utils/iter';
import { LexToken } from '../lexer-gen/lexer-gen';
import { HashMap } from '../utils/sets';
import {
  Grammar,
  Production,
  EPSILON,
  GrammarSpec,
  buildGrammar,
} from './grammar';
import * as debug from '../utils/debug';
import { ok, err, Result } from 'neverthrow';

export function removeDirectLeftRecursion<Symbol>(
  grammar: Grammar<Symbol | string | typeof EPSILON>
) {
  type GrammarSymbol = Symbol | string | typeof EPSILON;
  const NTs = grammar.getNonTerminals();
  for (const nt of NTs) {
    if (nt === EPSILON) {
      continue;
    }
    let isLeftRecursive = false;
    for (const p of grammar.productionsFrom(nt)) {
      if (p.isLeftRecursive()) {
        isLeftRecursive = true;
      }
    }
    if (isLeftRecursive) {
      const ntPrime: GrammarSymbol = nt + 'P';
      for (const p of grammar.productionsFrom(nt)) {
        let newP: Production<GrammarSymbol>;
        if (p.isLeftRecursive()) {
          newP = new Production(
            ntPrime,
            [...p.symbols.slice(1), ntPrime],
            p.action
          );
        } else {
          newP = new Production(p.rule, [...p.symbols, ntPrime], p.action);
        }
        grammar.removeProduction(p);
        grammar.addProduction(newP);
      }
      const action = grammar.productionsFrom(nt)[0]?.action;
      if (grammar.productionsFrom(nt).length == 0) {
        grammar.addProduction(new Production(nt, [ntPrime], action));
      }
      grammar.addProduction(
        new Production(ntPrime as GrammarSymbol, [EPSILON], action)
      );
    }
  }
}

/**
 * Removes left recursion from a grammar.
 * See p. 103 of "Engineering a Compiler"
 */
export function removeLeftRecursion<R>(sourceGrammar: Grammar<R>): Grammar<R> {
  let nonTerminals = sourceGrammar.getNonTerminals(); // A
  for (let i = 0; i < nonTerminals.length; i++) {
    for (let j = 0; j < i; j++) {
      // if there exists a production from A[i] => A[j]y
      for (const Ai of sourceGrammar.productionsFrom(nonTerminals[i])) {
        if (Ai.symbols[0] == nonTerminals[j]) {
          // then replace it with the expansions of A[j]
          sourceGrammar.removeProduction(Ai);
          for (const Aj of sourceGrammar.productionsFrom(nonTerminals[j])) {
            const newAi = new Production(
              nonTerminals[i],
              [...Aj.symbols, ...Ai.symbols.slice(1)],
              Ai.action
            );
            sourceGrammar.addProduction(newAi as unknown as Production<R>);
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
    return `${this.rule}[${this.children.map((c) => c.toString()).join(', ')}]`;
  }
}

export class Parser<Symbol, ActionValue = any> {
  readonly grammar: Grammar<Symbol, ActionValue>;
  readonly start: Symbol;
  constructor(grammar: Grammar<Symbol, ActionValue>, start: Symbol) {
    this.grammar = grammar;
    this.start = start;
  }
  parseOrThrow(tokens: string[]) {
    const result = this.parse(tokens);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }
  parse(tokens: string[]) {
    return parseFlow(
      this.grammar,
      this.start,
      tokens.map(
        (t) => new LexToken(t as unknown as Symbol, { from: 0, to: 0 }, t)
      )
    );
  }
  parseTokensOrThrow(tokens: Iterable<LexToken<Symbol>>) {
    const result = this.parseTokens(tokens);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }
  parseTokens(tokens: Iterable<LexToken<Symbol>>) {
    return parseFlow(this.grammar, this.start, tokens);
  }
}
export type SymbolsOf<T> = T extends Parser<infer Symbols> ? Symbols : never;

export function buildParser<Symbol>(grammarSpec: GrammarSpec<Symbol>) {
  const grammar = buildGrammar(grammarSpec);
  removeDirectLeftRecursion(grammar);
  return new Parser(grammar, 'Root' as unknown as Symbol);
}

export enum ParseErrorType {
  EOF = 'Reached end of file',
  UNMATCHED_TERMINAL = 'Unmatched Terminal',
  NO_MORE_RULES = 'failed all rules',
  TOKENS_REMAIN = 'tokens remaining after completing parse',
}

type ParseErrorContext<T> = { tokenIter: Iterable<LexToken<T>> };

class ParseError<T> extends Error {
  context: ParseErrorContext<T>;
  type: ParseErrorType;
  constructor(type: ParseErrorType, context: ParseErrorContext<T>) {
    super();
    this.type = type;
    this.context = context;
  }
  get message() {
    const nextToken = iter(this.context.tokenIter).next();

    return `ParseError: "${this.type}" next token: ${
      nextToken.done ? '<EOF>' : nextToken.value.toString()
    }`;
  }
}

export function parseFlow<Symbol, ActionValue>(
  grammar: Grammar<Symbol | typeof EPSILON, ActionValue>,
  start: Symbol,
  tokens: Iterable<LexToken<Symbol>>
): Result<ActionValue | undefined, ParseError<Symbol>> {
  type Token = LexToken<Symbol>;
  type TokenTree = (Token | TokenTree)[];
  type State = { value: ActionValue | undefined; tokens: TokenTree };
  type ParseResult = Result<State, ParseError<Symbol>>;

  let tokenIter = backtrackable(tokens[Symbol.iterator]());
  const nonTerminals = new Set(grammar.getNonTerminals());

  function parseNode(rootSymbol: Symbol, depth: number): ParseResult {
    const log = (...args: any[]) => {
      let prefix = '';
      for (let i = -1; i < depth; i++) {
        prefix += '  |';
      }
      debug.log(prefix, ...args);
    };
    log(`parseNode(${rootSymbol})`);
    if (nonTerminals.has(rootSymbol)) {
      const productions = grammar.productionsFrom(rootSymbol);
      // try each production from current node to find child nodes
      let i = -1;
      for (const rule of productions) {
        i++;
        log(`${i}: trying ${rule.toString()}`);
        const childStates: State[] = [];
        let result;
        for (const symbol of rule.symbols) {
          if (symbol === EPSILON) {
            continue;
          }
          result = parseNode(symbol, depth + 1);
          if (result.isOk()) {
            childStates.push(result.value);
          } else {
            break;
          }
        }
        if (!result || result.isOk()) {
          log(
            debug.colors.green('✓'),
            'fulfilled non-terminal:',
            rule.toString()
          );
          // we don't need to try any more rules.
          const tokens = childStates.map((state) => state.tokens);

          const actionTokens: Token[] = tokens.map((tree) => {
            if (tree instanceof Array) {
              return tree[0] as Token;
            }
            return tree as Token;
          });
          const state: State = {
            value: rule.action(
              childStates.map((state) => state.value) as ActionValue[],
              actionTokens
            ),
            tokens,
          };
          return ok(state);
        } else {
          log('failed', rule.toString());
          const tokens = childStates
            .map((state) => state.tokens)
            .flat(Infinity)
            .reverse();
          for (const token of tokens) {
            tokenIter.pushBack(token);
          }
          // now we continue on to the next rule
        }
      }
      // none of the rules worked, so return null
      log('failed, all rules');
      return err(new ParseError(ParseErrorType.NO_MORE_RULES, { tokenIter }));
    } else {
      log('trying to expand terminal node');
      // this is a terminal node in the grammar, so try to match
      // it with the next word in the token list
      const next = tokenIter.next();
      if (next.done) {
        // EOF
        log('Reached EOF!');
        return err(new ParseError(ParseErrorType.EOF, { tokenIter }));
      } else if ((next.value.token as any) == rootSymbol) {
        log('fulfilled terminal:', next.value.toString());
        const state: State = { tokens: [next.value], value: undefined };
        return ok(state);
      } else {
        log(
          'could not match terminal:',
          next.value.toString(),
          '!=',
          rootSymbol
        );
        tokenIter.pushBack(next.value);
        return err(
          new ParseError(ParseErrorType.UNMATCHED_TERMINAL, { tokenIter })
        );
      }
    }
  }
  const root = parseNode(start, 0);
  if (!tokenIter.next().done) {
    debug.log('Finished parsing before EOF');
    return err(new ParseError(ParseErrorType.TOKENS_REMAIN, { tokenIter }));
  }
  return root.map((state) => state.value);
}
