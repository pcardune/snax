import { useState } from 'react';
import { parseRegex, RNode } from '../../regex-compiler/parser';
import NFAGraph from './NFAGraph';

function useRegex(
  regex: string
): [{ rnode: RNode | null; parses: boolean }, (regex: string) => void] {
  const [rnode, setRNode] = useState(parseRegex(regex));
  const [parses, setParses] = useState(!!rnode);
  const updateRegex = (newRegex: string) => {
    const newNode = parseRegex(newRegex);
    if (newNode) {
      setRNode(newNode);
      setParses(true);
    } else {
      setParses(false);
    }
  };
  return [{ rnode, parses }, updateRegex];
}

export function RegexNFA(props: { initialRegex: string }) {
  const [regexStr, setRegexStr] = useState(props.initialRegex);
  const [regexNode, updateRegex] = useRegex(regexStr);

  const nfa = regexNode.rnode?.nfa().toDFA();

  const onChangeRegex: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setRegexStr(e.target.value);
    updateRegex(e.target.value);
  };
  return (
    <div>
      regex:{' '}
      <input
        type="text"
        value={regexStr}
        onChange={onChangeRegex}
        style={{
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: regexNode.parses ? '#ddd' : 'red',
        }}
      />
      {nfa && <NFAGraph layout="cose" nfa={nfa} width={300} height={300} />}
    </div>
  );
}
