<script src="/main.js"></script>
<style>
  .nfa {
    border: 2px solid #ddd;
    margin: auto;
  }
</style>

# Finite Automata

## Nondeterministic Finite Automata

A nondeterministic finite automaton (or NFA) consists of the following:

1. a set of states (we'll assign each state a unique number), which contains
   - exactly one _start state_
   - one or more _accepting states_
   - any number of other states that are neither an accepting state nor the start state
2. a set of input symbols, referred to as the _input alphabet_
3. a _transition function_ that takes a state and symbol and returns a set of _next states_

An NFA can be represented visually as a graph:

<div id="example-1" class="nfa" style="height: 100px; width: 300px;"></div>

In this visualization, the set of states is {0,1,2,3}, with the start state 0
indicated by a diamond shaped node, and the accepting state 3 indicated by a double
bordered node. The labeled edges between nodes indicate the transition function.
Each edge is labeled with a symbol from the alphabet, which in this case is the
set {f, o}.

An NFA can also be represented with a table:

<div id="example-1-table"></div>

<script type="text/javascript">
{
let nfa = new nfaExplore.NFA();
let s0 = nfa.addState();
let s1 = nfa.addState();
let s2 = nfa.addState();
let s3 = nfa.addState();
let f = nfa.addAlpha('f');
let o = nfa.addAlpha('o');
nfa.addEdge(s0, s1, f);
nfa.addEdge(s1,s2,o);
nfa.addEdge(s2,s3,o);
nfa.setAccepting(s3, true);
nfa.setStartState(s0);
nfaExplore.renderNFA('example-1', nfa);
nfaExplore.renderNFATable('example-1-table', nfa)
}
</script>

In this table there is a row for each state, and a column for each symbol in the
alphabet. The start state is indicated by a > and accepting states are indicated
with a \*.

Here is a more complex example of an NFA with multiple accepting states,
edges that loop back to the state they started from, etc.

<div id="example-2" class="nfa" style="height: 250px; width: 300px;"></div>

and it's corresponding table:

<div id="example-2-table"></div>
<script>
  let nfa = nfaExplore.parseRegex('a*b*').nfa();
  nfaExplore.renderNFA(
    'example-2',
    nfa,
    {layout:{name: 'cose', animate: false, randomize: false}}
  );
  nfaExplore.renderNFATable('example-2-table', nfa)
</script>
