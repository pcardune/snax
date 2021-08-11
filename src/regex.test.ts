import {
  DFA,
  Edge,
  edge,
  EPSILON,
  label,
  matchDFA,
  NFA,
  state as nfaState,
} from './nfa-to-dfa';
import { concatNFA, labelNFA, orNFA, Regex, reindexed, starNFA } from './regex';

const state = (id: number, accepting: boolean, edges: Edge<number>[]) =>
  nfaState(id, accepting, edges, undefined);

describe('labelNFA', () => {
  const nfa = labelNFA(label('a'));
  test('labelNFA', () => {
    expect(nfa.toJSON()).toEqual(
      new NFA([
        state(0, false, [edge(label('a'), 1)]),
        state(1, true, []),
      ]).toJSON()
    );
  });
});

describe('reindexed', () => {
  test('reindexed()', () => {
    expect(reindexed(labelNFA(label('a')), 10)).toEqual([
      state(10, false, [edge(label('a'), 11)]),
      state(11, true, []),
    ]);
  });
});

describe('orNFA', () => {
  test('orNFA("a|b")', () => {
    const a = labelNFA(label('a'));
    const b = labelNFA(label('b'));
    const nfa = orNFA(a, b);
    expect(nfa.toJSON()).toEqual(
      new NFA([
        state(0, false, [edge(EPSILON, 1), edge(EPSILON, 3)]),
        // from a
        state(1, false, [edge(label('a'), 2)]),
        state(2, false, [edge(EPSILON, 5)]),
        // from b
        state(3, false, [edge(label('b'), 4)]),
        state(4, false, [edge(EPSILON, 5)]),
        // to accepting
        state(5, true, []),
      ]).toJSON()
    );
  });
});

describe('concatNFA', () => {
  test('concatNFA("ab")', () => {
    const a = labelNFA(label('a'));
    const b = labelNFA(label('b'));
    const nfa = concatNFA(a, b);
    expect(nfa.toJSON()).toEqual(
      new NFA([
        // from a
        state(0, false, [edge(label('a'), 1)]),
        state(1, false, [edge(label('b'), 2)]),
        // to accepting
        state(2, true, []),
      ]).toJSON()
    );
  });
});

describe('starNFA', () => {
  test('starNFA("a*")', () => {
    const a = labelNFA(label('a'));
    const nfa = starNFA(a);
    expect(nfa.toJSON()).toEqual(
      new NFA([
        state(0, false, [edge(EPSILON, 1), edge(EPSILON, 3)]),
        // from a
        state(1, false, [edge(label('a'), 2)]),
        state(2, false, [edge(EPSILON, 3), edge(EPSILON, 1)]),
        // to accepting
        state(3, true, []),
      ]).toJSON()
    );
  });
});

describe('matching', () => {
  let a = label('a');
  let b = label('b');
  const nfa = concatNFA(
    concatNFA(
      concatNFA(starNFA(orNFA(labelNFA(a), labelNFA(b))), labelNFA(a)),
      labelNFA(b)
    ),
    labelNFA(b)
  );

  const dfa = DFA.fromNFA(nfa);
  test.each(['abb', 'ababb', 'aaaaabb', 'bbaabaababababb'])(
    'full match %s',
    (input) => {
      let result = matchDFA(dfa, input);
      expect(result).toBeDefined();
      if (result != undefined) {
        expect(result.substr).toEqual(input);
      }
    }
  );
});

describe('Regex', () => {
  const re = new Regex('(a|b)*abb');
  test.each(['abb', 'ababb', 'aaaaabb', 'bbaabaababababb'])(
    'full match %s',
    (input) => {
      let result = re.match(input);
      expect(result).toBeDefined();
      if (result != undefined) {
        expect(result.substr).toEqual(input);
      }
    }
  );
});
