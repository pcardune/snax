/**
 * This file implements the McNaughton-Yamada-Thompson algorithm
 * for converting regular expressions to NFAs. You can find a
 * description in Section 3.7.4 of the dragon book (p. 159):
 * "Construction of an NFA from a Regular Expression" in
 */

import { charCodes } from '../iter';
import { DFA, DFAFromNFA } from './dfa';
import { ConstNFA, NewNFA } from './nfa';
import { toCharCode } from './util';

export interface ConstRegexNFA extends ConstNFA {
  getOnlyAcceptingState(): number;
}

const EPSILON_CHAR_CODE = -1;

/**
 * Copy the alphabet from one nfa to another.
 *
 * @param source source nfa to copy the alphabet from
 * @param dest destination nfa to copy the alphabet to
 * @returns an array mapping the indeces from the source
 *          alphabet to the indices in the destination
 *          alphabet
 */
function addAlphabetFrom(source: ConstNFA, dest: NewNFA): number[] {
  const rightAlpha = source.getAlphabet();
  let rightAlphaMap: number[] = [];
  for (let ai = 0; ai < rightAlpha.length; ai++) {
    rightAlphaMap.push(dest.addAlpha(rightAlpha[ai]));
  }
  return rightAlphaMap;
}

/**
 * add states from right nfa to this nfa, and return an
 * array mapping the the indexes from the other states
 * to the new states.
 */
function addStatesFrom(source: ConstNFA, dest: NewNFA): number[] {
  let rightStateMap: number[] = [];
  for (let si = 0; si < source.numStates; si++) {
    rightStateMap.push(dest.addState());
  }
  return rightStateMap;
}

/**
 * Add edges from source NFA to dest NFA. This assumes that
 * you've already added the states and alphabet from source
 * to dest using addStatesFrom and addAlphabetFrom.
 *
 * @param source
 * @param dest
 * @param sourceStateMap
 * @param sourceAlphaMap
 */
function addEdgesFrom(
  source: ConstNFA,
  dest: NewNFA,
  sourceStateMap: number[],
  sourceAlphaMap: number[]
) {
  for (let si = 0; si < source.numStates; si++) {
    for (let ai = 0; ai < sourceAlphaMap.length; ai++) {
      let nextStates = source.getNextStates(si, ai);
      for (const nextState of nextStates) {
        dest.addEdge(
          sourceStateMap[si],
          source.isErrorState(nextState)
            ? dest.getErrorState()
            : sourceStateMap[nextState],
          sourceAlphaMap[ai]
        );
      }
    }
  }
}

class RegexNFA extends NewNFA implements ConstRegexNFA {
  getOnlyAcceptingState(): number {
    let acceptingState: number | undefined = undefined;
    for (let si = 0; si < this.numStates; si++) {
      if (this.isAcceptingState(si)) {
        if (acceptingState === undefined) {
          acceptingState = si;
        } else {
          throw new Error('Found multiple accepting states!');
        }
      }
    }
    if (acceptingState === undefined) {
      throw new Error("Didn't find an accepting state!");
    }
    return acceptingState;
  }

  /**
   * Regex NFAs should only have one accepting state at a time,
   * so add a method for ensuring that only one accepting state
   * has been set.
   * @param state the state that should be marked as accepting
   */
  setOnlyAcceptingState(state: number) {
    for (let si = 0; si < this.numStates; si++) {
      this.setAccepting(si, si == state);
    }
  }

  toDFA(): DFA {
    return DFA.fromNFA(this, this.getAlphabetIndex(EPSILON_CHAR_CODE));
  }

  override toDebugStr(): string {
    return super.toDebugStr({
      alphaLabel: (charCode) =>
        charCode == EPSILON_CHAR_CODE ? 'ϵ' : String.fromCharCode(charCode),
    });
  }

  /**
   * add alphabet from another regex nfa to this one,
   * and return an array mapping the indexes from the other
   * alphabet to the new indexes in this alphabet
   */
  private addAlphabetFrom(right: ConstRegexNFA): number[] {
    return addAlphabetFrom(right, this);
  }

  /**
   * add states from right nfa to this nfa, and return an
   * array mapping the the indexes from the other states
   * to the new states.
   */
  private addStatesFrom(right: ConstRegexNFA): number[] {
    return addStatesFrom(right, this);
  }

  private addEdgesFrom(
    right: ConstRegexNFA,
    rightStateMap: number[],
    rightAlphaMap: number[]
  ) {
    addEdgesFrom(right, this, rightStateMap, rightAlphaMap);
  }

  or(right: ConstRegexNFA): this {
    // step 0: add epsilon to the alphabet if its not already in there.
    let epsilon = this.addAlpha(EPSILON_CHAR_CODE);

    // step 2: add new start state that points to old start state via epsilon
    let startState = this.addState();
    this.addEdge(startState, this.getStartState(), epsilon);
    this.setStartState(startState);

    // step 3: add new accepting state and attach old accepting state to it via epsilon
    let endState = this.addState();
    this.addEdge(this.getOnlyAcceptingState(), endState, epsilon);
    this.setOnlyAcceptingState(endState);

    // step 4: add alphabet from right to this nfa
    let rightAlphaMap = this.addAlphabetFrom(right);

    // step 5: add states from right to this nfa
    let rightStateMap = this.addStatesFrom(right);

    // step 6: add edges from right to this nfa
    this.addEdgesFrom(right, rightStateMap, rightAlphaMap);

    // step 7: connect new start state to start state of right via epsilon
    // and connect accepting state of right to new accepting state via epsilon
    this.addEdge(startState, rightStateMap[right.getStartState()], epsilon);
    this.addEdge(
      rightStateMap[right.getOnlyAcceptingState()],
      endState,
      epsilon
    );

    return this;
  }

  concat(right: ConstRegexNFA): this {
    // step 1: add alphabet from right to this alphabet
    let rightAlphaMap = this.addAlphabetFrom(right);

    // step 2: add states from right to this nfa
    let rightStateMap = this.addStatesFrom(right);

    // step 3: add edges from right
    this.addEdgesFrom(right, rightStateMap, rightAlphaMap);

    // step 4: connect accepting state(s) of left to start state of right
    // via epsilon
    let epsilon = this.addAlpha(EPSILON_CHAR_CODE);
    this.addEdge(this.getOnlyAcceptingState(), rightStateMap[0], epsilon);
    this.setOnlyAcceptingState(rightStateMap[right.getOnlyAcceptingState()]);
    return this;
  }

  star(): this {
    const oldStartState = this.getStartState();
    const oldEndState = this.getOnlyAcceptingState();

    // step 0: add epsilon to the alphabet if its not already in there.
    let epsilon = this.addAlpha(EPSILON_CHAR_CODE);

    // step 1: create a new start and end states
    const startState = this.addState();
    this.setStartState(startState);
    const endState = this.addState();
    this.setOnlyAcceptingState(endState);

    // step 2: connect new start state to old state state and new end state via epsilon
    this.addEdge(startState, oldStartState, epsilon);
    this.addEdge(startState, endState, epsilon);

    // step 3: connect old end state to old start state and new end state
    this.addEdge(oldEndState, oldStartState, epsilon);
    this.addEdge(oldEndState, endState, epsilon);

    return this;
  }
}

function chars(validChars: string | Iterable<number>): ConstRegexNFA {
  if (typeof validChars == 'string') {
    validChars = charCodes(validChars);
  }
  const nfa = new RegexNFA();
  for (let charCode of validChars) {
    nfa.addAlpha(charCode);
  }
  let startState = nfa.addState();
  let endState = nfa.addState();
  nfa.setStartState(startState);
  nfa.setOnlyAcceptingState(endState);
  for (let ai = 0; ai < nfa.getAlphabet().length; ai++) {
    nfa.addEdge(startState, endState, ai);
  }
  return nfa;
}

const ASCII: number[] = [];
for (let i = 1; i <= 127; i++) {
  ASCII.push(i);
}
export function asciiChars(): ConstRegexNFA {
  return chars(ASCII);
}

export function notChars(
  invalidChars: string | Iterable<number>
): ConstRegexNFA {
  if (typeof invalidChars == 'string') {
    invalidChars = charCodes(invalidChars);
  }
  let invalid = [...invalidChars];
  return chars(ASCII.filter((c) => invalid.indexOf(c) == -1));
}

export class SingleCharNFA extends RegexNFA implements ConstRegexNFA {
  constructor(char: string | number) {
    super();
    char = toCharCode(char);
    let a = this.addAlpha(char);
    let s0 = this.addState();
    let s1 = this.addState();
    this.addEdge(s0, s1, a);
    this.setAccepting(s1, true);
    this.setStartState(s0);
  }
}

export class CombinedNFA extends NewNFA {
  /**
   * Mapping from the index of the source nfa
   * to the accepting state(s) that we got to
   * via that source
   */
  sourceNFAStateMap: number[][] = [];

  stateToSourceIndex: Map<number, number> = new Map();

  constructor(nfas: ConstNFA[]) {
    super();

    // step 1: add all the alphabets
    let alphaMaps: number[][] = [];
    for (const nfa of nfas) {
      alphaMaps.push(addAlphabetFrom(nfa, this));
    }
    // step 2: add states from each nfa
    let stateMaps: number[][] = [];
    for (const nfa of nfas) {
      stateMaps.push(addStatesFrom(nfa, this));
    }
    // step 3: add edges from each nfa
    for (const [i, nfa] of nfas.entries()) {
      addEdgesFrom(nfa, this, stateMaps[i], alphaMaps[i]);
    }

    // step 4: add new start state and epsilon alphabet
    const startState = this.addState();
    this.setStartState(startState);
    const epsilon = this.addAlpha(EPSILON_CHAR_CODE);

    // step 5: for each of the source nfas, do the following:
    //   1. connect start state to source nfa's start state via epsilon.
    //   2. for each accepting state in source nfa, make the corresponding
    //      state in the combined nfa accepting as well.
    //   3. add those accepting states to the source nfa state map so when
    //      we get to one of the accepting states, we know which source nfa
    //      was the cause for us getting there.
    for (const [ni, nfa] of nfas.entries()) {
      this.addEdge(startState, stateMaps[ni][nfa.getStartState()], epsilon);
      const accepting = [];
      for (let si = 0; si < nfa.numStates; si++) {
        const isAccepting = nfa.isAcceptingState(si);
        if (isAccepting) {
          this.setAccepting(stateMaps[ni][si], true);
          accepting.push(stateMaps[ni][si]);
          this.stateToSourceIndex.set(stateMaps[ni][si], ni);
        }
      }
      this.sourceNFAStateMap.push(accepting);
    }
    return this;
  }

  toDFA(): DFAFromNFA {
    return DFA.fromNFA(this, this.getAlphabetIndex(EPSILON_CHAR_CODE));
  }

  toCombinedDFA(): CombinedDFA {
    return new CombinedDFA(this);
  }

  override toDebugStr() {
    let out = `CombinedNFA:\n${super.toDebugStr()}\n`;
    for (const [i, states] of this.sourceNFAStateMap.entries()) {
      out += `${i}: [${states.join(',')}]\n`;
    }
    out += 'state to source nfa mapping:\n';
    for (const [si, sourceNFAIndex] of this.stateToSourceIndex.entries()) {
      out += `${si}: ${sourceNFAIndex}\n`;
    }
    return out;
  }
}

export class CombinedDFA {
  private dfa: DFAFromNFA;
  private dfaStateToSourceIndex: Map<number, number[]>;
  constructor(combinedNFA: CombinedNFA) {
    const dfa = combinedNFA.toDFA();
    const dfaStateToSourceIndex: Map<number, number[]> = new Map();

    for (let [state, sourceIndex] of combinedNFA.stateToSourceIndex.entries()) {
      const dfaStates = dfa.getStatesForSourceNFAState(state);
      for (const dfaState of dfaStates) {
        let indicesForDFAState = dfaStateToSourceIndex.get(dfaState);
        if (indicesForDFAState === undefined) {
          indicesForDFAState = [];
          dfaStateToSourceIndex.set(dfaState, indicesForDFAState);
        }
        indicesForDFAState.push(sourceIndex);
      }
    }

    this.dfa = dfa;
    this.dfaStateToSourceIndex = dfaStateToSourceIndex;
  }

  static fromNFAs(nfas: ConstNFA[]): CombinedDFA {
    return new CombinedDFA(new CombinedNFA(nfas));
  }

  match(
    input: Iterable<number>
  ): { substr: string; sourceIndeces: number[] } | null {
    let match = this.dfa.match(input);
    if (match) {
      const sourceIndex = this.dfaStateToSourceIndex.get(match.state);
      if (sourceIndex === undefined) {
        // this should never happen.
        throw new Error('Found match, but could not map it to source index');
      }
      return {
        substr: match.substr,
        sourceIndeces: sourceIndex,
      };
    }
    return null;
  }

  toDebugStr(): string {
    let out = 'CombinedDFA:\n';
    out += this.dfa.toDebugStr();
    out += '\n';
    out += 'Mapping from DFA state to source nfa index:\n';
    for (const [state, sourceIndeces] of this.dfaStateToSourceIndex.entries()) {
      out += `${state}: [${sourceIndeces.join(',')}]\n`;
    }
    return out;
  }
}
