import {
  charNode,
  concatNode,
  orNode,
  parseRegex,
  starNode,
  Node,
  parenNode,
} from './parser';

describe('parseRegex', () => {
  const cases: { [index: string]: Node } = {
    a: charNode('a'),
    ab: concatNode(charNode('a'), charNode('b')),
    'a|b': orNode(charNode('a'), charNode('b')),
    'a*': starNode(charNode('a')),
    '(a)': parenNode(charNode('a')),
    '(a|b)': parenNode(orNode(charNode('a'), charNode('b'))),
    '(a|b)*': starNode(parenNode(orNode(charNode('a'), charNode('b')))),
    '(a|b)*a': concatNode(
      starNode(parenNode(orNode(charNode('a'), charNode('b')))),
      charNode('a')
    ),
  };
  test.each(Object.entries(cases))('%p', (pattern: string, node: Node) => {
    expect(parseRegex(pattern)).toEqual(node);
  });
});
