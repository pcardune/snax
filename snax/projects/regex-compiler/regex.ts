import { charCodes } from '../utils/iter.js';
import type { DFA } from '../nfa-to-dfa/dfa.js';
import { RegexParser } from './parser.js';

export class Regex {
  pattern: string;
  private dfa: DFA;
  constructor(pattern: string) {
    this.pattern = pattern;
    let node = RegexParser.parseOrThrow(this.pattern);
    let nfa = node.nfa();
    this.dfa = nfa.toDFA();
  }
  match(input: string) {
    let result = this.dfa.match(charCodes(input));
    return result ? { substr: result.substr } : null;
  }
}
