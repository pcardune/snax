import { DFA, matchDFA } from './nfa-to-dfa';
import { nfaForNode, parseRegex } from './regex-compiler';

export class Regex {
  pattern: string;
  private dfa: DFA<undefined[]>;
  constructor(pattern: string) {
    this.pattern = pattern;
    let node = parseRegex(this.pattern);
    let nfa = nfaForNode(node, undefined);
    this.dfa = DFA.fromNFA(nfa);
  }
  match(input: string) {
    return matchDFA(this.dfa, input, true);
  }
}
