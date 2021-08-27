import { ConstNFA } from '../../dist/nfa-to-dfa/nfa';
import Cytoscape from './Cytoscape';

function getElementsForNFA(nfa: ConstNFA) {
  let elements = [];
  for (let i = 0; i < nfa.numStates; i++) {
    elements.push({
      group: 'nodes',
      data: {
        id: '' + i,
        start: i === nfa.getStartState(),
        accepting: nfa.isAcceptingState(i),
      },
    });
    for (let ai = 0; ai < nfa.getAlphabet().length; ai++) {
      for (let state of nfa.getNextStates(i, ai)) {
        let char = nfa.getAlphabet()[ai];
        let label = char === -1 ? 'ϵ' : String.fromCharCode(char);
        elements.push({
          group: 'edges',
          data: {
            id: `s${i}-a${ai}-s${state}`,
            source: i,
            target: state,
            label,
          },
        });
      }
    }
  }
  return elements;
}

const style = [
  // the stylesheet for the graph
  {
    selector: 'node',
    style: {
      'background-color': '#fff',
      label: 'data(id)',
      'text-valign': 'center',
      'text-halign': 'center',
      color: 'black',
      'border-style': 'solid',
      'border-width': '2px',
    },
  },
  {
    selector: 'node[?start]',
    style: { shape: 'diamond' },
  },
  {
    selector: 'node[?accepting]',
    style: {
      'background-color': '#fff',
      'border-style': 'double',
      'border-width': '4px',
    },
  },
  {
    selector: 'edge',
    style: {
      width: 3,
      label: 'data(label)',
      'line-color': '#000',
      'target-arrow-color': '#000',
      'target-arrow-shape': 'triangle',
      'text-valign': 'top',
      'text-margin-y': '-10px',
      'curve-style': 'bezier',
    },
  },
];

export default function NFAGraph(props: {
  nfa: ConstNFA;
  width?: string | number;
  height?: string | number;
  layout?: 'grid' | 'cose';
}) {
  const layouts = {
    grid: {
      name: 'grid',
      rows: 1,
    },
    cose: { name: 'cose', animate: false, randomize: false },
  };
  const elements = getElementsForNFA(props.nfa);
  return (
    <Cytoscape
      cyConfig={{ style, layout: layouts[props.layout || 'grid'], elements }}
      style={{
        width: props.width || 300,
        height: props.height || 250,
        border: '2px solid #ddd',
        margin: 'auto',
      }}
    />
  );
}
