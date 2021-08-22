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
          newP = new Production(ntPrime, [...p.symbols.slice(1), ntPrime]);
        } else {
          newP = new Production(p.rule, [...p.symbols, ntPrime]);
        }
        grammar.removeProduction(p);
        grammar.addProduction(newP);
      }
      if (grammar.productionsFrom(nt).length == 0) {
        grammar.addProduction(new Production(nt, [ntPrime]));
      }
      grammar.addProduction(
        new Production(ntPrime as GrammarSymbol, [EPSILON])
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
            const newAi = new Production(nonTerminals[i], [
              ...Aj.symbols,
              ...Ai.symbols.slice(1),
            ]);
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

/**
 * TODO: this needs to be finished
 * p. 104 of Engineering a Compiler
 */
// export function calcFirst(grammar: Grammar<unknown>) {
//   let hasher = (s: GSymbol) => s.hash();
//   const set = (items?: GSymbol[]) => new HashSet(hasher, items);
//   let first: DefaultHashMap<GSymbol, HashSet<GSymbol>> = new DefaultHashMap(
//     hasher,
//     set
//   );

//   // step 1: add terminals and ϵ and EOF
//   for (const symbol of grammar.getTerminals()) {
//     first.set(symbol, set([symbol as GSymbol]));
//   }
//   first.set(EOF, set([EOF as GSymbol]));
//   first.set(EPSILON, set([EPSILON as GSymbol]));

//   // step 2: initialize non-terminals with empty set
//   for (const symbol of grammar.getNonTerminals()) {
//     first.set(symbol, set());
//   }

//   // step 3:
//   let needsWork = true;
//   while (needsWork) {
//     needsWork = false;
//     for (const A of grammar.productionsIter()) {
//       const B = A.symbols;
//       if (B.length > 0) {
//         let rhs = set([...first.get(B[0]).values()]);
//         rhs.delete(EPSILON);
//         let i = 0;
//         while (first.get(B[i]).has(EPSILON) && i < B.length - 1) {
//           let temp = first.get(B[i + 1]);
//           temp.delete(EPSILON);
//           for (const value of temp) {
//             rhs.add(value);
//           }
//           i++;
//         }
//         if (i == B.length - 1 && first.get(B[B.length - 1]).has(EPSILON)) {
//           rhs.add(EPSILON);
//         }
//         let firstA = first.get(A.nonTerminal);
//         for (const rh of rhs) {
//           firstA.add(rh);
//         }
//       }
//     }
//   }
//   return first;
// }

export class ParseNode<R, T extends LexToken<any>> {
  rule: R | null;
  parent: ParseNode<R, T> | null = null;
  children: ParseNode<R, T>[];
  tryNext: number = 0;
  token?: T;

  variantIndex: number;

  // used for attribute grammar to store arbitrary data
  data?: any;

  constructor(
    rule: R | null,
    variantIndex: number,
    children: ParseNode<R, T>[],
    parent: ParseNode<R, T> | null = null
  ) {
    this.rule = rule;
    this.variantIndex = variantIndex;
    this.children = children;
    this.parent = parent;
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

export class Parser<Symbol> {
  readonly grammar: Grammar<Symbol>;
  readonly start: Symbol;
  constructor(grammar: Grammar<Symbol>, start: Symbol) {
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
    return parse(
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
    return parse(this.grammar, this.start, tokens);
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
    return 'ParseError';
  }
}

export function parse<Symbol>(
  grammar: Grammar<Symbol | typeof EPSILON>,
  start: Symbol,
  tokens: Iterable<LexToken<Symbol>>
): Result<ParseNode<Symbol, LexToken<Symbol>>, ParseError<Symbol>> {
  type Token = LexToken<Symbol>;
  type ParseResult = Result<ParseNode<Symbol, Token>, ParseError<Symbol>>;

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
      log('trying to expand non-terminal node');
      const productions = grammar.productionsFrom(rootSymbol);
      // try each production from current node to find child nodes
      let i = -1;
      for (const rule of productions) {
        i++;
        log(`${i}: trying ${rule.toString()}`);
        const children: ParseNode<Symbol, Token>[] = [];
        let result;
        for (const symbol of rule.symbols) {
          if (symbol === EPSILON) {
            continue;
          }
          result = parseNode(symbol, depth + 1);
          if (result.isOk()) {
            children.push(result.value);
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
          return ok(new ParseNode(rule.rule as Symbol, i, children));
        } else {
          log(
            'failed',
            rule.toString(),
            'Undoing children',
            children.map((c) => c.toString()).join(', ')
          );

          function detach(children: ParseNode<Symbol, Token>[], depth = 0) {
            // detach from right to left
            let child: ParseNode<Symbol, Token> | undefined;
            while ((child = children.pop()) !== undefined) {
              detach(child.children, depth + 1);
              if (child.token) {
                log(''.padStart(depth), 'pushing back', child.token.toString());
                tokenIter.pushBack(child.token);
              }
            }
          }
          detach(children);
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
        const node = new ParseNode(null as Symbol | null, 0, []);
        node.token = next.value;
        log('fulfilled terminal:', node.token.toString());
        return ok(node);
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
  return root;
}

// /**
//  * Parse a string of tokens according to the specified grammar.
//  * Assumes the grammar is not left recursive (otherwise it will infinit loop)
//  */
// export function parseOld<R, T extends LexToken<any>>(
//   grammar: Grammar<R>,
//   start: BaseSymbol<R>,
//   tokens: Iterable<T>
// ) {
//   type Word = T | EOFSymbol;
//   let tokenIter = backtrackable(tokens[Symbol.iterator]());
//   const nextWord = (): Word => {
//     const next = tokenIter.next();
//     if (next.done) {
//       return EOF;
//     }
//     log('Word is now', next.value.toString());
//     return next.value;
//   };

//   const root: ParseNode<R, T> = new ParseNode(null as R | null, 0, start, []);
//   let focus: ParseNode<R, T> | null = root;
//   let stack: ParseNode<R, T>[] = [];
//   let word: Word = nextWord();
//   function isEOF(word: Word): word is EOFSymbol {
//     return word instanceof EOFSymbol;
//   }
//   function log(...args: any[]) {
//     let depth = 0;
//     let n = focus;
//     while (n?.parent) {
//       n = n.parent;
//       depth++;
//     }
//     console.log(''.padStart(depth * 2), ...args);
//   }

//   const backtrack = () => {
//     // log('Backtracking. Current Tree:', root.pretty());
//     log('Backtracking');
//     // backtrack
//     if (focus && focus.parent) {
//       // set focus to it's parent and disconnect children
//       focus = focus.parent;
//       const disconnectChildren = (node: ParseNode<R, T>) => {
//         // disconnect children from left to right
//         for (const child of node.children) {
//           if (typeof child !== 'string') {
//             disconnectChildren(child);
//           }
//         }
//         // now pop children from stack from right to left
//         for (let i = node.children.length - 1; i >= 0; i--) {
//           if (stack[stack.length - 1] === node.children[i]) {
//             stack.pop();
//           } else {
//             break;
//           }
//         }
//         if (node.token) {
//           // push the token back onto tokens
//           tokenIter.pushBack(node.token);
//         }
//       };
//       disconnectChildren(focus);
//       // point to the next thing to try
//       focus.tryNext++;
//     } else {
//       throw new Error('No place to backtrack to.');
//     }
//   };

//   function logChain() {
//     let n = focus;
//     let path = [n];
//     while (n?.parent) {
//       n = n.parent;
//       path = [n, ...path];
//     }
//     log(`CHAIN: ${path.map((p) => p?.symbol.toString()).join(' → ')}`);
//   }

//   while (true) {
//     log('');
//     log(
//       'LOOP',
//       `word=${word.toString()}`,
//       `focus=${focus?.toString()}`,
//       `stack=[${stack.map((s) => s.toString()).join(', ')}]`
//     );
//     logChain();
//     // if focus is non terminal
//     if (focus?.symbol instanceof NonTerminal) {
//       // pick next rule to expand focus (A->B1,B2,...,Bn)
//       const productions = grammar.productionsFrom(focus.symbol.key);
//       const nextRule: Production<R> = productions[focus.tryNext];
//       if (nextRule) {
//         log('Trying', nextRule.toString());
//         // build nodes for B1,B2,...,Bn
//         const nodes = nextRule.symbols.map(
//           (s) =>
//             new ParseNode(null as R | null, focus?.tryNext || 0, s, [], focus)
//         );
//         // focus.children = nodes;
//         // // push(Bn,Bn-1,Bn-2,...,B2)
//         // for (let i = 0; i < nodes.length - 1; i++) {
//         //   log('Pushing', nodes[nodes.length - 1 - i].toString());
//         //   stack.push(nodes[nodes.length - 1 - i]);
//         // }
//         // // focus B1
//         // focus = nodes[0];
//       } else {
//         backtrack();
//       }
//     } else if (!isEOF(word) && focus && focus.symbol.key == word.token) {
//       focus.token = word as T;
//       log('Found terminal', focus.toString());
//       word = nextWord();
//       focus = stack.pop() || null;
//     } else if (focus?.symbol.equals(EPSILON)) {
//       focus = stack.pop() || null;
//     } else if (isEOF(word) && focus == null) {
//       return root;
//     } else {
//       tokenIter.pushBack(word as T);
//       backtrack();
//       word = nextWord();
//     }
//   }
// }
