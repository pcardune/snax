import { HashMap, HashSet } from '../sets';
import {
  Grammar,
  nonTerminal,
  Production,
  EPSILON,
  Symbol,
  EOF,
} from './grammar';

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

class DefaultHashMap<K, V> extends HashMap<K, V> {
  private getDefault: () => V;
  constructor(hasher: (k: K) => string, getDefault: () => V) {
    super(hasher);
    this.getDefault = getDefault;
  }
  override get(key: K): V {
    const value = super.get(key);
    if (value != undefined) {
      return value;
    }
    return this.getDefault();
  }
}

/**
 * TODO: this needs to be finished
 * p. 104 of Engineering a Compiler
 */
export function calcFirst(grammar: Grammar) {
  let hasher = (s: Symbol) => s.hash();
  const set = (items?: Symbol[]) => new HashSet(hasher, items);
  let first: DefaultHashMap<Symbol, HashSet<Symbol>> = new DefaultHashMap(
    hasher,
    set
  );

  // step 1: add terminals and ϵ and EOF
  for (const symbol of grammar.getTerminals()) {
    first.set(symbol, set([symbol as Symbol]));
  }
  first.set(EOF, set([EOF as Symbol]));
  first.set(EPSILON, set([EPSILON as Symbol]));

  // step 2: initialize non-terminals with empty set
  for (const symbol of grammar.getNonTerminals()) {
    first.set(symbol, set());
  }

  // step 3:
  let needsWork = true;
  while (needsWork) {
    needsWork = false;
    for (const A of grammar.productionsIter()) {
      const B = A.symbols;
      if (B.length > 0) {
        let rhs = set([...first.get(B[0]).values()]);
        rhs.delete(EPSILON);
        let i = 0;
        while (first.get(B[i]).has(EPSILON) && i < B.length - 1) {
          let temp = first.get(B[i + 1]);
          temp.delete(EPSILON);
          for (const value of temp) {
            rhs.add(value);
          }
          i++;
        }
        if (i == B.length - 1 && first.get(B[B.length - 1]).has(EPSILON)) {
          rhs.add(EPSILON);
        }
        let firstA = first.get(A.nonTerminal);
        for (const rh of rhs) {
          firstA.add(rh);
        }
      }
    }
  }
  return first;
}
