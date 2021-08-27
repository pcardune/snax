import { useMemo } from 'react';
import {
  BacktrackFreeGrammar,
  buildGrammar,
  ConstGrammar,
  Grammar,
  GrammarSpec,
} from '../../dist/grammar/grammar';

export type GrammarLike = GrammarSpec | ConstGrammar<any>;

export function useGrammar(grammar: GrammarLike) {
  return useMemo(() => {
    if (grammar instanceof Grammar || grammar instanceof BacktrackFreeGrammar) {
      return grammar;
    }
    return buildGrammar(grammar as GrammarSpec);
  }, [grammar]);
}
