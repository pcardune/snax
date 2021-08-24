import { useState } from 'react';
import { RegexParser, RNode } from '../../regex-compiler/parser';
import NFAGraph from './NFAGraph';

function useRegex(
  regex: string
): [{ rnode: RNode | null; parses: boolean }, (regex: string) => void] {
  const [rnode, setRNode] = useState(RegexParser.parse(regex));
  const [parses, setParses] = useState(!!rnode);
  const updateRegex = (newRegex: string) => {
    if (newRegex.length === 0) return;
    const newNode = RegexParser.parse(newRegex);
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
      {nfa && <NFAGraph layout="cose" nfa={nfa} width="100%" height={300} />}
    </div>
  );
}
