/**
 * This file implements the McNaughton-Yamada-Thompson algorithm
 * for converting regular expressions to NFAs. You can find a
 * description in Section 3.7.4 of the dragon book (p. 159):
 * "Construction of an NFA from a Regular Expression" in
 */
import { collect, map, range } from '../iter';
import {
  NFA,
  state,
  edge,
  EPSILON,
  Label,
  label,
  Edge,
  NFAState,
} from '../nfa-to-dfa';
import { RNode, NodeKind, OrNode, StarNode } from './parser';

/**
 * Construct an NFA that matches the specified character.
 *
 * ASSUMPTIONS:
 * all NFA's start with state 0
 * all NFA's end with the last state, which has no edges
 */
export function labelNFA<D>(
  labelOrChar: Label | string,
  data?: D
): NFA<D | undefined> {
  if (typeof labelOrChar == 'string') {
    labelOrChar = label(labelOrChar);
  }
  return new NFA([
    state(0, false, [edge(labelOrChar, 1)], data),
    state(1, true, [], data),
  ]);
}

/**
 * Construct an NFA that matches any ASCII character except
 * \n and \r. This corresponds to the "." operator of
 * javascript regexes.
 */
export function anyCharNFA<D>(data?: D): NFA<D | undefined> {
  let edges: Edge<number>[] = [];
  const except = ['\n'.charCodeAt(0), '\r'.charCodeAt(0)];
  for (let i = 1; i <= 127; i++) {
    if (except.indexOf(i) == -1) {
      edges.push(edge(label(i), 1));
    }
  }
  return new NFA([state(0, false, edges, data), state(1, true, [], data)]);
}

/**
 * Generat a list of states where the states' ids are offset by the given
 * startIndex
 * @param nfa The nfa whose states should be traversed
 * @param startIndex What to offset the indexs by.
 * @internal
 */
export function reindexed<D>(nfa: NFA<D>, startIndex: number): NFAState<D>[] {
  return nfa.states.map((s) => {
    const edges = s.edges.map((e) => edge(e.label, e.nextState + startIndex));
    return state(s.id + startIndex, s.isAccepting(), edges, s.data);
  });
}

/**
 * Construct an nfa that matches either the left nfa or the right nfa.
 * This is equivalent to the the "|" operator in standard regexes.
 * This is only guaranteed to work for nfa generated via the
 * McNaughton-Yamada-Thompson algorithm.
 */
export function orNFA<D>(
  left: NFA<D>,
  right: NFA<D>,
  data?: D
): NFA<D | undefined> {
  let leftStartId = 1;
  let leftStates = reindexed(left, leftStartId);

  let rightStartId = leftStartId + leftStates.length;
  let rightStates = reindexed(right, rightStartId);

  let startState = state(
    0,
    false,
    [edge(EPSILON, leftStartId), edge(EPSILON, rightStartId)],
    data
  );

  let endStateId = rightStartId + rightStates.length;
  let endState = state(endStateId, true, [], data);

  leftStates[leftStates.length - 1].accepting = false;
  leftStates[leftStates.length - 1].edges = [edge(EPSILON, endStateId)];

  rightStates[rightStates.length - 1].accepting = false;
  rightStates[rightStates.length - 1].edges = [edge(EPSILON, endStateId)];

  let states = [startState, ...leftStates, ...rightStates, endState];
  return new NFA(states);
}

function multiOrNFA<D>(nfas: NFA<D>[], data?: D): NFA<D | undefined> {
  let last: NFA<D | undefined> = nfas[0];
  for (let i = 1; i < nfas.length; i++) {
    last = orNFA(last, nfas[i]);
  }
  return last;
}

/**
 * Construct an NFA that matches the left nfa followed by the right nfa.
 * This is only guaranteed to work for nfa generated via the
 * McNaughton-Yamada-Thompson algorithm.
 */
export function concatNFA<D>(left: NFA<D>, right: NFA<D>): NFA<D> {
  let leftStates = left.states;

  let rightStartId = leftStates.length - 1;
  let rightStates = reindexed(right, rightStartId);
  leftStates.pop();
  let states = [...leftStates, ...rightStates];
  return new NFA(states);
}

/**
 * Construct an nfa that matches the given string.
 */
export function stringNFA<D>(chars: string, data?: D): NFA<D | undefined> {
  let prev = labelNFA(chars[0], data);
  for (let i = 1; i < chars.length; i++) {
    prev = concatNFA(prev, labelNFA(chars[i], data));
  }
  return prev;
}

/**
 * construct an nfa that matches the given nfa 0 or more times.
 * This is equivalent to the the "*" operator in standard regexes.
 * This is only guaranteed to work for nfa generated via the
 * McNaughton-Yamada-Thompson algorithm.
 */
export function starNFA<D>(
  nfa: NFA<D | undefined>,
  data?: D
): NFA<D | undefined> {
  let states = reindexed(nfa, 1);
  let endStateId = 1 + states.length;
  let startState = state(
    0,
    false,
    [edge(EPSILON, 1), edge(EPSILON, endStateId)],
    data
  );
  states.pop();
  states.push(
    state(
      endStateId - 1,
      false,
      [edge(EPSILON, endStateId), edge(EPSILON, 1)],
      data
    )
  );
  let endState = state(endStateId, true, [], data);
  states = [startState, ...states, endState];
  return new NFA(states);
}

export enum CharacterClass {
  DIGIT = 'd',
  ALPHANUMBERIC = 'w',
}

export function charClassNFA<D>(
  charClass: CharacterClass,
  data?: D
): NFA<D | undefined> {
  const digits = '0123456789';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = lower.toUpperCase();
  const alphaNumeric = digits + lower + upper + '_';

  let validChars: string;

  switch (charClass) {
    case CharacterClass.DIGIT:
      validChars = digits;
      break;
    case CharacterClass.ALPHANUMBERIC:
      validChars = alphaNumeric;
      break;
  }
  return multiOrNFA(validChars.split('').map((char) => labelNFA(char, data)));
}

/**
 * Construct an nfa from a node within a regex parse tree.
 */
export function nfaForNode<D>(node: RNode, data?: D): NFA<D | undefined> {
  return node.nfa(data);
}
