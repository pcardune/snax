export enum SymbolKind {
  TERMINAL,
  NONTERMINAL,
}
export type NonTerminal = Symbol<SymbolKind.NONTERMINAL>;
export type Terminal = Symbol<SymbolKind.TERMINAL>;

export function terminal(key: string): Terminal {
  return new Symbol(SymbolKind.TERMINAL, key);
}
export function nonTerminal(key: string): NonTerminal {
  return new Symbol(SymbolKind.NONTERMINAL, key);
}

export class Symbol<T extends SymbolKind = SymbolKind> {
  readonly kind: T;
  readonly key: string;
  constructor(kind: T, key: string) {
    this.kind = kind;
    this.key = key;
  }
  equals(other: Symbol<SymbolKind>) {
    return this.kind == other.kind && this.key == other.key;
  }
  toString() {
    if (this.kind == SymbolKind.TERMINAL) {
      return `'${this.key}'`;
    }
    return this.key;
  }
}

export class Grammar {
  private productions: { [index: string]: Production[] } = {};

  addProduction(production: Production) {
    const key = production.nonTerminal.key;
    if (!this.productions[key]) {
      this.productions[key] = [];
    }
    this.productions[key].push(production);
  }

  removeProduction(production: Production) {
    const key = production.nonTerminal.key;
    if (this.productions[key]) {
      this.productions[key] = this.productions[key].filter(
        (p) => !p.equals(production)
      );
    }
  }

  addProductions(nonTerminal: NonTerminal, derivations: Symbol[][]) {
    for (const derivation of derivations) {
      this.addProduction(new Production(nonTerminal, derivation));
    }
  }
  *productionsIter() {
    for (const key in this.productions) {
      for (const production of this.productions[key]) {
        yield production;
      }
    }
  }
  productionsFrom(nonTerminal: NonTerminal): Iterable<Production> {
    return this.productions[nonTerminal.key];
  }
  getNonTerminals(): Readonly<NonTerminal[]> {
    let nonTerminals: NonTerminal[] = [];
    for (const key in this.productions) {
      nonTerminals.push(this.productions[key][0].nonTerminal);
    }
    return nonTerminals;
  }
  toString() {
    let out = '\n';
    for (const key in this.productions) {
      const productions = this.productions[key];
      out += `${productions[0].nonTerminal.key} ->\n`;
      for (const production of productions) {
        out += '  | ';
        out += production.symbols.map((s) => s.toString()).join(' ');
        out += '\n';
      }
    }
    return out;
  }
}

export class Production {
  readonly nonTerminal: NonTerminal;
  readonly symbols: Readonly<Symbol[]>;
  constructor(nonTerminal: NonTerminal, symbols: Symbol[]) {
    this.nonTerminal = nonTerminal;
    this.symbols = symbols;
  }

  isLeftRecursive(): boolean {
    return this.symbols[0].equals(this.nonTerminal);
  }

  equals(other: Production): boolean {
    if (!this.nonTerminal.equals(other.nonTerminal)) {
      return false;
    }
    if (this.symbols.length != other.symbols.length) {
      return false;
    }
    for (let i = 0; i < this.symbols.length; i++) {
      if (!this.symbols[i].equals(other.symbols[i])) {
        return false;
      }
    }
    return true;
  }

  toString(): string {
    return `${this.nonTerminal.toString()} -> ${this.symbols
      .map((s) => s.toString())
      .join(' ')}`;
  }
}
