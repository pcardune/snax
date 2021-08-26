import { err, ok, Result } from 'neverthrow';
import { LexToken } from '../lexer-gen/lexer-gen';
import {
  BacktrackFreeGrammar,
  Eof,
  EOF,
  EPSILON,
  Epsilon,
  Production,
} from './grammar';

type LL1Table<S, A> = Map<S, Map<S | Eof | Epsilon, null | Production<S, A>>>;
/**
 * Algorithm for construction of LL1 table from backtrack free grammar.
 * See page 113 of Engineering a Compiler 2nd Edition
 */
export function buildLL1Table<S, A>(
  grammar: BacktrackFreeGrammar<S, A>
): LL1Table<S, A> {
  type Cell = null | Production<S, A>;
  const table: LL1Table<S, A> = new Map();

  const setTable = (row: S, col: S | Eof | Epsilon, cell: Cell) => {
    let columns = table.get(row);
    if (!columns) {
      columns = new Map();
    }
    columns.set(col, cell);
    table.set(row, columns);
  };

  const terminals = grammar.getTerminals();
  for (const A of grammar.getNonTerminals()) {
    for (const w of [...terminals, EOF] as (S | Eof)[]) {
      setTable(A, w, null);
    }
    for (const p of grammar.productionsFrom(A)) {
      const firstPlus = grammar.getFirstPlus(p);
      for (const w of firstPlus) {
        if (terminals.has(w as S)) {
          setTable(A, w, p);
        }
      }
      if (firstPlus.has(EOF)) {
        setTable(A, EOF, p);
      }
    }
  }
  return table;
}

export class LL1Parser<S, A> {
  readonly grammar: BacktrackFreeGrammar<S, A>;
  private table: Readonly<LL1Table<S, A>>;
  private start: S;
  constructor(grammar: BacktrackFreeGrammar<S, A>, start: S) {
    this.grammar = grammar;
    this.table = buildLL1Table(this.grammar);
    this.start = start;
  }
  private getTableCell(t: S, nt: S | Eof | Epsilon) {
    return this.table.get(t)?.get(nt) || null;
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
  /**
   * Implements table driven LL(1) skeleton parser as described on
   * page 112 of Engineering a Compiler 2nd Edition.
   * @param tokens
   * @returns
   */
  parseTokens(tokens: Iterable<LexToken<S>>): Result<A | null, any> {
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
    let stack: (S | Eof)[] = [EOF];
    stack.push(this.start);
    let focus = stack[stack.length - 1];
    let root: A | null = null;
    while (true) {
      if (focus === EOF && word.token === EOF) {
        // success
        return ok(root);
      } else if (focus === EOF || terminals.has(focus)) {
        if (focus === word.token) {
          stack.pop();
          word = nextWord();
        } else {
          return err(new Error(`Couldn't find symbol ${String(focus)}`));
        }
      } else {
        // focus is a non-terminal
        let production = this.getTableCell(focus, word.token);
        if (production) {
          const A = production.rule;
          const B = production.symbols;
          stack.pop();
          for (let i = B.length - 1; i >= 0; i--) {
            if (B[i] !== (EPSILON as any)) {
              stack.push(B[i]);
            }
          }
        } else {
          return err(new Error(`Failed to expand ${focus}`));
        }
      }
      focus = stack[stack.length - 1];
    }
  }
}
