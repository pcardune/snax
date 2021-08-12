import {
  Grammar,
  nonTerminal,
  Production,
  Symbol,
  SymbolKind,
} from './grammar';

class EpsilonSymbol extends Symbol<SymbolKind.TERMINAL> {
  constructor() {
    super(SymbolKind.TERMINAL, '');
  }
  override toString() {
    return 'ϵ';
  }
}
const EPSILON = new EpsilonSymbol();

export function removeDirectLeftRecursion(grammar: Grammar) {
  const NTs = grammar.getNonTerminals();
  for (const nt of NTs) {
    let isLeftRecursive = false;
    for (const p of grammar.productionsFrom(nt)) {
      if (p.isLeftRecursive()) {
        isLeftRecursive = true;
      }
    }
    if (isLeftRecursive) {
      const ntPrime = nonTerminal(nt.key + "'");
      for (const p of grammar.productionsFrom(nt)) {
        if (p.isLeftRecursive()) {
          grammar.removeProduction(p);
          grammar.addProduction(
            new Production(ntPrime, [...p.symbols.slice(1), ntPrime])
          );
        } else {
          grammar.removeProduction(p);
          grammar.addProduction(
            new Production(p.nonTerminal, [...p.symbols, ntPrime])
          );
        }
      }
      grammar.addProduction(new Production(ntPrime, [EPSILON]));
    }
  }
}

export function removeIndirectLeftRecursion(sourceGrammar: Grammar): Grammar {
  let A = sourceGrammar.getNonTerminals(); // A
  console.log(
    'non terminals:',
    A.map((s) => s.key)
  );
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < i - 1; j++) {
      console.log('Processing', A[i].toString());
      // if there exists a production from A[i] => A[j]y
      for (const Ai of sourceGrammar.productionsFrom(A[i])) {
        if (Ai.symbols[0].key == A[j].key) {
          // then replace it with the expansions of A[j]
          console.log('replacing', Ai.toString());
          sourceGrammar.removeProduction(Ai);
          for (const Aj of sourceGrammar.productionsFrom(A[j])) {
            sourceGrammar.addProduction(
              new Production(A[i], [...Aj.symbols, ...Ai.symbols.slice(1)])
            );
          }
        }
      }
    }
  }
  return sourceGrammar;
}
