import { closure, move, NFA } from './nfa';

describe('NFA', () => {
  test('toDebugStr()', () => {
    let nfa = new NFA();
    let a = nfa.addAlpha('a');
    let b = nfa.addAlpha('b');
    let s0 = nfa.addState();
    let s1 = nfa.addState();
    let s2 = nfa.addState();
    nfa.addEdge(s0, s1, a);
    nfa.addEdge(s1, s2, b);
    nfa.setStartState(s0);
    nfa.setAccepting(s2, true);
    expect(`\n` + nfa.toDebugStr()).toMatchInlineSnapshot(`
"
     δ   a    b
  >s0:  s1    _
   s1:   _  *s2
  *s2:   _    _
"
`);
  });

  describe('traversal functions', () => {
    let nfa: NFA;
    let a: number, b: number, c: number, e: number;
    let s0: number;
    let s1: number;
    let s2: number;
    let s3: number;
    let s4: number;

    beforeAll(() => {
      nfa = new NFA();
      a = nfa.addAlpha('a');
      b = nfa.addAlpha('b');
      c = nfa.addAlpha('c');
      e = nfa.addAlpha('e');

      s0 = nfa.addState();
      s1 = nfa.addState();
      s2 = nfa.addState();
      s3 = nfa.addState();
      s4 = nfa.addState();

      let edges: [number, number, number][] = [
        [s0, s1, e],
        [s0, s2, e],
        [s1, s4, a],
        [s1, s3, b],
        [s2, s4, c],
        [s2, s4, a],
        [s2, s3, e],
        [s3, s4, b],
        [s3, s2, e],
      ];
      edges.forEach((e) => nfa.addEdge(...e));
    });

    test('closure(s, e)', () => {
      expect([...closure(nfa, [s1], e)].sort()).toEqual([1]);
      expect([...closure(nfa, [s3], e)].sort()).toEqual([2, 3]);
      expect([...closure(nfa, [s4], e)].sort()).toEqual([4]);
      expect([...closure(nfa, [s0], e)].sort()).toEqual([0, 1, 2, 3]);
      expect([...closure(nfa, [s1, s4], e)].sort()).toEqual([1, 4]);
      expect([...closure(nfa, [s1, s3], e)].sort()).toEqual([1, 2, 3]);
    });

    test('move(s, e)', () => {
      expect([...move(nfa, [s1, s2], c)].sort()).toEqual([4]);
      expect([...move(nfa, [s1, s3], b)].sort()).toEqual([3, 4]);
    });
  });
});
