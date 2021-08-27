import { BacktrackFreeGrammar, buildGrammar } from '../grammar';
import { buildLL1Table, LL1Parser } from '../LL1-parser';
import { Parser } from '../top-down-parser';

let backtrackFreeGrammar: BacktrackFreeGrammar<any, any>;
beforeAll(() => {
  backtrackFreeGrammar = new BacktrackFreeGrammar(
    buildGrammar({
      Goal: [['Expr']],
      Expr: [['Term', 'ExprP']],
      ExprP: [['+', 'Term', 'ExprP'], ['-', 'Term', 'ExprP'], []],
      Term: [['Factor', 'TermP']],
      TermP: [['*', 'Factor', 'TermP'], ['/', 'Factor', 'TermP'], []],
      Factor: [['(', 'Expr', ')'], ['num'], ['name']],
    }),
    'Goal'
  );
});

describe('LL1Parser', () => {
  let parser: LL1Parser<any, any>;
  beforeAll(() => {
    parser = new LL1Parser(backtrackFreeGrammar, 'Goal');
  });
  it('should parse valid sentances', () => {
    parser.parseOrThrow(['num']);
    parser.parseOrThrow(['(', 'num', ')', '+', 'name']);
  });
  it('should not parse invalid sentences', () => {
    expect(() =>
      parser.parseOrThrow(['(', 'num'])
    ).toThrowErrorMatchingInlineSnapshot(`"Couldn't find symbol )"`);
    expect(() =>
      parser.parseOrThrow(['num', ')'])
    ).toThrowErrorMatchingInlineSnapshot(`"Couldn't find symbol Symbol(EOF)"`);
    expect(() =>
      parser.parseOrThrow(['num', '+'])
    ).toThrowErrorMatchingInlineSnapshot(`"Failed to expand Term"`);
  });
  it('should construct a proper parse tree', () => {
    const tree = parser.parseOrThrow(['(', 'num', ')', '+', 'name']);
    const oldTree = new Parser(backtrackFreeGrammar, 'Goal').parseOrThrow([
      '(',
      'num',
      ')',
      '+',
      'name',
    ]);
    expect(oldTree.pretty()).toMatchInlineSnapshot(`
      "
      <Goal>
      |  <Expr>
      |  |  <Term>
      |  |  |  <Factor>
      |  |  |  |  <(>(</(>
      |  |  |  |  <Expr>
      |  |  |  |  |  <Term>
      |  |  |  |  |  |  <Factor>
      |  |  |  |  |  |  |  <num>num</num>
      |  |  |  |  |  |  </Factor>
      |  |  |  |  |  |  <TermP>
      |  |  |  |  |  |  </TermP>
      |  |  |  |  |  </Term>
      |  |  |  |  |  <ExprP>
      |  |  |  |  |  </ExprP>
      |  |  |  |  </Expr>
      |  |  |  |  <)>)</)>
      |  |  |  </Factor>
      |  |  |  <TermP>
      |  |  |  </TermP>
      |  |  </Term>
      |  |  <ExprP>
      |  |  |  <+>+</+>
      |  |  |  <Term>
      |  |  |  |  <Factor>
      |  |  |  |  |  <name>name</name>
      |  |  |  |  </Factor>
      |  |  |  |  <TermP>
      |  |  |  |  </TermP>
      |  |  |  </Term>
      |  |  |  <ExprP>
      |  |  |  </ExprP>
      |  |  </ExprP>
      |  </Expr>
      </Goal>
      "
    `);
    expect(tree.pretty()).toMatchInlineSnapshot(`
      "
      <Goal>
      |  <Expr>
      |  |  <Term>
      |  |  |  <Expr>
      |  |  |  |  <ExprP>
      |  |  |  |  |  <Term>
      |  |  |  |  |  |  <(>(</(>
      |  |  |  |  |  |  <TermP>
      |  |  |  |  |  |  |  <Factor>
      |  |  |  |  |  |  |  |  <num>num</num>
      |  |  |  |  |  |  |  </Factor>
      |  |  |  |  |  |  </TermP>
      |  |  |  |  |  </Term>
      |  |  |  |  </ExprP>
      |  |  |  </Expr>
      |  |  |  <TermP>
      |  |  |  |  <Factor>
      |  |  |  |  |  <)>)</)>
      |  |  |  |  </Factor>
      |  |  |  </TermP>
      |  |  </Term>
      |  |  <ExprP>
      |  |  |  <ExprP>
      |  |  |  |  <Term>
      |  |  |  |  |  <+>+</+>
      |  |  |  |  |  <TermP>
      |  |  |  |  |  |  <Factor>
      |  |  |  |  |  |  |  <name>name</name>
      |  |  |  |  |  |  </Factor>
      |  |  |  |  |  </TermP>
      |  |  |  |  </Term>
      |  |  |  </ExprP>
      |  |  </ExprP>
      |  </Expr>
      </Goal>
      "
    `);
  });
});

describe('buildLL1Table()', () => {
  it('should work', () => {
    const productions = [...backtrackFreeGrammar.productionsIter()];
    const table = buildLL1Table(backtrackFreeGrammar);
    const entries = [];
    let lastRow: any = null;
    for (const [row, col, cell] of table.entries()) {
      if (lastRow === null) {
        lastRow = row;
      }
      if (lastRow !== row) {
        entries.push('');
      }
      lastRow = row;
      const rowcol = `(${row}, ${col.toString()})`.padEnd(22, '.');
      const index = productions.indexOf(cell);
      entries.push(
        `${rowcol} (${index === -1 ? '-' : index}) ${cell?.toString() || null}`
      );
    }
    expect(entries.join('\n')).toMatchInlineSnapshot(`
      "(Goal, +)............. (-) null
      (Goal, -)............. (-) null
      (Goal, *)............. (-) null
      (Goal, /)............. (-) null
      (Goal, ()............. (0) Goal -> Expr
      (Goal, ))............. (-) null
      (Goal, num)........... (0) Goal -> Expr
      (Goal, name).......... (0) Goal -> Expr
      (Goal, Symbol(EOF))... (-) null

      (Expr, +)............. (-) null
      (Expr, -)............. (-) null
      (Expr, *)............. (-) null
      (Expr, /)............. (-) null
      (Expr, ()............. (1) Expr -> Term ExprP
      (Expr, ))............. (-) null
      (Expr, num)........... (1) Expr -> Term ExprP
      (Expr, name).......... (1) Expr -> Term ExprP
      (Expr, Symbol(EOF))... (-) null

      (ExprP, +)............ (2) ExprP -> + Term ExprP
      (ExprP, -)............ (3) ExprP -> - Term ExprP
      (ExprP, *)............ (-) null
      (ExprP, /)............ (-) null
      (ExprP, ()............ (-) null
      (ExprP, ))............ (4) ExprP -> Symbol(ϵ)
      (ExprP, num).......... (-) null
      (ExprP, name)......... (-) null
      (ExprP, Symbol(EOF)).. (4) ExprP -> Symbol(ϵ)

      (Term, +)............. (-) null
      (Term, -)............. (-) null
      (Term, *)............. (-) null
      (Term, /)............. (-) null
      (Term, ()............. (5) Term -> Factor TermP
      (Term, ))............. (-) null
      (Term, num)........... (5) Term -> Factor TermP
      (Term, name).......... (5) Term -> Factor TermP
      (Term, Symbol(EOF))... (-) null

      (TermP, +)............ (8) TermP -> Symbol(ϵ)
      (TermP, -)............ (8) TermP -> Symbol(ϵ)
      (TermP, *)............ (6) TermP -> * Factor TermP
      (TermP, /)............ (7) TermP -> / Factor TermP
      (TermP, ()............ (-) null
      (TermP, ))............ (8) TermP -> Symbol(ϵ)
      (TermP, num).......... (-) null
      (TermP, name)......... (-) null
      (TermP, Symbol(EOF)).. (8) TermP -> Symbol(ϵ)

      (Factor, +)........... (-) null
      (Factor, -)........... (-) null
      (Factor, *)........... (-) null
      (Factor, /)........... (-) null
      (Factor, ()........... (9) Factor -> ( Expr )
      (Factor, ))........... (-) null
      (Factor, num)......... (10) Factor -> num
      (Factor, name)........ (11) Factor -> name
      (Factor, Symbol(EOF)). (-) null"
    `);
  });
});
