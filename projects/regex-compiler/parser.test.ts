import {
  charNode,
  concatNode,
  orNode,
  parseRegex,
  starNode,
  RNode,
  parenNode,
  anyCharNode,
} from './parser';

describe('parseRegex', () => {
  const cases: { [index: string]: RNode } = {
    a: charNode('a'),
    ab: concatNode(charNode('a'), charNode('b')),
    '\\(a': concatNode(charNode('('), charNode('a')),
    '\\*a': concatNode(charNode('*'), charNode('a')),
    'a|b': orNode(charNode('a'), charNode('b')),
    'a*': starNode(charNode('a')),
    '(a)': parenNode(charNode('a')),
    '(a|b)': parenNode(orNode(charNode('a'), charNode('b'))),
    '(a|b)*': starNode(parenNode(orNode(charNode('a'), charNode('b')))),
    '(a|b)*a': concatNode(
      starNode(parenNode(orNode(charNode('a'), charNode('b')))),
      charNode('a')
    ),
    'ab|cd': orNode(
      concatNode(charNode('a'), charNode('b')),
      concatNode(charNode('c'), charNode('d'))
    ),
    '(ab|cd)*': starNode(
      parenNode(
        orNode(
          concatNode(charNode('a'), charNode('b')),
          concatNode(charNode('c'), charNode('d'))
        )
      )
    ),
    '(a|(b))': parenNode(orNode(charNode('a'), parenNode(charNode('b')))),
    '(a|\\(b)': parenNode(
      orNode(charNode('a'), concatNode(charNode('('), charNode('b')))
    ),
    'aa*': concatNode(charNode('a'), starNode(charNode('a'))),
    'a.*b': concatNode(
      concatNode(charNode('a'), starNode(anyCharNode())),
      charNode('b')
    ),
  };
  test.each(Object.entries(cases))('%p', (pattern: string, node: RNode) => {
    expect(parseRegex(pattern)).toEqual(node);
  });
});