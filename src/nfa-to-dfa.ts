/**
 * Implementation of Algorithm 3.20 from the dragon book (p. 153):
 *
 *    Subset Construction of a DFA (Deterministic Finite Automata)
 *    from and NFA (Nondeterministic Finite Automata)
 *
 */

import { ConstSet, MultiSet, NumberSet } from './sets';

export type NFAData = StateData[];

/**
 * A state is a list of edges. If a state has no edges,
 * it is considered "accepting"
 */
export type StateData = EdgeData[];

export type EdgeData = [
  /**
   * A single character, or the empty string (epsilon)
   */
  string,

  /**
   * Pointer to the next state, which is represented as an
   * index in the NFA's list of states
   */
  number
];

// type StateId = number;

export class NFA {
  states: NFAState<number>[] = [];
  startId: number = 0;
  constructor(data: NFAData) {
    for (let i = 0; i < data.length; i++) {
      let edgeData = data[i];
      let edges: Edge<number>[] = [];
      for (let j = 0; j < edgeData.length; j++) {
        let [label, nextState] = edgeData[j];
        if (nextState >= data.length || nextState < 0) {
          throw new Error(
            `State ${i} containing edge ${j} that points to non-existent state: ${nextState}`
          );
        }
        edges.push(new Edge(label, nextState));
      }

      this.states.push(new NFAState(i, edges));
    }
  }

  private getStateById(stateId: number): NFAState<number> {
    return this.states[stateId];
  }

  edges(stateId: number): Edge<number>[] {
    return this.getStateById(stateId).edges;
  }
}

class NFAState<StateId> {
  id: StateId;
  edges: Edge<StateId>[];
  constructor(id: StateId, edges: Edge<StateId>[]) {
    this.id = id;
    this.edges = edges;
  }
  isAccepting() {}
}

class DFAState<StateId> {
  id: StateId;
  edges: Record<string, StateId>;
  constructor(id: StateId, edges: Record<string, StateId>) {
    this.id = id;
    this.edges = edges;
  }
}

class Edge<StateId> {
  label: string;
  nextState: StateId;
  constructor(label: string, nextState: StateId) {
    this.label = label;
    this.nextState = nextState;
  }
  isEpsilon(): boolean {
    return this.label == '';
  }
}

/**
 * Get the set of all the labels used on all the edges
 * in the NFA graph
 */
export function getInputAlphabet(nfa: NFA): Set<string> {
  let set: Set<string> = new Set();
  for (const state of nfa.states) {
    for (const edge of state.edges) {
      if (!edge.isEpsilon()) {
        set.add(edge.label);
      }
    }
  }
  return set;
}

/**
 * e-closure(s)
 *
 * "Set of NFA states reachable from NFA state s
 * on epsilon transitions alone."
 *
 * a.k.a: Starting from the given state, traverse the graph
 * to find all the states you can get to via edges labeled with
 * epsilon.
 *
 * Note that it will always include the passed in state
 * because a state can trasition to itself via an epsilon
 *
 * @internal
 */
export function epsilonClosure(nfa: NFA, stateId: number): Set<number> {
  let visited: Set<number> = new Set();
  let notVisited: Set<number> = new Set([stateId]);
  while (notVisited.size > 0) {
    let current = notVisited.values().next().value;
    notVisited.delete(current);
    visited.add(current);

    for (const edge of nfa.edges(current)) {
      if (edge.isEpsilon()) {
        if (!visited.has(edge.nextState)) {
          notVisited.add(edge.nextState);
        }
      }
    }
  }
  return visited;
}

/**
 * e-closure(T)
 *
 * Set of NFA states reachable from some NFA state s
 * in set T on epsilon transitions alone
 */
export function multiEpsilonClosure(
  nfa: NFA,
  T: ConstSet<number>
): Set<number> {
  let closure: Set<number> = new Set();
  for (const stateId of T) {
    for (const id of epsilonClosure(nfa, stateId)) {
      closure.add(id);
    }
  }
  return closure;
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
  nfa: NFA,
  startStates: ConstSet<number>,
  label: string
): Set<number> {
  let set: Set<number> = new Set();
  for (const stateId of startStates) {
    for (const edge of nfa.edges(stateId)) {
      if (edge.label == label) {
        set.add(edge.nextState);
      }
    }
  }
  return set;
}

export function getDStates(
  nfa: NFA
): [string, Record<string, DFAState<string>>] {
  let alpha = getInputAlphabet(nfa);
  let visited: MultiSet = new MultiSet();
  let notVisited: MultiSet = new MultiSet([
    new NumberSet(epsilonClosure(nfa, nfa.startId)),
  ]);
  let Dtrans: Record<string, DFAState<string>> = {};

  let startId: string = '';
  for (let T = notVisited.pop(); T != undefined; T = notVisited.pop()) {
    let THash = T.hash();
    if (T.has(nfa.startId)) {
      startId = THash;
    }
    notVisited.delete(T);
    visited.add(T);
    for (const symbol of alpha) {
      const U = new NumberSet(multiEpsilonClosure(nfa, move(nfa, T, symbol)));
      if (!visited.has(U) && !notVisited.has(U)) {
        notVisited.add(U);
      }
      if (!Dtrans[THash]) {
        Dtrans[THash] = new DFAState(THash, {});
      }
      Dtrans[THash].edges[symbol] = U.hash();
    }
  }
  return [startId, Dtrans];
}

export class DFA {
  startId: string;
  states: Record<string, DFAState<string>> = {};
  private constructor(
    startId: string,
    states: Record<string, DFAState<string>>
  ) {
    this.states = states;
    this.startId = startId;
  }
  static fromNFA(nfa: NFA) {
    const [startId, states] = getDStates(nfa);
    return new DFA(startId, states);
  }
}
