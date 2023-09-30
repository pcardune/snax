import { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import {
  buildParser,
  Parser,
  type SymbolsOf,
} from '../grammar/top-down-parser.js';
import { lexer, parser, Token, Rules } from './dsl.__generated__';
import { RegexParser } from '../regex-compiler/parser.js';
import { charSeq } from '../nfa-to-dfa/regex-nfa.js';
import { PatternLexer } from '../lexer-gen/recognizer.js';
import { err, ok, Result } from 'neverthrow';
import { HashMap } from '../utils/sets.js';
import { flatten } from '../utils/result.js';
import type { ConstNFA } from '../nfa-to-dfa/nfa.js';
import type { GrammarSpec } from '../grammar/grammar.js';
import type { ParseNode } from '../grammar/ParseNode.js';
import type { LexToken } from '../lexer-gen/LexToken.js';
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
    tokenLiteral: ParseNode<Symbol | null, LexToken<unknown>>
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
  root: ParseNode<Symbol | null, LexToken<unknown>>
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

export function isImplicit(enumName: any) {
  return String(enumName).startsWith('IMPLICIT_');
}

export function parseOrThrow(input: string) {
  const tokens = lexer.parse(input);
  const root = parser.parseTokensOrThrow(tokens);
  if (!root) {
    throw new Error('unexpected null root. Are there no tokens?');
  }
  return root;
}

export function parse(input: string) {
  try {
    return ok(parseOrThrow(input));
  } catch (e) {
    return err(e);
  }
}

export function compileLexer(
  root: ParseNode<Symbol | null, LexToken<unknown>>
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
            maybeNFA.value.description = literal.content;
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
  root: ParseNode<Symbol | null, LexToken<unknown>>
): Result<Parser<string, ParseNode<string, LexToken<string>>>, any> {
  let grammarSpec: GrammarSpec = { Root: [] };
  const productionIter = root
    .iterTree()
    .filter((n) => n.rule === Rules.Production);
  const maybeEnumNames = mapLiteralsToNames(root);
  if (maybeEnumNames.isErr()) {
    return err(maybeEnumNames.error);
  }
  const enumNames = maybeEnumNames.value;
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

      let elementNames: string[] = [];
      for (const element of elementIter) {
        let child = element.children[0];
        if (child.token?.token === Token.ID) {
          const name = child.token?.substr as string;
          elementNames.push(name);
        } else {
          const maybeLiteral = Literal.fromNode(child);
          if (maybeLiteral.isOk()) {
            const literal = maybeLiteral.value;
            const enumName = enumNames.findKey(
              (otherLiteral) => literal.hash == otherLiteral.hash
            );
            if (!enumName)
              throw new Error(
                `Could not find literal ${literal.hash} in enums`
              );
            elementNames.push(enumName);
          } else {
            return err(maybeLiteral.error);
          }
        }
      }
      grammarSpec[productionName].push(elementNames);
    }
  }
  const parser = buildParser(grammarSpec);
  return ok(
    parser as unknown as Parser<string, ParseNode<string, LexToken<string>>>
  );
}

export function compileLexerToTypescript(
  parseTree: ParseNode<Symbol | null, LexToken<unknown>>,
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
  parseTree: ParseNode<Symbol | null, LexToken<unknown>>,
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

  out += 'const grammarSpec: GrammarSpec = {\n';

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
