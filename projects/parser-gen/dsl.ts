import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { buildParser, ParseNode, SymbolsOf } from '../grammar/top-down-parser';
import { LexToken } from '../lexer-gen/lexer-gen';

import { lexer, parser, Token, Rules } from './dsl.__generated__';
import { RegexParser } from '../regex-compiler/parser';
import { charSeq } from '../nfa-to-dfa/regex-nfa';
import { PatternLexer } from '../lexer-gen/recognizer';
import { err, ok, Result } from 'neverthrow';
import { HashMap } from '../utils/sets';
import { flatten } from '../utils/result';
import { ConstNFA } from '../nfa-to-dfa/nfa';
import { GrammarSpec } from '../grammar/grammar';
export { lexer, parser, Token };

export type Symbol = SymbolsOf<typeof parser>;

class Literal {
  kind: Token.STRING | Token.REGEX;
  content: string;
  private constructor(kind: Token.STRING | Token.REGEX, content: string) {
    this.kind = kind;
    this.content = content;
  }
  get hash() {
    return `${this.kind}:${this.content}`;
  }
  static fromNode(
    tokenLiteral: ParseNode<Symbol, LexToken<unknown>>
  ): Result<Literal, any> {
    if (tokenLiteral.rule !== Rules.Literal) {
      throw new Error(
        'fromNode() called with something other than a literal: ' +
          tokenLiteral.rule?.toString()
      );
    }
    tokenLiteral = tokenLiteral.children[0];
    const content = tokenLiteral.token?.substr as string;

    const parseJSON = Result.fromThrowable(
      JSON.parse,
      (e) => `Failed parsing to JSON: ${content}`
    );

    switch (tokenLiteral.token?.token) {
      case Token.REGEX:
        return parseJSON(content.slice(1)).map(
          (content) => new Literal(Token.REGEX, content)
        );
      case Token.STRING:
        return parseJSON(content).map(
          (content) => new Literal(Token.STRING, content)
        );
    }
    return err(new Error(`Unrecognized literal ${tokenLiteral.toString()}`));
  }
}

const enumValueForLiteral = (literal: Literal) => '$<' + literal.content + '>';

function mapLiteralsToNames(
  root: ParseNode<Symbol, LexToken<unknown>>
): Result<OrderedMap<string, Literal>, any> {
  let tokenLiterals: HashMap<Literal, string> = new HashMap(
    (literal) => literal.hash
  );
  let patterns: OrderedMap<string, Literal> = new OrderedMap();
  for (const node of root
    .iterTree()
    .filter((node) => node.rule == Rules.Statement)) {
    const enumName = node.children[0].token?.substr as string;
    const maybeLiteral = Literal.fromNode(node.children[2]);
    if (maybeLiteral.isErr()) {
      return err(maybeLiteral.error);
    }
    const literal = maybeLiteral.value;
    tokenLiterals.set(literal, enumName);
    patterns.push(enumName, literal);
  }

  for (const node of root
    .iterTree()
    .filter((node) => node.rule == Rules.Literal)) {
    const maybeLiteral = Literal.fromNode(node);
    if (maybeLiteral.isErr()) {
      return err(maybeLiteral.error);
    }
    if (!tokenLiterals.get(maybeLiteral.value)) {
      const literal = maybeLiteral.value;
      const enumValue = enumValueForLiteral(literal);
      const enumName = 'IMPLICIT_' + patterns.length;
      tokenLiterals.set(literal, enumValue);
      patterns.push(enumName, literal);
    }
  }

  return ok(patterns);
}

export function compileLexer(
  root: ParseNode<Symbol, LexToken<unknown>>
): Result<PatternLexer<string>, any> {
  return flatten(
    mapLiteralsToNames(root).map((names) => {
      const patterns: OrderedMap<string, { nfa: ConstNFA; ignore: boolean }> =
        new OrderedMap();
      for (const [i, key, literal] of names.entries()) {
        let nfa: ConstNFA;
        if (literal.kind === Token.REGEX) {
          const maybeNFA = RegexParser.parseResult(literal.content).map((n) =>
            n.nfa()
          );
          if (maybeNFA.isErr()) {
            return err(maybeNFA.error);
          } else {
            nfa = maybeNFA.value;
          }
        } else {
          nfa = charSeq(literal.content);
        }
        const ignore = key.startsWith('_');
        patterns.push(key, { nfa, ignore });
      }

      return ok(new PatternLexer(patterns));
    })
  );
}

export function compileGrammarToParser(
  root: ParseNode<Symbol, LexToken<unknown>>
) {
  let grammarSpec: GrammarSpec<Symbol> = { Root: [] };
  const productionIter = root
    .iterTree()
    .filter((n) => n.rule === Rules.Production);

  for (const node of productionIter) {
    const productionName = node.children[0].token?.substr as string;
    grammarSpec[productionName] = [];

    const sequenceIter = node
      .iterTree()
      .filter((n) => n.rule === Rules.Sequence);

    for (const sequence of sequenceIter) {
      const elementIter = sequence.children[1]
        .iterTree()
        .filter((n) => n.rule === Rules.Element);

      let elementNames: Symbol[] = [];
      for (const element of elementIter) {
        let child = element.children[0];

        if (child.rule === Token.ID) {
          const name = child.token?.substr as string;
          elementNames.push(name as unknown as Symbol);
        } else {
          const maybeLiteral = Literal.fromNode(child);
          if (maybeLiteral.isOk()) {
            elementNames.push(
              enumValueForLiteral(maybeLiteral.value) as unknown as Symbol
            );
          } else {
            return err(maybeLiteral.error);
          }
        }
      }
      grammarSpec[productionName].push(elementNames);
    }
  }

  return ok(buildParser(grammarSpec));
}

export function compileLexerToTypescript(
  parseTree: ParseNode<Symbol, LexToken<unknown>>,
  importRoot: string
): Result<string, any> {
  return mapLiteralsToNames(parseTree).map((patterns) => {
    let out = '';

    out += `
import { OrderedMap } from '${importRoot}/utils/data-structures/OrderedMap';
import { RegexParser } from '${importRoot}/regex-compiler/parser';
import { charSeq } from '${importRoot}/nfa-to-dfa/regex-nfa';
import { ConstNFA } from '${importRoot}/nfa-to-dfa/nfa';

const re = (s: string) => RegexParser.parseOrThrow(s).nfa();

`;

    out += `export enum Token {\n`;
    for (const [index, name, literal] of patterns.entries()) {
      out += `  ${name}=${JSON.stringify(literal.content)},\n`;
    }
    // patterns.keys().forEach((name) => {
    //   out += `  ${name}=${JSON.stringify(name)},\n`;
    // });
    out += '}\n\n';

    out +=
      'const patterns: OrderedMap<Token, {nfa:ConstNFA, ignore:boolean}> = new OrderedMap([\n';
    patterns.entries().forEach(([i, name, nfa]) => {
      out += `  [Token.${name}, `;

      let nfaStr: string;
      if (nfa.kind === 'STRING') {
        nfaStr = 'charSeq(' + JSON.stringify(nfa.content) + ')';
      } else {
        nfaStr = 're(' + JSON.stringify(nfa.content) + ')';
      }
      out += `{nfa: ${nfaStr}, ignore: ${name.startsWith('_')}}`;
      out += '],\n';
    });
    out += '])\n';

    out += `
import { PatternLexer } from '${importRoot}/lexer-gen/recognizer';
export const lexer = new PatternLexer(patterns);
`;

    return out;
  });
}

export function compileGrammarToTypescript(
  parseTree: ParseNode<Symbol, LexToken<unknown>>,
  importRoot: string
): Result<string, any> {
  const maybeEnumNames = mapLiteralsToNames(parseTree);
  if (maybeEnumNames.isErr()) {
    return err(maybeEnumNames.error);
  }
  const enumNames = maybeEnumNames.value;
  let symbolTable: { [i: string]: 'Token' | 'Rules' } = {};

  let out = `

import { buildParser, ParseNode } from '${importRoot}/grammar/top-down-parser';
import { GrammarSpec } from '${importRoot}/grammar/grammar';
export enum Rules {
`;

  parseTree
    .iterTree()
    .filter((n) => n.rule === Rules.Production)
    .forEach((node) => {
      const name = node.children[0].token?.substr as string;
      symbolTable[name] = 'Rules';
      out += `  ${name} = "${name}",\n`;
    });

  out += '}\n\n';

  out += 'const grammarSpec: GrammarSpec<Rules|Token> = {\n';

  parseTree
    .iterTree()
    .filter((n) => n.rule === Rules.Production)
    .forEach((node) => {
      const name = node.children[0].token?.substr;
      out += `  [Rules.${name}]:[\n`;

      node
        .iterTree()
        .filter((n) => n.rule === Rules.Sequence)
        .forEach((sequence) => {
          out += '    [';

          sequence.children[1]
            .iterTree()
            .filter((n) => n.rule === Rules.Element)
            .forEach((element) => {
              let child = element.children[0];
              if (child.token?.token === Token.ID) {
                const name = child.token?.substr as string;
                if (symbolTable[name] === 'Rules') {
                  out += `Rules.${name}, `;
                } else {
                  out += `Token.${name}, `;
                }
              } else if (child.rule === Rules.Literal) {
                const maybeLiteral = Literal.fromNode(child);
                if (maybeLiteral.isOk()) {
                  const literal = maybeLiteral.value;
                  for (const [
                    i,
                    enumName,
                    otherLiteral,
                  ] of enumNames.entries()) {
                    if (literal.hash == otherLiteral.hash) {
                      out += `Token.${enumName}, `;
                    }
                  }
                }
              } else {
                throw new Error(
                  'Unrecognized child of Element: ' + child.rule?.toString()
                );
              }
            });

          out += '],\n';
        });

      out += `  ],\n`;
    });

  out += '};\n';

  out += 'export const parser = buildParser(grammarSpec);';

  return ok(out);
}
