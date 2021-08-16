import { charCodes } from './iter';
import { DFA } from './nfa-to-dfa/dfa';
import { parseRegex } from './regex-compiler';

export class Regex {
  pattern: string;
  private dfa: DFA;
  constructor(pattern: string) {
    this.pattern = pattern;
    let node = parseRegex(this.pattern);
    let nfa = node.nfa();
    this.dfa = nfa.toDFA();
  }
  match(input: string) {
    let result = this.dfa.match(charCodes(input));
    return result ? { substr: result.substr } : null;
  }
}
