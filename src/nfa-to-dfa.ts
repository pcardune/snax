/**
 * Implementation of Algorithm 3.20 from the dragon book (p. 153):
 *
 *    Subset Construction of a DFA (Deterministic Finite Automata)
 *    from and NFA (Nondeterministic Finite Automata)
 *
 */

import { ConstSet, MultiSet, NumberSet } from './sets';

export class NFA<D> {
  readonly states: NFAState<D>[] = [];
  readonly startId: number = 0;
  constructor(states: NFAState<D>[]) {
    for (let i = 0; i < states.length; i++) {
      let state = states[i];
      for (let j = 0; j < state.edges.length; j++) {
        const edge = state.edges[j];
        if (edge.nextState >= states.length || edge.nextState < 0) {
          throw new Error(
            `State ${i} containing edge ${j} that points to non-existent state: ${edge.nextState}`
          );
        }
      }

      this.states.push(state);
    }
  }

  toJSON() {
    return {
      startId: this.startId,
      states: this.states.map((s) => s.toJSON()),
    };
  }

  private getStateById(stateId: number): NFAState<D> {
    return this.states[stateId];
  }

  edges(stateId: number): Edge<number>[] {
    return this.getStateById(stateId).edges;
  }
}

export class NFAState<D> {
  id: number;
  edges: Edge<number>[];
  accepting: boolean;

  /**
   * Additional metadata that might be stored with the state.
   */
  data: D;

  constructor(id: number, edges: Edge<number>[], accepting: boolean, data: D) {
    this.id = id;
    this.edges = edges;
    this.accepting = accepting;
    this.data = data;
  }
  toJSON() {
    return { id: this.id, edges: this.edges.map((e) => e.toJSON()) };
  }
  isAccepting() {
    return this.accepting;
  }
}

export function state<D>(
  id: number,
  accepting: boolean,
  edges: Edge<number>[],
  data: D
): NFAState<D> {
  return new NFAState(id, edges, accepting, data);
}

export class Edge<StateId> {
  label: Label;
  nextState: StateId;
  constructor(label: Label, nextState: StateId) {
    this.label = label;
    this.nextState = nextState;
  }
  toJSON() {
    return { label: this.label.toJSON(), nextState: this.nextState };
  }
  isEpsilon(): boolean {
    return this.label.kind == LabelKind.EPSILON;
  }
}
export function edge(label: Label, nextState: number): Edge<number> {
  return new Edge(label, nextState);
}
enum LabelKind {
  EPSILON,
  CHAR,
}
class EpsilonLabel {
  readonly kind: LabelKind.EPSILON = LabelKind.EPSILON;
  equals(label: Label): boolean {
    return label instanceof EpsilonLabel;
  }
  toJSON() {
    return { kind: this.kind };
  }
}
class CharLabel {
  readonly kind: LabelKind.CHAR = LabelKind.CHAR;
  readonly char: string;
  constructor(char: string) {
    this.char = char;
  }
  equals(label: Label): boolean {
    return label instanceof CharLabel && label.char == this.char;
  }
  toJSON() {
    return { kind: this.kind, char: this.char };
  }
}
export type Label = EpsilonLabel | CharLabel;
export const EPSILON: EpsilonLabel = new EpsilonLabel();
export function label(char: string): CharLabel {
  return new CharLabel(char);
}

/**
 * Get the set of all the labels used on all the edges
 * in the NFA graph
 */
export function getInputAlphabet(nfa: NFA<any>): Set<string> {
  let set: Set<string> = new Set();
  for (const state of nfa.states) {
    for (const edge of state.edges) {
      const label = edge.label;
      if (label.kind != LabelKind.EPSILON) {
        set.add(label.char);
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
export function epsilonClosure(nfa: NFA<any>, stateId: number): Set<number> {
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
  nfa: NFA<any>,
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
  nfa: NFA<any>,
  startStates: ConstSet<number>,
  label: Label
): Set<number> {
  let set: Set<number> = new Set();
  for (const stateId of startStates) {
    for (const edge of nfa.edges(stateId)) {
      if (edge.label.equals(label)) {
        set.add(edge.nextState);
      }
    }
  }
  return set;
}

export function getDStates<D>(
  nfa: NFA<D>
): [string, Record<string, DFAState<string, D[]>>] {
  let alpha = getInputAlphabet(nfa);
  let visited: MultiSet = new MultiSet();
  let notVisited: MultiSet = new MultiSet([
    new NumberSet(epsilonClosure(nfa, nfa.startId)),
  ]);
  let Dtrans: Record<string, DFAState<string, D[]>> = {};

  let startId: string = '';
  for (let T = notVisited.pop(); T != undefined; T = notVisited.pop()) {
    let THash = T.hash();
    if (T.has(nfa.startId)) {
      startId = THash;
    }
    notVisited.delete(T);
    visited.add(T);
    for (const symbol of alpha) {
      const U = new NumberSet(
        multiEpsilonClosure(nfa, move(nfa, T, label(symbol)))
      );
      if (!visited.has(U) && !notVisited.has(U)) {
        notVisited.add(U);
      }
      if (!Dtrans[THash]) {
        let isAccepting = false;
        for (let id of T) {
          if (nfa.states[id].isAccepting()) {
            isAccepting = true;
            break;
          }
        }
        let data: D[] = [];
        for (const id of T) {
          data.push(nfa.states[id].data);
        }
        Dtrans[THash] = new DFAState(THash, {}, isAccepting, data);
      }
      Dtrans[THash].edges[symbol] = U.hash();
    }
  }
  return [startId, Dtrans];
}

class DFAState<StateId, D> {
  readonly id: StateId;
  readonly edges: Record<string, StateId>;
  readonly isAccepting: boolean;
  data: D;
  constructor(
    id: StateId,
    edges: Record<string, StateId>,
    isAccepting: boolean,
    data: D
  ) {
    this.id = id;
    this.edges = edges;
    this.isAccepting = isAccepting;
    this.data = data;
  }
}

export class DFA<D> {
  startId: string;
  private states: Record<string, DFAState<string, D>> = {};
  private constructor(
    startId: string,
    states: Record<string, DFAState<string, D>>
  ) {
    this.states = states;
    this.startId = startId;
  }
  static fromNFA<D>(nfa: NFA<D>): DFA<D[]> {
    const [startId, states] = getDStates(nfa);
    return new DFA(startId, states);
  }
  getStateById(stateId: string) {
    return this.states[stateId];
  }
  edgesFor(stateId: string) {
    return this.states[stateId].edges;
  }
}

export type Pos = number;
export type Span = { from: Pos; to: Pos };
export type MatchResult<D> = { span: Span; data: D };

export function matchDFA<D>(
  dfa: DFA<D>,
  input: Iterable<string>,
  greedy: boolean = false
): MatchResult<D> | undefined {
  let current = dfa.getStateById(dfa.startId);
  let forward = 0;

  let accepting: MatchResult<D>[] = [];

  const chars = input[Symbol.iterator]();

  while (true) {
    if (current.isAccepting) {
      let span = { span: { from: 0, to: forward }, data: current.data };
      if (greedy) {
        accepting.push(span);
      } else {
        return span;
      }
    }
    const { value: char, done } = chars.next();
    if (done) {
      return accepting.pop();
    }
    let nextStateId = current.edges[char];
    if (nextStateId == undefined) {
      return accepting.pop();
    } else {
      forward++;
      current = dfa.getStateById(nextStateId);
    }
  }
}
