import type { OrderedMap } from '../utils/data-structures/OrderedMap.js';
import { PatternLexer } from './recognizer.js';
import type { ConstNFA } from '../nfa-to-dfa/nfa.js';

/**
 * @deprecated use {@link PatternLexer} directly
 */
export function buildLexer<T>(
  patterns: OrderedMap<T, ConstNFA>,
  ignoreTokens: T[] = []
) {
  return new PatternLexer(
    patterns.map((nfa, index, key) => ({
      nfa,
      ignore: ignoreTokens.indexOf(key) >= 0,
    }))
  );
}
