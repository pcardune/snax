import {
  NFA,
  state,
  edge,
  EPSILON,
  Label,
  label,
  DFA,
  matchDFA,
} from './nfa-to-dfa';
import { Node, NodeKind, parseRegex } from './parser';

/**
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

export function reindexed<D>(nfa: NFA<D>, startIndex: number) {
  return nfa.states.map((s) => {
    const edges = s.edges.map((e) => edge(e.label, e.nextState + startIndex));
    return state(s.id + startIndex, s.isAccepting(), edges, s.data);
  });
}

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

export function concatNFA<D>(left: NFA<D>, right: NFA<D>): NFA<D> {
  let leftStates = left.states;

  let rightStartId = leftStates.length - 1;
  let rightStates = reindexed(right, rightStartId);
  leftStates.pop();
  let states = [...leftStates, ...rightStates];
  return new NFA(states);
}

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

export function nfaForNode<D>(node: Node, data?: D): NFA<D | undefined> {
  switch (node.kind) {
    case NodeKind.OR:
      return orNFA(
        nfaForNode(node.left, data),
        nfaForNode(node.right, data),
        data
      );
    case NodeKind.STAR:
      return starNFA(nfaForNode(node.child, data), data);
    case NodeKind.CONCAT:
      return concatNFA(
        nfaForNode(node.left, data),
        nfaForNode(node.right, data)
      );
    case NodeKind.PAREN:
      return nfaForNode(node.child, data);
    case NodeKind.CHAR:
      return labelNFA(label(node.char), data);
  }
}

export class Regex {
  pattern: string;
  private dfa: DFA<undefined[]>;
  constructor(pattern: string) {
    this.pattern = pattern;
    let node = parseRegex(this.pattern);
    let nfa = nfaForNode(node, undefined);
    this.dfa = DFA.fromNFA(nfa);
  }
  match(input: string) {
    return matchDFA(this.dfa, input);
  }
}
