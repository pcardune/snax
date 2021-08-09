import {
  NFA,
  EPSILON,
  epsilonClosure,
  getInputAlphabet,
  move,
  multiEpsilonClosure,
  getDStates,
  DFA,
  matchDFA,
  edge,
  label,
  state,
} from './nfa-to-dfa';

const a = label('a');
const b = label('b');
// Figure 3.34, Page 155 of dragon book:
// an NFA for the pattern (a|b)*abb
const nfaData = [
  // 0:
  state(0, false, [edge(EPSILON, 1), edge(EPSILON, 7)]),
  // 1:
  state(1, false, [edge(EPSILON, 2), edge(EPSILON, 4)]),
  // 2:
  state(2, false, [edge(a, 3)]),
  // 3:
  state(3, false, [edge(EPSILON, 6)]),
  // 4:
  state(4, false, [edge(b, 5)]),
  // 5:
  state(5, false, [edge(EPSILON, 6)]),
  // 6:
  state(6, false, [edge(EPSILON, 1), edge(EPSILON, 7)]),
  // 7:
  state(7, false, [edge(a, 8)]),
  // 8:
  state(8, false, [edge(b, 9)]),
  // 9:
  state(9, false, [edge(b, 10)]),
  // 10:
  state(10, true, []),
];

describe('(a|b)*abb', () => {
  const nfa = new NFA(nfaData);

  test('epsilonClosure', () => {
    let closure0 = epsilonClosure(nfa, 0);
    [0, 1, 2, 4, 7].forEach((n) => expect(closure0).toContain(n));
    expect(closure0.size).toBe(5);

    let closure8 = epsilonClosure(nfa, 8);
    expect(closure8).toContain(8);
    expect(closure8.size).toBe(1);

    let closure3 = epsilonClosure(nfa, 3);
    [1, 2, 3, 4, 6, 7].forEach((n) => expect(closure3).toContain(n));
    expect(closure3.size).toBe(6);
  });

  test('multiEpsilonClosure', () => {
    const multi = multiEpsilonClosure(nfa, new Set([3, 8]));
    [1, 2, 3, 4, 6, 7, 8].forEach((n) => expect(multi).toContain(n));
    expect(multi.size).toBe(7);
  });

  test('getInputAlphabet', () => {
    let alphabet = getInputAlphabet(nfa);
    ['a', 'b'].forEach((n) => expect(alphabet).toContain(n));
  });

  test('move', () => {
    const A = epsilonClosure(nfa, 0);
    const moved = move(nfa, A, label('a'));
    [3, 8].forEach((n) => expect(moved).toContain(n));
  });

  test('getDStates', () => {
    let alpha = Array.from(getInputAlphabet(nfa)).sort();
    let [_, Dtrans] = getDStates(nfa);
    let byAlpha: Record<string, string[]> = {};
    Object.keys(Dtrans).forEach((hash) => {
      byAlpha[hash] = alpha.map((letter) => Dtrans[hash].edges[letter]);
    });
    let A = '0,1,2,4,7';
    let B = '1,2,3,4,6,7,8';
    let C = '1,2,4,5,6,7';
    let D = '1,2,4,5,6,7,9';
    let E = '1,2,4,5,6,7,10';
    expect(byAlpha[A]).toEqual([B, C]);
    expect(byAlpha[B]).toEqual([B, D]);
    expect(byAlpha[C]).toEqual([B, C]);
    expect(byAlpha[D]).toEqual([B, E]);
    expect(byAlpha[E]).toEqual([B, C]);

    // now some debugging...
    // const DStateNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    // let nameMap: { [index: string]: string } = {};
    // Object.keys(Dtrans).forEach(
    //   (hash, index) => (nameMap[hash] = DStateNames[index])
    // );
    // let table = [['NFA State', 'DFA State', ...alpha]];
    // Object.keys(Dtrans).forEach((hash) => {
    //   const D = Dtrans[hash];
    //   let row = [hash, nameMap[hash]];
    //   row.push();
    //   for (const letter of alpha) {
    //     row.push(nameMap[D[letter]]);
    //   }
    //   table.push(row);
    //   console.log(row);
    // });
    // console.log(table);
  });
});

describe('DFA', () => {
  const nfa = new NFA(nfaData);
  const dfa = DFA.fromNFA(nfa);

  // (a|b)*abb
  test.each(['abb', 'ababb', 'aaaaabb', 'bbaabaababababb'])(
    'full match %s',
    (input) => {
      let result = matchDFA(dfa, input);
      expect(result).not.toBe(false);
      if (result != false) {
        expect(result.to).toEqual(input.length);
      }
    }
  );

  test('partial match abbignored', () => {
    expect(matchDFA(dfa, 'abbignored')).toEqual({ from: 0, to: 3 });
  });

  test.each(['foo', 'abab', 'bb'])("don't match %s", (input) => {
    expect(matchDFA(dfa, input)).toBe(false);
  });
});
