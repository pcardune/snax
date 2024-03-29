import { backtrackable, iter } from '../utils/iter.js';
import { HashMap } from '../utils/sets.js';
import {
  Grammar,
  Production,
  EPSILON,
  type GrammarSpec,
  buildGrammar,
  type ConstGrammar,
} from './grammar.js';
import * as debug from '../utils/debug.js';
import { ok, err, Result } from 'neverthrow';
import { LexToken } from '../lexer-gen/LexToken.js';

export function removeDirectLeftRecursion<S>(
  grammar: Grammar<S | string | typeof EPSILON>
) {
  type GrammarSymbol = S | string | typeof EPSILON;
  const newGrammar: Grammar<GrammarSymbol> = new Grammar();
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
      let newPrimes: Production<GrammarSymbol>[] = [];
      let newPs: Production<GrammarSymbol>[] = [];
      const action = grammar.productionsFrom(nt)[0]?.action;
      for (const p of grammar.productionsFrom(nt)) {
        if (p.isLeftRecursive()) {
          newPrimes.push(
            new Production(ntPrime, [...p.symbols.slice(1), ntPrime], p.action)
          );
        } else {
          newPs.push(new Production(p.rule, [...p.symbols, ntPrime], p.action));
        }
        grammar.removeProduction(p);
      }
      for (const newP of newPs) {
        newGrammar.addProduction(newP);
      }
      if (newPs.length == 0) {
        newGrammar.addProduction(new Production(nt, [ntPrime], action));
      }
      for (const newPrime of newPrimes) {
        newGrammar.addProduction(newPrime);
      }
      newGrammar.addProduction(
        new Production(ntPrime as GrammarSymbol, [EPSILON], action)
      );
    } else {
      for (const p of grammar.productionsFrom(nt)) {
        newGrammar.addProduction(p);
      }
    }
  }
  return newGrammar;
}

/**
 * Removes left recursion from a grammar.
 * See p. 103 of "Engineering a Compiler"
 */
export function removeLeftRecursion<R>(
  sourceGrammar: Grammar<R | string | typeof EPSILON>
): Grammar<R | string | typeof EPSILON> {
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
    sourceGrammar = removeDirectLeftRecursion(sourceGrammar);
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

export class Parser<Symbol, ActionValue = any> {
  readonly grammar: ConstGrammar<Symbol, ActionValue>;
  readonly start: Symbol;
  constructor(grammar: ConstGrammar<Symbol, ActionValue>, start: Symbol) {
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

export function buildParser(grammarSpec: GrammarSpec) {
  const grammar = buildGrammar(grammarSpec);
  return new Parser(removeDirectLeftRecursion(grammar), 'Root');
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
  grammar: ConstGrammar<Symbol | typeof EPSILON, ActionValue>,
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
          // This nonsense with any is due to this bug in typescript: https://github.com/microsoft/TypeScript/issues/44408
          let tokens = (childStates as any).map((state: any) => state.tokens);
          tokens = (tokens as any).flat(-1) as unknown as Token[];
          tokens.reverse();
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
