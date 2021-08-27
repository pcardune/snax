import { ConstGrammar, EOF, EPSILON } from '../../grammar/grammar';
import styled from 'styled-components';
import { Table, Td } from './Table';
import { PatternLexer } from '../../lexer-gen/recognizer';
import { isImplicit } from '../../parser-gen/dsl';

const NonTerm = styled.span`
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
    return <NonTerm>{symbol}</NonTerm>;
  }
  return <Terminal symbol={symbol} />;
}

const IndexCell = styled(Td)`
  background-color: #ddd;
  text-align: right;
`;

export function GrammarTable({
  grammar,
  lexer,
}: {
  grammar: ConstGrammar<any>;
  lexer?: PatternLexer<any>;
}) {
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
    .flat();
  return (
    <Table>
      <tbody>{rows}</tbody>
    </Table>
  );
}
