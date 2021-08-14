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
  ['a+b', { matches: ['ab', 'aaab'], fails: ['b'] }],
  ['(ab)+', { matches: ['ab', 'abababab'] }],
  // character classes
  ['[abc]', { matches: ['a', 'b', 'c'], fails: ['d', 'e', 'f', '[', ']'] }],
  ['[-a]', { matches: ['a', '-'], fails: ['b', '[', ']'] }],
  ['[a-]', { matches: ['a', '-'], fails: ['b', '[', ']'] }],
  [
    '[A-F]',
    {
      matches: ['A', 'B', 'C', 'D', 'E', 'F'],
      fails: ['[', ']', 'a', 'G', '-'],
    },
  ],
  [
    '[_A-F]',
    {
      matches: ['A', 'B', 'C', 'D', 'E', 'F', '_'],
      fails: ['[', ']', 'a', 'G', '-'],
    },
  ],
  [
    '[A-F_]',
    {
      matches: ['A', 'B', 'C', 'D', 'E', 'F', '_'],
      fails: ['[', ']', 'a', 'G', '-'],
    },
  ],
  [
    '[A-Fa-f0-9]',
    {
      matches: 'ABCDEFabcdef0123456789'.split(''),
      fails: ['[', ']', 'g', 'G', '-'],
    },
  ],
  ['[^ab]', { matches: ['c', 'd', ' ', '\n'], fails: ['a', 'b'] }],
];
describe.each(cases)('%p', (pattern, { matches, fails }) => {
  test(`compiles ${pattern}`, () => {
    expect(() => new Regex(pattern)).not.toThrow();
  });

  describe('matches', () => {
    let re: Regex;
    beforeAll(() => {
      re = new Regex(pattern);
    });
    test.each(matches)('matches %p', (input) => {
      let result = re.match(input);
      expect(result).toBeDefined();
      if (result != undefined) {
        expect(result.substr).toEqual(input);
      }
    });
    if (fails) {
      test.each(fails)('should not match %p', (input) => {
        let result = re.match(input);
        expect(result).not.toBeDefined();
      });
    }
  });
});
