import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { ParseNode } from '../grammar/top-down-parser';
import { LexToken } from '../lexer-gen/lexer-gen';

import { lexer, parser, Token, Rules } from './dsl.__generated__';
import { RegexParser } from '../regex-compiler/parser';
import { charSeq } from '../nfa-to-dfa/regex-nfa';
import { PatternLexer } from '../lexer-gen/recognizer';
import { err, ok, Result } from 'neverthrow';
import { HashMap } from '../utils/sets';
import { flatten } from '../utils/result';
import { ConstNFA } from '../nfa-to-dfa/nfa';
export { lexer, parser, Token, Rules };

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
    tokenLiteral: ParseNode<Rules, LexToken<string>>
  ): Result<Literal, any> {
    if (tokenLiteral.rule !== Rules.Literal) {
      return err('not a literal');
    }
    tokenLiteral = tokenLiteral.children[0];
    const content = tokenLiteral.token?.substr as string;

    const parseJSON = Result.fromThrowable(
      JSON.parse,
      (e) => `Failed parsing to JSON: ${content}`
    );

    switch (tokenLiteral.symbol.key) {
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

function mapLiteralsToNames(
  root: ParseNode<Rules, LexToken<string>>
): Result<OrderedMap<string, Literal>, any> {
  let tokenLiterals: HashMap<Literal, string> = new HashMap(
    (literal) => literal.hash
  );
  let patterns: OrderedMap<string, Literal> = new OrderedMap();
  for (const node of root
    .iterTree()
    .filter((node) => node.rule == Rules.Statement)) {
    const tokenName = node.children[0].token?.substr as string;
    const literal = Literal.fromNode(node.children[2]);
    if (literal.isErr()) {
      return err(literal.error);
    }
    tokenLiterals.set(literal.value, tokenName);
    patterns.push(tokenName, literal.value);
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
      const tokenName = '$<' + literal.content + '>';
      tokenLiterals.set(literal, tokenName);
      patterns.push(tokenName, literal);
    }
  }

  return ok(patterns);
}

export function compileLexer(
  root: ParseNode<Rules, LexToken<string>>
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

export function compileLexerToTypescript(
  root: ParseNode<Rules, LexToken<string>>
): Result<string, any> {
  return mapLiteralsToNames(root).map((patterns) => {
    let out = '';

    out += `
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { RegexParser } from '../regex-compiler/parser';
import { charSeq } from '../nfa-to-dfa/regex-nfa';
import { ConstNFA } from '../nfa-to-dfa/nfa';

const re = (s: string) => RegexParser.parseOrThrow(s).nfa();

`;

    out += `export enum Token {\n`;
    patterns.keys().forEach((name) => {
      out += `  ${name}=${JSON.stringify(name)},\n`;
    });
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
import { PatternLexer } from '../lexer-gen/recognizer';
export const lexer = new PatternLexer(patterns);
`;

    return out;
  });
}

export function compileGrammarToTypescript(
  root: ParseNode<Rules, LexToken<string>>
) {
  let symbolTable: { [i: string]: 'Token' | 'Rules' } = {};

  let out = `

import { buildParser, ParseNode } from '../grammar/top-down-parser';

export enum Rules {
`;

  root
    .iterTree()
    .filter((n) => n.rule === Rules.Production)
    .forEach((node) => {
      const name = node.children[0].token?.substr as string;
      symbolTable[name] = 'Rules';
      out += `  ${name} = "${name}",\n`;
    });

  out += '}\n\n';

  out += 'export const parser = buildParser({\n';

  root
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
              if (child.symbol.key === Token.ID) {
                const name = child.token?.substr as string;
                if (symbolTable[name] === 'Rules') {
                  out += `Rules.${name}, `;
                } else {
                  out += `Token.${name}, `;
                }
              }
            });

          out += '],\n';
        });

      out += `  ],\n`;
    });

  out += '});';

  return out;
}
