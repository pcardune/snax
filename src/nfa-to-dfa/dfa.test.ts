import { charCodes } from '../iter';
import { DFA } from './dfa';
import { NewNFA } from './nfa';

let nfa: NewNFA;
let a: number;
let b: number;
let c: number;
let e: number;
beforeAll(() => {
  // this nfa is based on the diagram in
  // Engineering a Compiler (Cooper & Torczon)
  // page 51 and represents the nfa for the
  // regex a(b|c)*
  nfa = new NewNFA();
  a = nfa.addAlpha('a');
  b = nfa.addAlpha('b');
  c = nfa.addAlpha('c');
  e = nfa.addAlpha(-1);

  for (let i = 0; i <= 10; i++) {
    nfa.addState();
  }
  nfa.setAccepting(9, true);
  nfa.setStartState(0);
  let edges: [number, number, number][] = [
    [0, 1, a],
    [1, 2, e],
    [2, 3, e],
    [2, 9, e],
    [3, 4, e],
    [3, 6, e],
    [4, 5, b],
    [5, 8, e],
    [6, 7, c],
    [7, 8, e],
    [8, 3, e],
    [8, 9, e],
  ];
  edges.forEach((e) => nfa.addEdge(...e));
});
test('DFA.fromNFA()', () => {
  let dfa = DFA.fromNFA(nfa, e);
  expect('\n' + dfa.toDebugStr()).toMatchInlineSnapshot(`
    "
    DFAfromNFA:
         δ    a    b    c
      >s0:  *s1    _    _
      *s1:    _  *s2  *s3
      *s2:    _  *s2  *s3
      *s3:    _  *s2  *s3

    Mapping from DFA state to source NFA states:
    s0: {0}
    s1: {1,2,3,4,6,9}
    s2: {3,4,5,6,8,9}
    s3: {3,4,6,7,8,9}
    "
  `);
});
// a(b|c)*
const cases: [string, string | undefined][] = [
  ['a', 'a'],
  ['agfh', 'a'],
  ['acfda', 'ac'],
  ['abcbccfda', 'abcbcc'],
  ['foobar', undefined],
  ['', undefined],
];
test.each(cases)('match %p', (input, expected) => {
  let dfa = DFA.fromNFA(nfa, e);
  const match = dfa.match(charCodes(input));
  expect(match?.substr).toEqual(expected);
});

test('DFA.minimized', () => {
  const dfa = new DFA();
  let e = dfa.addAlpha('e');
  let i = dfa.addAlpha('i');
  let f = dfa.addAlpha('f');
  let s0 = dfa.addState();
  let s1 = dfa.addState();
  let s2 = dfa.addState();
  let s3 = dfa.addState();
  let s4 = dfa.addState();
  let s5 = dfa.addState();
  dfa.setAccepting(s3, true);
  dfa.setAccepting(s5, true);
  dfa.setStartState(s0);
  dfa.addEdge(s0, s1, f);
  dfa.addEdge(s1, s2, e);
  dfa.addEdge(s1, s4, i);
  dfa.addEdge(s2, s3, e);
  dfa.addEdge(s4, s5, e);
  expect('\n' + dfa.toDebugStr()).toMatchInlineSnapshot(`
    "
         δ    e   i   f
      >s0:    _   _  s1
       s1:   s2  s4   _
       s2:  *s3   _   _
      *s3:    _   _   _
       s4:  *s5   _   _
      *s5:    _   _   _
    "
  `);
  const minDFA = dfa.minimized();
});
