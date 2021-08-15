import { toDFA } from './dfa';
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
test('toDFA()', () => {
  let dfa = toDFA(nfa, e);
  expect('\n' + dfa.toDebugStr()).toMatchInlineSnapshot(`
"
     δ    a    b    c
  >s0:  *s1   se   se
  *s1:   se  *s2  *s3
  *s2:   se  *s2  *s3
  *s3:   se  *s2  *s3
"
`);
});
