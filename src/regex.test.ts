import { Regex } from './regex';

const cases: [string, { matches: string[]; fails?: string[] }][] = [
  ['(a|b)*abb', { matches: ['abb', 'ababb', 'aaaaabb', 'bbaabaababababb'] }],
  ['ab*b', { matches: ['ab', 'abbb'] }],
  ['.', { matches: ['c', 'd', '\t'] }],
  [
    'a.*b',
    {
      matches: ['ab', 'acb', 'a whatever in between followed by a b'],
      fails: ['ac', 'a whatever with the suffix'],
    },
  ],
  ['\\d', { matches: ['1', '2', '3'], fails: ['a', 'b', 'c'] }],
  ['\\w', { matches: ['g', '_', 'A', 'Z', '3'], fails: ['-', ';'] }],
];
describe.each(cases)('%p', (pattern, { matches, fails }) => {
  const re = new Regex(pattern);
  test.each(matches)('matches %p', (input) => {
    let result = re.match(input);
    expect(result).toBeDefined();
    if (result != undefined) {
      expect(result.substr).toEqual(input);
    }
  });
  if (fails) {
    test.each(fails)('does not match %p', (input) => {
      let result = re.match(input);
      expect(result).not.toBeDefined();
    });
  }
});
