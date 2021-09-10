import { NFA } from '@pcardune/snax/dist/nfa-to-dfa/nfa';
import { parseRegex } from '@pcardune/snax/dist/regex-compiler/parser';
import NFAGraph from './NFAGraph.js';

let nfa = new NFA();
let s0 = nfa.addState();
let s1 = nfa.addState();
let s2 = nfa.addState();
let s3 = nfa.addState();
let f = nfa.addAlpha('f');
let o = nfa.addAlpha('o');
nfa.addEdge(s0, s1, f);
nfa.addEdge(s1, s2, o);
nfa.addEdge(s2, s3, o);
nfa.setAccepting(s3, true);
nfa.setStartState(s0);
export { nfa };

export const regexNFA = parseRegex('a*b*').nfa();
