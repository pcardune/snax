const spec = {
  Goal: [['Expr']],
  Expr: [['Term', 'ExprP']],
  ExprP: [['+', 'Term', 'ExprP'], ['-', 'Term', 'ExprP'], []],
  Term: [['Factor', 'TermP']],
  TermP: [['*', 'Factor', 'TermP'], ['/', 'Factor', 'TermP'], []],
  Factor: [['(', 'Expr', ')'], ['num'], ['name']],
};

export default spec;
