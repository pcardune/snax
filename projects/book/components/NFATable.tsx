import { ConstNFA } from '../../nfa-to-dfa/nfa';

function setToString(set: ReadonlySet<number>) {
  if (set.size == 0) {
    return '-';
  }
  return '{' + [...set].sort().join(',') + '}';
}

export default function NFATable({ nfa }: { nfa: ConstNFA }) {
  let alphabet: string[] = [];
  for (let ai = 0; ai < nfa.getAlphabet().length; ai++) {
    alphabet.push(String.fromCharCode(nfa.getAlphabet()[ai]));
  }
  let states: number[] = [];
  for (let si = 0; si < nfa.numStates; si++) {
    states.push(si);
  }

  return (
    <table>
      <thead>
        <tr>
          <th></th>
          {alphabet.map((a) => (
            <th key={a}>{a}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {states.map((si) => (
          <tr key={si}>
            <td>
              {nfa.getStartState() == si && '>'}
              {si}
              {nfa.isAcceptingState(si) && '*'}
            </td>
            {alphabet.map((char, ai) => (
              <td align="center" key={ai}>
                {setToString(nfa.getNextStates(si, ai))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
