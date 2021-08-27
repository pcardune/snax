import { buildGrammar } from '../../grammar/grammar';
import { useDSLGrammar } from '../hooks/useDSLGrammar';
import { GrammarTable } from './GrammarTable';
import { LexerTable } from './LexerTable';

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

  return (
    <div>
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
