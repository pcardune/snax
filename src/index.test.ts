import { LNode, StaticNode, UnionNode, ConcatNode } from './index';

function describeMatch(
  s: string,
  params: { node: () => LNode; good: string[]; bad: string[] }
) {
  const { node, good, bad } = params;
  const n = node();
  describe(s, () => {
    test.each(good)('match(%p) == true', (g) => {
      expect(n.match(g)).toBe(true);
    });

    test.each(bad)('match(%p) == false', (g) => {
      expect(n.match(g)).toBe(false);
    });
  });
}

describeMatch('StaticNode', {
  node: () => new StaticNode(['a', 'b']),
  good: ['a', 'b'],
  bad: ['c', 'd'],
});

describeMatch('UnionNode', {
  node: () => {
    const ab = new StaticNode(['a', 'b']);
    const cd = new StaticNode(['c', 'd']);
    const ef = new StaticNode(['e', 'f']);
    const union = new UnionNode(new UnionNode(ab, cd), ef);
    return union;
  },
  good: ['a', 'b', 'c', 'd', 'e', 'f'],
  bad: ['g'],
});

// describeMatch('ConcatNode', {
//   node: () => {
//     const ab = new StaticNode(['a', 'b']);
//     const cd = new StaticNode(['c', 'd']);
//     return new ConcatNode(ab, cd);
//   },
//   good: ['ac', 'bc', 'ad', 'bd'],
//   bad: ['g'],
// });
