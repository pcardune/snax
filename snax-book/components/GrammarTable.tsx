import { EOF, EPSILON } from '@pcardune/snax/dist/grammar/grammar';
import styled from 'styled-components';
import { Table, Td } from './Table';
import { PatternLexer } from '@pcardune/snax/dist/lexer-gen/recognizer';
import { isImplicit } from '@pcardune/snax/dist/parser-gen/dsl';
import { GrammarLike, useGrammar } from '../hooks/useGrammar.js';

export const NonTerminal = styled.span`
  font-style: italic;
`;

const Term = styled.span`
  font-family: 'Source Code Pro', Consolas, 'Ubuntu Mono', Menlo,
    'DejaVu Sans Mono', monospace, monospace !important;
  font-size: 0.875em;
`;

export function Terminal({ symbol }: { symbol: any }) {
  if (symbol === EPSILON) {
    symbol = 'ϵ';
  } else if (symbol === EOF) {
    symbol = 'eof';
  }
  return <Term>{String(symbol)}</Term>;
}

export function Symbol({
  symbol,
  nonTerminal,
}: {
  symbol: any;
  nonTerminal: boolean;
}) {
  if (nonTerminal) {
    return <NonTerminal>{symbol}</NonTerminal>;
  }
  return <Terminal symbol={symbol} />;
}

const IndexCell = styled(Td)`
  background-color: #ddd;
  text-align: right;
`;

export function GrammarTable(props: {
  grammar: GrammarLike;
  lexer?: PatternLexer<any>;
}) {
  const grammar = useGrammar(props.grammar);
  const lexer = props.lexer;
  const nonTerminals = grammar.getNonTerminals();
  let i = 0;
  const rows = nonTerminals
    .map((nt) => {
      return grammar.productionsFrom(nt).map((p, j) => {
        const row = (
          <tr key={i} style={{ background: 'none' }}>
            <IndexCell>{i}</IndexCell>
            <Td>{j === 0 && <Symbol symbol={nt} nonTerminal />}</Td>
            <Td style={{ textAlign: 'center' }}>{j === 0 ? '⟶' : '|'}</Td>
            <Td>
              {p.symbols.map((s, j) => {
                if (isImplicit(s) && lexer) {
                  s = lexer.patternDescriptions.get(s);
                }
                return [
                  <Symbol
                    key={j}
                    symbol={s}
                    nonTerminal={nonTerminals.indexOf(s) >= 0}
                  />,
                  ' ',
                ];
              })}
            </Td>
          </tr>
        );
        i += 1;
        return row;
      });
    })
    .flat(-1);
  return (
    <Table>
      <tbody>{rows}</tbody>
    </Table>
  );
}
