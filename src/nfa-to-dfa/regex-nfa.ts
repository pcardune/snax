/**
 * This file implements the McNaughton-Yamada-Thompson algorithm
 * for converting regular expressions to NFAs. You can find a
 * description in Section 3.7.4 of the dragon book (p. 159):
 * "Construction of an NFA from a Regular Expression" in
 */

import { ConstNFA, NewNFA } from './nfa';
import { toCharCode } from './util';

export interface ConstRegexNFA extends ConstNFA {
  getAcceptingState(): number;
}

const EPSILON_CHAR_CODE = -1;

abstract class RegexNFA extends NewNFA implements ConstRegexNFA {
  private acceptingState: number = -1;

  getAcceptingState(): number {
    return this.acceptingState;
  }

  /**
   * Regex NFAs can only have one accepting state at a time,
   * so override the setAccepting method to enforce this
   */
  override setAccepting(state: number, accepting: boolean) {
    super.setAccepting(state, accepting);
    if (accepting) {
      if (this.acceptingState != -1) {
        super.setAccepting(this.acceptingState, false);
      }
      this.acceptingState = state;
    }
  }

  /**
   * add alphabet from another regex nfa to this one,
   * and return an array mapping the indexes from the other
   * alphabet to the new indexes in this alphabet
   */
  private addAlphabetFrom(right: ConstRegexNFA): number[] {
    const rightAlpha = right.getAlphabet();
    let rightAlphaMap: number[] = [];
    for (let ai = 0; ai < rightAlpha.length; ai++) {
      rightAlphaMap.push(this.addAlpha(rightAlpha[ai]));
    }
    return rightAlphaMap;
  }

  /**
   * add states from right nfa to this nfa, and return an
   * array mapping the the indexes from the other states
   * to the new states.
   */
  private addStatesFrom(right: ConstRegexNFA): number[] {
    let rightStateMap: number[] = [];
    for (let si = 0; si < right.numStates; si++) {
      rightStateMap.push(this.addState());
    }
    return rightStateMap;
  }

  private addEdgesFrom(
    right: ConstRegexNFA,
    rightStateMap: number[],
    rightAlphaMap: number[]
  ) {
    for (let si = 0; si < right.numStates; si++) {
      for (let ai = 0; ai < rightAlphaMap.length; ai++) {
        let nextStates = right.getNextStates(si, ai);
        for (const nextState of nextStates) {
          this.addEdge(
            rightStateMap[si],
            right.isErrorState(nextState)
              ? this.getErrorState()
              : rightStateMap[nextState],
            rightAlphaMap[ai]
          );
        }
      }
    }
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
    this.addEdge(this.getAcceptingState(), endState, epsilon);
    this.setAccepting(endState, true);

    // step 4: add alphabet from right to this nfa
    let rightAlphaMap = this.addAlphabetFrom(right);

    // step 5: add states from right to this nfa
    let rightStateMap = this.addStatesFrom(right);

    // step 6: add edges from right to this nfa
    this.addEdgesFrom(right, rightStateMap, rightAlphaMap);

    // step 7: connect new start state to start state of right via epsilon
    // and connect accepting state of right to new accepting state via epsilon
    this.addEdge(startState, rightStateMap[right.getStartState()], epsilon);
    this.addEdge(rightStateMap[right.getAcceptingState()], endState, epsilon);

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
    this.addEdge(this.acceptingState, rightStateMap[0], epsilon);
    this.setAccepting(rightStateMap[right.getAcceptingState()], true);
    return this;
  }

  star(): this {
    const oldStartState = this.getStartState();
    const oldEndState = this.getAcceptingState();

    // step 0: add epsilon to the alphabet if its not already in there.
    let epsilon = this.addAlpha(EPSILON_CHAR_CODE);

    // step 1: create a new start and end states
    const startState = this.addState();
    this.setStartState(startState);
    const endState = this.addState();
    this.setAccepting(endState, true);

    // step 2: connect new start state to old state state and new end state via epsilon
    this.addEdge(startState, oldStartState, epsilon);
    this.addEdge(startState, endState, epsilon);

    // step 3: connect old end state to old start state and new end state
    this.addEdge(oldEndState, oldStartState, epsilon);
    this.addEdge(oldEndState, endState, epsilon);

    return this;
  }
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
