import { BacktrackFreeGrammar } from '../../dist/grammar/grammar';
import { LL1Parser } from '../../dist/grammar/LL1-parser';
import { GrammarLike, useGrammar } from '../hooks/useGrammar';

export function LL1ParserUI(props: { grammar: GrammarLike; start: string }) {
  const grammar = new BacktrackFreeGrammar(
    useGrammar(props.grammar),
    props.start
  );

  const parser = new LL1Parser(grammar, props.start);
}
