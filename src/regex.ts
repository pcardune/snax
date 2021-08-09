import { NFA, state, edge, EPSILON, Label, NFAState } from './nfa-to-dfa';

/**
 * ASSUMPTIONS:
 * all NFA's start with state 0
 * all NFA's end with the last state, which has no edges
 */

export function labelNFA(label: Label): NFA {
  return new NFA([state(0, false, [edge(label, 1)]), state(1, true, [])]);
}

export function reindexed(nfa: NFA, startIndex: number) {
  return nfa.states.map((s) => {
    const edges = s.edges.map((e) => edge(e.label, e.nextState + startIndex));
    return state(s.id + startIndex, s.isAccepting(), edges);
  });
}

export function orNFA(left: NFA, right: NFA): NFA {
  let leftStartId = 1;
  let leftStates = reindexed(left, leftStartId);

  let rightStartId = leftStartId + leftStates.length;
  let rightStates = reindexed(right, rightStartId);

  let startState = state(0, false, [
    edge(EPSILON, leftStartId),
    edge(EPSILON, rightStartId),
  ]);

  let endStateId = rightStartId + rightStates.length;
  let endState = state(endStateId, true, []);

  leftStates[leftStates.length - 1].accepting = false;
  leftStates[leftStates.length - 1].edges = [edge(EPSILON, endStateId)];

  rightStates[rightStates.length - 1].accepting = false;
  rightStates[rightStates.length - 1].edges = [edge(EPSILON, endStateId)];

  let states = [startState, ...leftStates, ...rightStates, endState];
  return new NFA(states);
}

export function concatNFA(left: NFA, right: NFA): NFA {
  let leftStates = left.states;

  let rightStartId = leftStates.length - 1;
  let rightStates = reindexed(right, rightStartId);
  leftStates.pop();
  let states = [...leftStates, ...rightStates];
  return new NFA(states);
}

export function starNFA(nfa: NFA): NFA {
  let states = reindexed(nfa, 1);
  let endStateId = 1 + states.length;
  let startState = state(0, false, [
    edge(EPSILON, 1),
    edge(EPSILON, endStateId),
  ]);
  states.pop();
  states.push(
    state(endStateId - 1, false, [edge(EPSILON, endStateId), edge(EPSILON, 1)])
  );
  let endState = state(endStateId, true, []);
  states = [startState, ...states, endState];
  return new NFA(states);
}
