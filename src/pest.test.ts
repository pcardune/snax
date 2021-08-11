class Literal {
  literal: string;
  caseInsensitive: boolean;
  constructor(literal: string, caseInsensitive: boolean = false) {
    this.literal = literal;
    this.caseInsensitive = caseInsensitive;
  }
}

class CharRange {
  start: number;
  end: number;
  constructor(start: string, end: string) {
    this.start = start.charCodeAt(0);
    this.end = end.charCodeAt(0);
  }
}

class Sequence {
  exprs: Expr[];
  constructor(exprs: Expr[]) {
    this.exprs = exprs;
  }
}

class Choice {
  choices: Expr[];
  constructor(choices: Expr[]) {
    this.choices = choices;
  }
}

class Repetition {
  expr: Expr;
  min: number;
  max: number;
  constructor(expr: Expr, min: number, max: number) {
    this.expr = expr;
    this.min = min;
    this.max = max;
  }
}

class Predicate {
  expr: Expr;
  positive: boolean;
  constructor(expr: Expr, positive: boolean) {
    this.expr = expr;
    this.positive = positive;
  }
}

class Start {}
class End {}

class Silent {
  expr: Expr;
  constructor(expr: Expr) {
    this.expr = expr;
  }
}

class Atomic {
  expr: Expr;
  constructor(expr: Expr) {
    this.expr = expr;
  }
}

class CompoundAtomic {
  expr: Expr;
  constructor(expr: Expr) {
    this.expr = expr;
  }
}

class NonAtomic {
  expr: Expr;
  constructor(expr: Expr) {
    this.expr = expr;
  }
}

type Expr =
  | Literal
  | CharRange
  | Sequence
  | Choice
  | Repetition
  | Predicate
  | Start
  | End
  | Silent
  | Atomic
  | CompoundAtomic
  | NonAtomic;

class Rule {
  name: string;
  expr: Expr;
  constructor(name: string, expr: Expr) {
    this.name = name;
    this.expr = expr;
  }
}

class Pair {
  rule: Rule;
  from: number;
  to: number;
  input: string;
  constructor(rule: Rule, from: number, to: number, input: string) {
    this.rule = rule;
    this.from = from;
    this.to = to;
    this.input = input;
  }
  asString() {
    return this.input.slice(this.from, this.to);
  }
}

class Pairs {
  pairs: Pair[];
  constructor(pairs: Pair[], input: string) {
    this.pairs = pairs;
  }
}

function matchExpr(expr: Expr, from: number, input: string): number | null {
  if (expr instanceof Literal) {
    if (input.slice(from).startsWith(expr.literal)) {
      return from + expr.literal.length;
    } else {
      return null;
    }
  } else if (expr instanceof Choice) {
    for (const subexpr of expr.choices) {
      let match = matchExpr(subexpr, from, input);
      if (match != null) {
        return match;
      }
    }
  } else if (expr instanceof Sequence) {
    let lastMatch = from;
    for (const subexpr of expr.exprs) {
      let match = matchExpr(subexpr, lastMatch, input);
      if (match == null) {
        return null;
      }
      lastMatch = match;
    }
    return lastMatch;
  } else if (expr instanceof Rule) {
    return matchExpr(expr.expr, from, input);
  }
  throw new Error(`Not sure how to handle expression ${expr}`);
}

class ParseIterator {
  rule: Rule;
  input: string;
  index: number = 0;
  constructor(rule: Rule, input: string) {
    this.rule = rule;
    this.input = input;
  }

  next() {
    let match = matchExpr(this.rule.expr, this.index, this.input);
    if (match != null) {
      const pair = new Pair(this.rule, this.index, match, this.input);
      this.index = match;
      return pair;
    } else {
      return null;
    }
  }
}

describe('pest', () => {
  let NEWLINE = new Rule(
    'NEWLINE',
    new Choice([new Literal('\n'), new Literal('\r\n'), new Literal('\r')])
  );
  let ASCII_DIGIT = new Rule('ASCII_DIGIT', new CharRange('0', '9'));
  let ASCII_ALPHA_LOWER = new Rule(
    'ASCII_ALPHA_LOWER',
    new CharRange('a', 'z')
  );
  let ASCII_ALPHA_UPPER = new Rule(
    'ASCII_ALPHA_UPPER',
    new CharRange('A', 'Z')
  );
  let ASCII_ALPHA = new Rule(
    'ASCII_ALPHA',
    new Choice([ASCII_ALPHA_LOWER, ASCII_ALPHA_UPPER])
  );
  let ASCII_ALPHANUMERIC = new Rule(
    'ASCII_ALPHANUMERIC',
    new Choice([ASCII_DIGIT, ASCII_ALPHA])
  );
  let WHITESPACE = new Rule(
    'WHITESPACE',
    new Choice([new Literal(' '), new Literal('\t'), NEWLINE])
  );

  // now a grammer for parsing pest files...
  let identifier = new Rule(
    'identifier',
    new Sequence([ASCII_ALPHA, new Repetition(ASCII_ALPHANUMERIC, 0, Infinity)])
  );

  test('literal', () => {
    let foo = new Rule('foo', new Literal('foo'));
    let it = new ParseIterator(foo, 'foo');
    let r = it.next();
    expect(r).toBeDefined();
    expect(r?.asString()).toEqual('foo');
  });
  test('subrule', () => {
    let foo = new Rule('foo', new Literal('foo'));
    let bar = new Rule('bar', new Sequence([new Literal('bar'), foo]));
    let it = new ParseIterator(bar, 'barfoo');
    let r = it.next();
    expect(r).toBeDefined();
    expect(r?.asString()).toEqual('barfoo');
  });
});
