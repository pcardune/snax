import { useMemo } from 'react';
import { buildGrammar } from '@pcardune/snax/dist/grammar/grammar';
import { removeDirectLeftRecursion } from '@pcardune/snax/dist/grammar/top-down-parser';
import { useDSLGrammar } from '../hooks/getDSLGrammar.js';
import { GrammarTable, NonTerminal } from './GrammarTable.js';
import { LexerTable } from './LexerTable.js';

//prettier-ignore
const expressionGrammarSpec = {
  Goal: [['Expr']],
  Expr: [
    ['Expr', '+', 'Term'],
    ['Expr', '-', 'Term'],
    ['Term'],
  ],
  Term: [
    ['Term', '*', 'Factor'],
    ['Term', '/', 'Factor'],
    ['Factor'],
  ],
  Factor: [
    ['(', 'Expr', ')'],
    ['NUM'],
    ['NAME'],
  ]
};

const backtrackFreeGrammar = buildGrammar({
  Goal: [['Expr']],
  Expr: [['Term', 'ExprP']],
  ExprP: [['+', 'Term', 'ExprP'], ['-', 'Term', 'ExprP'], []],
  Term: [['Factor', 'TermP']],
  TermP: [['*', 'Factor', 'TermP'], ['/', 'Factor', 'TermP'], []],
  Factor: [['(', 'Expr', ')'], ['num'], ['name']],
});

export function GrammarsPage() {
  const numbers = useDSLGrammar(require('../grammars/numbers.grammar'));
  const expressionGrammar = useMemo(
    () => buildGrammar(expressionGrammarSpec),
    []
  );
  const rrExpressionGrammar = useMemo(
    () => removeDirectLeftRecursion(buildGrammar(expressionGrammarSpec)),
    []
  );
  return (
    <div>
      <h2>Standard Expression Grammar</h2>
      <p>
        Here is a standard expression grammar showing how operator precedence
        works.
      </p>
      <GrammarTable grammar={expressionGrammar} />
      <p>
        This grammar is <em>left recursive</em>, which is problematic for
        top-down parsers. When expanding <NonTerminal>Expr</NonTerminal>, the
        first rule tries to match the first symbol in the expansion, which is{' '}
        <NonTerminal>Expr</NonTerminal>. So it will recurse infinitely.
        Fortunately, it&apos;s possible to rewrite the grammar automatically to
        eliminate left recursion.
      </p>
      <GrammarTable grammar={rrExpressionGrammar} />
      <h2>Grammar for Numbers</h2>
      {numbers.lexer && <LexerTable lexer={numbers.lexer} />}
      {numbers.parser && (
        <GrammarTable grammar={numbers.parser.grammar} lexer={numbers.lexer} />
      )}
      <h2>Backtrack Free Grammars</h2>
      <GrammarTable grammar={backtrackFreeGrammar} />
    </div>
  );
}
