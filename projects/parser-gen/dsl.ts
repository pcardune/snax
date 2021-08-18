import { OrderedMap } from '../utils/data-structures/OrderedMap';
import { buildParser, ParseNode } from '../grammar/top-down-parser';
import { LexToken } from '../lexer-gen/lexer-gen';

// // The original code for the lexer
import { buildLexer } from '../lexer-gen';
import { parseRegex } from '../regex-compiler/parser';
import { chars, charSeq, notChars } from '../nfa-to-dfa/regex-nfa';
import { ConstNFA } from '../nfa-to-dfa/nfa';
const re = (s: string) => parseRegex(s).nfa();
const string = chars('"')
  .concat(charSeq('\\"').or(notChars('"')).star())
  .concat(chars('"'));
const oldLexer = buildLexer(
  // prettier-ignore
  new OrderedMap([
    ['ID', re('[a-zA-Z_]([a-zA-Z0-9_]*)')],
    ['EQUALS', charSeq('=')],
    ['_COMMENT', re("//([^\n]*)")],
    ['STRING', re("\"(((\\\")|[^\"\n])*)\"")],
    ['REGEX', re("r\"(((\\\")|[^\"\n])*)\"")],
    ['_WS', re('( |\t)')],
    ['_NEWLINE', chars('\n')],
  ]),
  ['_WS', '_NEWLINE', '_COMMENT']
);
// export { oldLexer as lexer };
export { lexer } from './dsl.__generated__';

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
    ['ID', 'EQUALS', Rules.Literal],
  ],
  [Rules.Literal]: [
    ['REGEX'],
    ['STRING'],
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
