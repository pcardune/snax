import { err, ok, Result } from 'neverthrow';
import { LexToken } from '../lexer-gen/LexToken.js';
import {
  BacktrackFreeGrammar,
  Eof,
  EOF,
  EPSILON,
  Epsilon,
  Production,
  SemanticAction,
} from './grammar.js';

type LL1Table<S, A> = Map<S, Map<S | Eof | Epsilon, null | Production<S, A>>>;

class LL1TableImpl<S, A> {
  private table: LL1Table<S, A> = new Map();

  set(
    nonTerminal: S,
    terminal: S | Eof | Epsilon,
    cell: null | Production<S, A>
  ) {
    let columns = this.table.get(nonTerminal);
    if (!columns) {
      columns = new Map();
    }
    columns.set(terminal, cell);
    this.table.set(nonTerminal, columns);
  }

  get(nonTerminal: S, terminal: S | Eof | Epsilon) {
    return this.table.get(nonTerminal)?.get(terminal) || null;
  }

  *entries(): Generator<[S, S | Eof | Epsilon, null | Production<S, A>]> {
    for (const [row, cols] of this.table.entries()) {
      for (const [col, cell] of cols.entries()) {
        yield [row, col, cell] as [
          S,
          S | Eof | Epsilon,
          null | Production<S, A>
        ];
      }
    }
  }
}

/**
 * Algorithm for construction of LL1 table from backtrack free grammar.
 * See page 113 of Engineering a Compiler 2nd Edition
 */
export function buildLL1Table<S, A>(
  grammar: BacktrackFreeGrammar<S, A>
): LL1TableImpl<S, A> {
  const table: LL1TableImpl<S, A> = new LL1TableImpl();

  const terminals = new Set(grammar.getTerminals());
  terminals.delete(EPSILON as any);
  for (const A of grammar.getNonTerminals()) {
    for (const w of [...terminals, EOF] as (S | Eof)[]) {
      table.set(A, w, null);
    }
    for (const p of grammar.productionsFrom(A)) {
      const firstPlus = grammar.getFirstPlus(p);
      for (const w of firstPlus) {
        if (terminals.has(w as S)) {
          table.set(A, w, p);
        }
      }
      if (firstPlus.has(EOF)) {
        table.set(A, EOF, p);
      }
    }
  }
  return table;
}

export class LL1Parser<S, A> {
  readonly grammar: BacktrackFreeGrammar<S, A>;
  private table: Readonly<LL1TableImpl<S, A>>;
  private start: S;
  constructor(grammar: BacktrackFreeGrammar<S, A>, start: S) {
    this.grammar = grammar;
    this.table = buildLL1Table(this.grammar);
    this.start = start;
  }

  parseOrThrow(tokens: string[]) {
    const result = this.parse(tokens);
    if (result.isOk()) {
      return result.value;
    }
    throw result.error;
  }
  parse(tokens: string[]) {
    return this.parseTokens(
      tokens.map((t) => new LexToken(t as unknown as S, { from: 0, to: 0 }, t))
    );
  }
  parseTokensOrThrow(tokens: Iterable<LexToken<S>>): A | null {
    const r = this.parseTokens(tokens);
    if (r.isOk()) {
      return r.value;
    }
    throw r.error;
  }
  /**
   * Implements table driven LL(1) skeleton parser as described on
   * page 112 of Engineering a Compiler 2nd Edition.
   * @param tokens
   * @returns
   */
  parseTokens(tokens: Iterable<LexToken<S>>): Result<A | null, any> {
    const generator = this.parseGen(tokens);
    let state;
    do {
      state = generator.next();
    } while (!state.done);
    return state.value as Result<A | null, any>;
  }

  *parseGen(tokens: Iterable<LexToken<S>>) {
    const tokensIter = tokens[Symbol.iterator]();
    const nextWord = () => {
      const next = tokensIter.next();
      if (!next.done) {
        return next.value;
      }
      return new LexToken(EOF, { from: 0, to: 0 }, '');
    };

    const terminals = this.grammar.getTerminals();
    let word = nextWord();
    type State = S | Eof | StackAction<A>;
    let stack: State[] = [EOF];
    stack.push(this.start);
    let focus = stack[stack.length - 1];
    let collected: (LexToken<S | Eof> | A)[] = [];
    while (true) {
      yield { focus, stack: [...stack], collected: [...collected], word };
      if (focus instanceof StackAction) {
        stack.pop();
        stack.pop();
        const tokens = collected.slice(collected.length - focus.index);
        collected = collected.slice(0, collected.length - focus.index);
        collected.push(focus.call(tokens));
      } else if (focus === EOF && word.token === EOF) {
        // success
        return ok(collected[0] as A) as Result<A | null, any>;
      } else if (focus === EOF || terminals.has(focus)) {
        if (focus === word.token) {
          collected.push(word);
          stack.pop();
          word = nextWord();
        } else {
          return err(new Error(`Couldn't find symbol ${String(focus)}`));
        }
      } else {
        // focus is a non-terminal
        let production = this.table.get(focus, word.token);
        if (production) {
          // push body onto the stack in reverse
          const B = production.body;
          for (let i = B.length - 1; i >= 0; i--) {
            const Bi = B[i];
            if (Bi !== (EPSILON as any)) {
              if (Bi instanceof SemanticAction) {
                stack.push(new StackAction(Bi, i));
              } else {
                stack.push(Bi);
              }
            }
          }
        } else {
          return err(new Error(`Failed to expand ${focus}`)) as Result<
            A | null,
            any
          >;
        }
      }
      focus = stack[stack.length - 1];
    }
  }
}

export class StackAction<A> {
  sa: SemanticAction<A>;
  index: number;
  constructor(sa: SemanticAction<A>, index: number) {
    this.sa = sa;
    this.index = index;
  }

  call(tokens: (LexToken<unknown> | A)[]) {
    const nodes = tokens.map((n) => (n instanceof LexToken ? undefined : n));
    const onlyTokens = tokens.map((t) =>
      t instanceof LexToken ? t : undefined
    );
    const value = this.sa.func(nodes as A[], onlyTokens as LexToken<unknown>[]);
    return value;
  }
}
