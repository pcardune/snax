import { buildLexer } from '../lexer-gen';
import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { parseRegex } from '../regex-compiler/parser';
import { buildParser, ParseNode } from '../grammar/top-down-parser';
import { chars, charSeq, notChars } from '../nfa-to-dfa/regex-nfa';
import { LexToken } from '../lexer-gen/lexer-gen';
import { ConstNFA } from '../nfa-to-dfa/nfa';

const re = (s: string) => parseRegex(s).nfa();

const string = chars('"')
  .concat(charSeq('\\"').or(notChars('"')).star())
  .concat(chars('"'));

export const lexer = buildLexer(
  // prettier-ignore
  new OrderedMap([
    ['ID', re('[a-zA-Z_]([a-zA-Z0-9_]*)')],
    ['=', chars('=')],
    ['COMMENT', chars('/').concat(chars('/')).concat(notChars('\n').star())],
    ['STRING', string.clone()],
    ['REGEX', chars('r').concat(string)],
    ['WS', re('( |\t)')],
    ['NEWLINE', chars('\n')],
  ]),
  ['WS', 'NEWLINE', 'COMMENT']
);

enum Rules {
  Root = 'Root',
  Statements = 'Statements',
  Statement = 'Statement',
  Literal = 'Literal',
}

// prettier-ignore
export const parser = buildParser({
  [Rules.Root]: [
    [Rules.Statements]
  ],
  [Rules.Statements]: [
    [Rules.Statement, Rules.Statements],
    [Rules.Statement],
    []
  ],
  [Rules.Statement]: [
    ['ID', '=', Rules.Literal],
  ],
  [Rules.Literal]: [
    ['STRING'],
    ['REGEX'],
  ]
});

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
    out += '  ' + name + ',\n';
  });
  out += '}\n\n';

  out += 'const patterns: OrderedMap<Token, ConstNFA> = new OrderedMap([\n';
  patterns.entries().forEach(([i, name, nfa]) => {
    out += `  [Token.${name}, `;
    if (nfa.kind === 'STRING') {
      out += 'charSeq(' + JSON.stringify(nfa.content) + ')';
    } else {
      out += 're(' + JSON.stringify(nfa.content) + ')';
    }
    out += '],\n';
  });
  out += '])\n';

  out += `
import { buildLexer } from '../lexer-gen';
export const lexer = buildLexer(patterns);
`;

  return out;
}
