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
        let newP: Production;
        if (p.isLeftRecursive()) {
          newP = new Production(ntPrime, [...p.symbols.slice(1), ntPrime]);
        } else {
          newP = new Production(p.nonTerminal, [...p.symbols, ntPrime]);
        }
        grammar.removeProduction(p);
        grammar.addProduction(newP);
      }
      if (grammar.productionsFrom(nt).length == 0) {
        grammar.addProduction(new Production(nt, [ntPrime]));
      }
      grammar.addProduction(new Production(ntPrime, [EPSILON]));
    }
  }
}

/**
 * Removes left recursion from a grammar.
 * See p. 103 of "Engineering a Compiler"
 */
export function removeLeftRecursion(sourceGrammar: Grammar): Grammar {
  let A = sourceGrammar.getNonTerminals(); // A
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < i; j++) {
      // if there exists a production from A[i] => A[j]y
      for (const Ai of sourceGrammar.productionsFrom(A[i])) {
        if (Ai.symbols[0].key == A[j].key) {
          // then replace it with the expansions of A[j]
          sourceGrammar.removeProduction(Ai);
          for (const Aj of sourceGrammar.productionsFrom(A[j])) {
            const newAi = new Production(A[i], [
              ...Aj.symbols,
              ...Ai.symbols.slice(1),
            ]);
            sourceGrammar.addProduction(newAi);
            console.log('replacing', Ai.toString(), 'with', newAi.toString());
          }
        }
      }
    }
    removeDirectLeftRecursion(sourceGrammar);
  }
  return sourceGrammar;
}
