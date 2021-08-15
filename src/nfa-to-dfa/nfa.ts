import { Table } from '../data-structures';
import { DefaultTable } from '../data-structures/table';
import { IHaveDebugStr } from '../debug';
import { toCharCode } from './util';

export interface ConstNFA extends IHaveDebugStr {
  /**
   * Get all the states you can get to by traversing from the start state via
   * the given character in the alphabet
   */
  getNextStates(startState: number, alphaIndex: number): ReadonlySet<number>;

  /**
   * Returns whether or not this state is the error state
   */
  isErrorState(state: number): boolean;

  /**
   * Returns the error state
   */
  getErrorState(): number;

  /**
   * Returns whether or not this state is an accepting
   */
  isAcceptingState(state: number): boolean;

  /**
   * Returns the alphabet for this NFA
   */
  getAlphabet(): Readonly<number[]>;

  /**
   * Get the index within the alphabet where the
   * given charcode lies.
   */
  getAlphabetIndex(charCode: number): number;

  /**
   * Get the number of states
   */
  readonly numStates: number;

  /**
   * Get the start state of the nfa;
   */
  getStartState(): number;
}

export interface MutNFA extends ConstNFA {
  /**
   * Adds a new state to the transition table.
   *
   * This corresponds to adding a row to the transition table.
   * Each
   * @param accepting Whether or not this state should be considered "accepting"
   * @returns the index of the newly added state.
   */
  addState(accepting: boolean): number;

  /**
   * Set whether or not the given state should be accepting
   */
  setAccepting(state: number, accepting: boolean): void;

  /**
   * Add the given charCode to the alphabet if it's not already there.
   *
   * @param charCode character code for the alphabet item
   * @returns the index of the character in the alphabet
   */
  addAlpha(charCode: number | string): number;

  /**
   * Add a labeled edge between states in the nfa.
   *
   * @param fromState index of the state the edge starts from
   * @param toState index of the state the edge goes to
   * @param alphaIndex index of the alphabet item the state should transition on
   */
  addEdge(fromState: number, toState: number, alphaIndex: number): void;

  /**
   * Sets the start state of the nfa
   */
  setStartState(state: number): void;
}

export class NewNFA implements MutNFA {
  /**
   * Index of the error state
   */
  static readonly ERROR_STATE = -1;

  // /**
  //  * Index of the "other" column in the alphabet
  //  */
  // static readonly OTHER_ALPHA_INDEX = 0;

  // /**
  //  * Value of the "other" char in the alphabet
  //  */
  // static readonly OTHER_CHAR = -1;

  // mapping from state to whether or not it is accepting
  private readonly accepting: boolean[] = [];

  // the table of edges from one state to another state.
  // Each row of the table is a state, and each column
  // of the table is the state you get to via the label
  // at that index
  private readonly states: DefaultTable<Set<number>> = DefaultTable.init(
    0,
    0,
    () => new Set()
  );
  private readonly alphabet: number[] = [];

  private startState: number = NewNFA.ERROR_STATE;

  getAlphabet() {
    return this.alphabet;
  }

  getAlphabetIndex(charCode: number) {
    return this.alphabet.indexOf(charCode);
  }

  getErrorState() {
    return NewNFA.ERROR_STATE;
  }
  getStartState() {
    return this.startState;
  }
  setStartState(state: number) {
    if (state < 0 || state >= this.numStates) {
      throw new Error(`IndexError: ${state} is not a valid startState`);
    }
    this.startState = state;
  }

  get numStates() {
    return this.states.numRows;
  }

  /**
   * Adds a new state to the transition table.
   *
   * This corresponds to adding a row to the transition table.
   * Each
   * @returns the index of the newly added state.
   */
  addState(): number {
    this.states.addRow();
    this.accepting.push(false);
    return this.states.numRows - 1;
  }

  /**
   * Add the given charCode to the alphabet.
   *
   * This will also add a corresponding column to the edges table.
   * @param charCode character code for the alphabet item
   * @returns the index of the character in the alphabet
   */
  addAlpha(charCode: number | string): number {
    charCode = toCharCode(charCode);
    const existingIndex = this.alphabet.indexOf(charCode);
    if (existingIndex >= 0) {
      return existingIndex;
    }
    this.states.addCol();
    this.alphabet.push(charCode);
    return this.alphabet.length - 1;
  }
  /**
   *
   * @param fromState index of the state the edge starts from
   * @param toState index of the state the edge goes to
   * @param alphaIndex index of the alphabet item the state should transition on
   */
  addEdge(fromState: number, toState: number, alphaIndex: number) {
    if (fromState < 0 || fromState >= this.states.numRows) {
      throw new Error(
        `IndexError: fromState ${fromState} is not valid. Must be < ${this.states.numRows}`
      );
    }
    if (
      toState != NewNFA.ERROR_STATE &&
      (toState < 0 || toState >= this.states.numRows)
    ) {
      throw new Error(
        `IndexError: toState ${toState} is not valid. Must be < ${this.states.numRows} or ERROR_STATE`
      );
    }
    if (alphaIndex < 0 || alphaIndex >= this.alphabet.length) {
      throw new Error(
        `IndexError: alphaIndex ${alphaIndex} is not valid. Must be < ${this.alphabet.length}`
      );
    }
    this.states.getCell(fromState, alphaIndex).add(toState);
  }

  isErrorState(state: number) {
    return state == NewNFA.ERROR_STATE;
  }

  isAcceptingState(state: number) {
    return this.accepting[state];
  }

  setAccepting(state: number, accepting: boolean) {
    this.accepting[state] = accepting;
  }

  getNextStates(startState: number, alphaIndex: number): ReadonlySet<number> {
    return this.states.getCell(startState, alphaIndex);
  }

  toDebugStr(): string {
    const table: DefaultTable<string> = DefaultTable.init(
      1 + this.numStates,
      1 + this.alphabet.length,
      () => ''
    );
    table.setCell(0, 0, 'δ');

    for (let ai = 0; ai < this.alphabet.length; ai++) {
      let alphaLabel = String.fromCharCode(this.alphabet[ai]);
      // ai == NewNFA.OTHER_ALPHA_INDEX
      //   ? 'other'
      //   : String.fromCharCode(this.alphabet[ai]);
      table.setCell(0, ai + 1, alphaLabel);
    }
    const stateLabel = (s: number) => {
      let out = 's' + s;
      if (this.isAcceptingState(s)) {
        out = '*' + out;
      }
      if (s == this.startState) {
        out = '>' + out;
      }
      return out;
    };

    for (let si = 0; si < this.states.numRows; si++) {
      table.setCell(si + 1, 0, stateLabel(si) + `:`);
      for (let ai = 0; ai < this.alphabet.length; ai++) {
        const nextStates = this.getNextStates(si, ai);
        let label = '';
        if (nextStates.size == 0) {
          label = 'se';
        } else {
          label = [...nextStates].map(stateLabel).join(',');
        }
        table.setCell(si + 1, ai + 1, label);
      }
    }
    return table.toDebugStr();
  }
}

/**
 * compute the closure for an nfa.
 *
 * @param nfa nfa to compute the closure over
 * @param startStates start states to begin the traversal from
 * @param label alphabet index to match while traversing
 * @returns the set of states reachable from the given start
 * states by only traversing edges for the given alpha
 */
export function closure(
  nfa: ConstNFA,
  startStates: Iterable<number>,
  label: number
): Set<number> {
  let visited: Set<number> = new Set();
  let toVisit = new Set([...startStates]);

  while (true) {
    let next = toVisit.values().next();
    if (next.done) {
      break;
    }
    let current: number = next.value;
    toVisit.delete(current);
    visited.add(current);

    for (const nextState of nfa.getNextStates(current, label)) {
      if (!visited.has(nextState)) {
        toVisit.add(nextState);
      }
    }
  }
  return visited;
}

/**
 * move(T,a)
 *
 * Set of NFA states to which there is a transition on
 * input symbol a from some state s in T.
 *
 * a.k.a, for all the states in T, find the the set of states
 * you can get to via an edge with the given label
 */
export function move(
  nfa: ConstNFA,
  startStates: Iterable<number>,
  label: number
): Set<number> {
  let set: Set<number> = new Set();
  for (const stateId of startStates) {
    for (const nextState of nfa.getNextStates(stateId, label)) {
      set.add(nextState);
    }
  }
  return set;
}
