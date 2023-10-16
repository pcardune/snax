import { useMemo } from 'react';
import {
  BacktrackFreeGrammar,
  buildGrammar,
  EOF,
  EPSILON,
  GrammarSpec,
} from '@pcardune/snax/dist/grammar/grammar';
import { buildLL1Table } from '@pcardune/snax/dist/grammar/LL1-parser';
import { NonTerminal, Terminal } from './GrammarTable.js';
import { Table, TBody, THead, Tr, Td, Th } from './Table.js';

export function LL1TableUI(props: { grammarSpec: GrammarSpec; start: string }) {
  const { table, grammar } = useMemo(() => {
    const grammar = new BacktrackFreeGrammar(
      buildGrammar(props.grammarSpec),
      props.start
    );
    return { table: buildLL1Table(grammar), grammar };
  }, [props.grammarSpec, props.start]);

  const terminals = [EOF, ...grammar.getTerminals()].filter(
    (s) => s !== EPSILON
  );
  const nonTerminals = grammar.getNonTerminals();

  const productions = [...grammar.productionsIter()];
  const getCell = (nt: any, t: any) => {
    const production = table.get(nt, t);
    if (!production) {
      return <>&mdash;</>;
    } else {
      return '' + productions.indexOf(production);
    }
  };
  return (
    <Table>
      <THead>
        <Tr>
          <Th></Th>
          {terminals.map((t) => (
            <Th key={String(t)}>
              <Terminal symbol={t} />
            </Th>
          ))}
        </Tr>
      </THead>
      <TBody>
        {nonTerminals.map((nt) => (
          <Tr key={String(nt)}>
            <Td>
              <NonTerminal>{String(nt)}</NonTerminal>
            </Td>
            {terminals.map((t) => (
              <Td style={{ textAlign: 'center' }} key={String(t)}>
                {getCell(nt, t)}
              </Td>
            ))}
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
