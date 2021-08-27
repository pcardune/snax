import { PatternLexer } from '../../dist/lexer-gen/recognizer';
import { isImplicit } from '../../dist/parser-gen/dsl';
import { Terminal } from './GrammarTable';
import { Table, Td, Tr } from './Table';

export function LexerTable({ lexer }: { lexer: PatternLexer<any> }) {
  const rows = lexer.patternDescriptions
    .entries()
    .filter(([i, token, description]) => {
      return !isImplicit(token);
    })
    .map(([i, token, description]) => {
      return (
        <Tr key={i}>
          <Td>
            <Terminal symbol={token} />
          </Td>
          <Td>{description}</Td>
        </Tr>
      );
    })
    .toArray();
  return (
    <Table>
      <tbody>{rows}</tbody>
    </Table>
  );
}
