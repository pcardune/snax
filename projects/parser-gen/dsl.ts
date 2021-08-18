import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { ParseNode } from '../grammar/top-down-parser';
import { LexToken } from '../lexer-gen/lexer-gen';

import { lexer, parser, Token, Rules } from './dsl.__generated__';
export { lexer, parser, Token, Rules };

function parseNodeToPatterns(root: ParseNode<LexToken<string>>) {
  let patterns = root
    .iterTree()
    .filter((node) => node.symbol.key == Rules.Statement)
    .map((node) => {
      const tokenName = node.children[0].token?.substr;
      const tokenLiteral = node.children[2].children[0];
      let nfa: { kind: 'STRING' | 'REGEX'; content: string };
      const content = tokenLiteral.token?.substr as string;
      switch (tokenLiteral.symbol.key) {
        case 'REGEX':
          nfa = {
            kind: tokenLiteral.symbol.key,
            content: JSON.parse(content.slice(1)),
          };
          break;
        case 'STRING':
          nfa = {
            kind: tokenLiteral.symbol.key,
            content: JSON.parse(content),
          };
          break;
        default:
          throw new Error(`Unrecognized literal ${tokenLiteral.toString()}`);
      }
      return [tokenName, nfa] as [string, typeof nfa];
    });
  return new OrderedMap(patterns);
}

export function compileLexerToTypescript(root: ParseNode<LexToken<string>>) {
  let patterns = parseNodeToPatterns(root);
  let out = '';

  out += `
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { parseRegex } from '../regex-compiler/parser';
import { charSeq } from '../nfa-to-dfa/regex-nfa';
import { ConstNFA } from '../nfa-to-dfa/nfa';

const re = (s: string) => parseRegex(s).nfa();

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
}

export function compileGrammarToTypescript(root: ParseNode<LexToken<string>>) {
  let symbolTable: { [i: string]: 'Token' | 'Rules' } = {};

  let out = `

import { buildParser, ParseNode } from '../grammar/top-down-parser';

export enum Rules {
`;

  root
    .iterTree()
    .filter((n) => n.symbol.key === Rules.Production)
    .forEach((node) => {
      const name = node.children[0].token?.substr as string;
      symbolTable[name] = 'Rules';
      out += `  ${name} = "${name}",\n`;
    });

  out += '}\n\n';

  out += 'export const parser = buildParser({\n';

  root
    .iterTree()
    .filter((n) => n.symbol.key === Rules.Production)
    .forEach((node) => {
      const name = node.children[0].token?.substr;
      out += `  [Rules.${name}]:[\n`;

      node
        .iterTree()
        .filter((n) => n.symbol.key === Rules.Sequence)
        .forEach((sequence) => {
          out += '    [';

          sequence.children[1]
            .iterTree()
            .filter((n) => n.symbol.key === Rules.Element)
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
