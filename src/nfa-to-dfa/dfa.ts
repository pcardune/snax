import { MultiSet, NumberSet } from '../sets';
import { ConstNFA, closure, move, NFA } from './nfa';

/**
 * Convert an NFA to a DFA by resolving ambiguity in the paths
 * through the NFA.
 *
 * @param nfa Source NFA from which to generate the DFA
 * @param epsilon Index of the alphabet item in the source NFA
 *                that should be used as epsilon. e.g. The
 *                alphabet item that does not consume characters
 * @returns a new DFA, which is just an NFA without ambiguous transitions
 */
function toDFA(nfa: ConstNFA, epsilon: number): DFAFromNFA {
  // Step 1: Perform the subset construction.
  // See page 47 of Engineering a Compiler (Cooper & Torczon)
  // Step 1.1: make a list of labels: the set of alphabet indices
  // in the source nfa that represent transitions which consume
  // characters (i.e. all transitions except the given epsilon)
  const alphabet = nfa.getAlphabet();
  let labels = [];
  for (let ai = 0; ai < alphabet.length; ai++) {
    if (ai != epsilon) {
      labels.push(ai);
    }
  }

  // Step 1.2: Initialize loop state.
  // The set of configurations the NFA could be in while being traversed.
  // Each of these configurations corresponds to a single state in the
  // resulting DFA.
  let nfaConfigurations = new MultiSet();
  // configurations that we need to try traversing from. This eventually
  // gets to size 0 over the course of the main loop.
  let configsToVisit = new MultiSet();

  // The first configuration includes the states that we get to by consuming
  // 0 characters. i.e., from the start state, we follow all the epsilon
  // labeled edges to get our new start state in the dfa. This will also
  // end up being the first state in the DFA, so we add it to the set of
  // configurations represented by DFA states.
  let nfaConfig0 = new NumberSet(closure(nfa, [nfa.getStartState()], epsilon));
  nfaConfigurations.add(nfaConfig0);
  // We also want to process the traversal from each of these states so add it
  // to the set of configurations we still need to visit inside the loop.
  configsToVisit.add(nfaConfig0);

  // This keeps track of the next NFA configurations we can get to by following
  // various labels.
  let nextConfigs: { [nfaConfigHash: string]: { [label: number]: NumberSet } } =
    {};

  // Step 1.3: While there are still nfa configurations to visit...
  for (
    let nfaConfig = configsToVisit.pop();
    nfaConfig != undefined;
    nfaConfig = configsToVisit.pop()
  ) {
    for (const label of labels) {
      // Go through each of the labels and find the next nfa configurations
      // we can get to by following edges with that label
      const nextNFAConfig = new NumberSet(
        closure(nfa, move(nfa, nfaConfig, label), epsilon)
      );
      // Add that configuration to our mapping of next configurations
      // so we can build a DFA from it.
      const key = nfaConfig.hash();
      if (!nextConfigs[key]) {
        nextConfigs[key] = {};
      }
      nextConfigs[key][label] = nextNFAConfig;
      // If this is the first time we've encountered this configuration
      // add it to the list of configurations to process.
      if (!nfaConfigurations.has(nextNFAConfig)) {
        configsToVisit.add(nextNFAConfig);
        nfaConfigurations.add(nextNFAConfig);
      }
    }
  }

  let dfaStateToNfaConfig = [...nfaConfigurations].filter((q) => q.size > 0);
  // Step 2: Now construct the DFA
  let dfa = new DFAFromNFA(dfaStateToNfaConfig);
  // Step 2.1: Copy the alphabet from the nfa to the dfa, ommitting
  // the labels we didn't consider (epsilon)
  for (const label of labels) {
    dfa.addAlpha(alphabet[label]);
  }

  // Step 2.2: Add a state to the dfa for each configuration the nfa
  // could be in
  let dfaStateToQstateHash = [];
  for (let qi = 0; qi < dfaStateToNfaConfig.length; qi++) {
    // Add a state to the dfa for every configuration in qi
    const nfaStates = dfaStateToNfaConfig[qi];
    const dfaState = dfa.addState();
    dfaStateToQstateHash.push(nfaStates.hash());
    for (const nfaState of nfaStates) {
      // if any of the states in qi are accepting, then
      // the dfa state should be accepting to.
      if (nfa.isAcceptingState(nfaState)) {
        dfa.setAccepting(dfaState, true);
      }
      // if any of the stats in qi are the start state,
      // then this should be the start state of the dfa
      if (nfaState == nfa.getStartState()) {
        dfa.setStartState(dfaState);
      }
    }
  }

  // Step 2.3: Add edges between the nfa configurations that are now
  // represented by dfa states based on the transitions that we discovered
  // during Step 1, which were added to nextConfigs
  for (let qi = 0; qi < dfaStateToNfaConfig.length; qi++) {
    const nfaStates = dfaStateToNfaConfig[qi];
    const key = nfaStates.hash();
    for (let ai = 0; ai < labels.length; ai++) {
      const nextStates = nextConfigs[key][labels[ai]];
      const nextDFAState = dfaStateToQstateHash.indexOf(nextStates.hash());
      if (nextDFAState != -1) {
        dfa.addEdge(qi, nextDFAState, ai);
      }
    }
  }
  return dfa;
}

function minimizeDFA(dfa: DFA) {
  const alphabet = dfa.getAlphabet();
  function split(S: NumberSet) {
    for (let ai = 0; ai < alphabet.length; ai++) {
      let s1Next = undefined;
      let s1: Set<number> = new Set();
      let s2: Set<number> = new Set();
      for (let si of S) {
        let nextState = dfa.getNextState(si, ai);
        if (s1Next === undefined) {
          s1Next = nextState;
          s1.add(si);
        } else if (nextState === s1Next) {
          s1.add(si);
        } else {
          s2.add(si);
        }
      }
      if (s2.size > 0) {
        return [new NumberSet(s1), new NumberSet(s2)];
      }
    }
    return [S];
  }

  // Step 1: initialize partitions into accepting and non-accepting states
  let p0: Set<number> = new Set();
  let p1: Set<number> = new Set();
  for (let si = 0; si < dfa.numStates; si++) {
    if (dfa.isAcceptingState(si)) {
      p0.add(si);
    } else {
      p1.add(si);
    }
  }
  let T = new MultiSet([new NumberSet(p0), new NumberSet(p1)]);
  let P = new MultiSet();
  while (!P.equals(T)) {
    P = T;
    T = new MultiSet();
    for (const p of P) {
      for (const partition of split(p)) {
        T.add(partition);
      }
    }
  }

  let minDFA = new DFA();
  let Pstates = [...P];
  for (let i = 0; i < Pstates.length; i++) {
    minDFA.addState();
  }
  for (const c of alphabet) {
    minDFA.addAlpha(c);
  }
  for (let pli = 0; pli < Pstates.length; pli++) {
    const pl = Pstates[pli];
    const dj = pl.first();
    if (!dj) continue;
    if (dfa.isAcceptingState(dj)) {
      minDFA.setAccepting(dj, true);
    }
    if (pl.has(dfa.getStartState())) {
      minDFA.setStartState(pli);
    }
    for (let c = 0; c < alphabet.length; c++) {
      for (let pmi = 0; pmi < Pstates.length; pmi++) {
        const pm = Pstates[pmi];
        const dk = pm.first();
        if (!dk) continue;
        if (dfa.getNextState(dj, c) == dk) {
          minDFA.addEdge(pli, pmi, c);
        }
      }
    }
  }
  return minDFA;
}

export type ConstDFA = Omit<ConstNFA, 'getNextStates'> & {
  getNextState(fromState: number, label: number): number | null;
  match(charCodes: Iterable<number>): void;
};

export class DFA extends NFA implements ConstDFA {
  static fromNFA(nfa: ConstNFA, epsilon: number): DFAFromNFA {
    return toDFA(nfa, epsilon);
  }

  override addEdge(fromState: number, toState: number, alphaIndex: number) {
    if (this.getNextStates(fromState, alphaIndex).size) {
      throw new Error(
        `There is already an edge from ${fromState} to ${toState} via ${String.fromCharCode(
          this.getAlphabet()[alphaIndex]
        )}`
      );
    }
    super.addEdge(fromState, toState, alphaIndex);
  }

  minimized(): DFA {
    return minimizeDFA(this);
  }

  getNextState(fromState: number, label: number): number | null {
    for (const nextState of this.getNextStates(fromState, label)) {
      return nextState;
    }
    return null;
  }

  match(input: Iterable<number>): { substr: string; state: number } | null {
    let currentState = this.getStartState();
    let matchBuffer: string = '';

    let accepted: { substr: string; state: number } | null = null;

    for (const charCode of input) {
      if (this.isAcceptingState(currentState)) {
        accepted = { substr: matchBuffer, state: currentState };
      }
      matchBuffer += String.fromCharCode(charCode);
      const nextState = this.getNextState(
        currentState,
        this.getAlphabetIndex(charCode)
      );
      if (nextState == null) {
        return accepted;
      }
      currentState = nextState;
    }
    if (this.isAcceptingState(currentState) && matchBuffer.length > 0) {
      return { substr: matchBuffer, state: currentState };
    }
    return accepted;
  }
}

export class DFAFromNFA extends DFA {
  nfaStateMap: NumberSet[];
  constructor(nfaStateMap: NumberSet[]) {
    super();
    this.nfaStateMap = nfaStateMap;
  }

  getStatesForSourceNFAState(sourceNFAState: number): number[] {
    let states = [];
    for (const [si, sourceNFAStates] of this.nfaStateMap.entries()) {
      if (sourceNFAStates.has(sourceNFAState)) {
        states.push(si);
      }
    }
    return states;
  }

  override toDebugStr() {
    let out = 'DFAfromNFA:\n' + super.toDebugStr();
    out += '\n';

    out += 'Mapping from DFA state to source NFA states:\n';
    for (const [si, nfaStates] of this.nfaStateMap.entries()) {
      out += `s${si}: ${nfaStates.hash()}\n`;
    }
    return out;
  }
}
