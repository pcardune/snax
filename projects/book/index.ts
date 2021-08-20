import cytoscape from 'cytoscape';
import { ConstNFA } from '../nfa-to-dfa/nfa';
export { parseRegex } from '../regex-compiler/parser';
export { NFA } from '../nfa-to-dfa/nfa';

export function getElementsForNFA(nfa: ConstNFA) {
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

export function renderNFA(
  containerId: string,
  nfa: ConstNFA,
  config?: { layout: { name: string; rows: number } }
) {
  config = {
    layout: {
      name: 'grid',
      rows: 1,
    },
    ...config,
  };
  const container = document.getElementById(containerId);
  const cy = cytoscape({
    container,
    elements: getElementsForNFA(nfa) as any,
    style: style as any,
    layout: config.layout,
  });
}

export function renderNFATable(containerId: string, nfa: ConstNFA) {
  let html = '<table>';

  html += '<thead><tr><th></th>';
  for (let ai = 0; ai < nfa.getAlphabet().length; ai++) {
    html += `<th>${String.fromCharCode(nfa.getAlphabet()[ai])}</th>`;
  }
  html += '</tr></thead>';

  for (let si = 0; si < nfa.numStates; si++) {
    html += '<tr>';
    html += `<td>${nfa.getStartState() == si ? '>' : ''}${si}${
      nfa.isAcceptingState(si) ? '*' : ''
    }</td>`;

    for (let ai = 0; ai < nfa.getAlphabet().length; ai++) {
      const next = nfa.getNextStates(si, ai);
      let cell = next.size > 0 ? `{${[...next].join(',')}}` : '-';
      html += `<td align="center">${cell}</td>`;
    }

    html += '</tr>';
  }
  html += '</table>';
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = html;
  } else {
    throw new Error(`did not find element with id ${containerId}`);
  }
}

// const reInput = document.getElementById('re');
// reInput.value = '[ab]c*d';
// const cy = cytoscape({
//   container: document.getElementById('cy'),
//   elements: getElementsForRegex(reInput.value),
//   style: [
//     // the stylesheet for the graph
//     {
//       selector: 'node',
//       style: {
//         'background-color': '#666',
//         label: 'data(id)',
//         'text-valign': 'center',
//         'text-halign': 'center',
//         color: 'white',
//       },
//     },
//     {
//       selector: 'node[?start]',
//       style: { 'background-color': '#00f' },
//     },
//     {
//       selector: 'node[?accepting]',
//       style: { 'background-color': '#0a0' },
//     },
//     {
//       selector: 'edge',
//       style: {
//         width: 3,
//         label: 'data(label)',
//         'line-color': '#ccc',
//         'target-arrow-color': '#ccc',
//         'target-arrow-shape': 'triangle',
//         'text-valign': 'top',
//         'curve-style': 'bezier',
//       },
//     },
//   ],

//   layout: {
//     name: 'grid',
//     rows: 1,
//   },
// });
// cy.layout({ name: 'cose', animate: false }).run();
// reInput.addEventListener('keyup', (e) => {
//   if (e.target.value) {
//     const elements = getElementsForRegex(e.target.value);
//     cy.remove('node');
//     cy.add(elements);
//     cy.layout({ name: 'cose', animate: false }).run();
//   }
// });

// window.cy = cy;
