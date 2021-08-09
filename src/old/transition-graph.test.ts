import {
  Graph,
  inner,
  terminal,
  matchChar,
  matchAny,
  matchGraph,
  sequence,
  MatchResult,
  matchCharIn,
  matchUnion,
  lexeme,
} from './transition-graph';

enum Token {
  LE = 'LE',
  NE = 'NE',
  LT = 'LT',
  EQ = 'EQ',
  GE = 'GE',
  GT = 'GT',
}

// page 131 of dragon book
const relop: Graph<Token> = [
  // 0:
  inner([
    { char: matchChar('<'), next: 1 },
    { char: matchChar('='), next: 5 },
    { char: matchChar('>'), next: 6 },
  ]),
  // 1:
  inner([
    { char: matchChar('='), next: 2 },
    { char: matchChar('>'), next: 3 },
    { char: matchAny(), next: 4 },
  ]),
  // 2:
  terminal(Token.LE),
  // 3:
  terminal(Token.NE),
  // 4:
  terminal(Token.LT, 1),
  // 5:
  terminal(Token.EQ),
  // 6:
  inner([
    { char: matchChar('='), next: 7 },
    { char: matchAny(), next: 8 },
  ]),
  //7:
  terminal(Token.GE),
  //8:
  terminal(Token.GT, 1),
];

describe('matchGraph', () => {
  const cases: [string, MatchResult<Token>][] = [
    ['<', lexeme(Token.LT, 0, 1)],
    ['<=', lexeme(Token.LE, 0, 2)],
    ['!=', false],
  ];
  test.each(cases)('%s should lex to %p', (input: string, token) => {
    expect(matchGraph(relop, input)).toEqual(token);
  });
});

describe('sequence', () => {
  enum Token {
    FOOBAR,
  }
  const graph = sequence('foobar', Token.FOOBAR);
  const cases: [string, MatchResult<Token>][] = [
    ['foobar', lexeme(Token.FOOBAR, 0, 5)],
    ['foobaz', false],
    ['foo', false],
    ['foobario', lexeme(Token.FOOBAR, 0, 5)],
  ];
  test.each(cases)('%s should lex to %p', (input: string, token) => {
    expect(matchGraph(graph, input)).toEqual(token);
  });
});

describe('matchOneOf', () => {
  enum Token {
    ID,
  }
  const letters = matchCharIn('abcdefghijklmnopqrstuvwxyz');
  const digits = matchCharIn('0123456789');
  const letters_or_digits = matchUnion([letters, digits]);
  const graph: Graph<Token> = [
    // 0:
    inner([{ char: letters, next: 1 }]),
    // 1:
    inner([
      { char: letters_or_digits, next: 1 },
      { char: matchAny(), next: 2 },
    ]),
    // 2:
    terminal(Token.ID, 1),
  ];

  const cases: [string, MatchResult<Token>][] = [
    ['f1', lexeme(Token.ID, 0, 2)],
    ['j3', lexeme(Token.ID, 0, 2)],
    ['jbar', lexeme(Token.ID, 0, 4)],
    ['f3j42', lexeme(Token.ID, 0, 5)],
    ['f3j42$blah', lexeme(Token.ID, 0, 5)],
    ['!f3j42', false],
  ];
  test.each(cases)('%s should lex to %p', (input: string, token) => {
    expect(matchGraph(graph, input)).toEqual(token);
  });
});
