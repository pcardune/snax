// import CodeMirrorBlocks from 'codemirror-blocks';
// import snaxLang from '../src/cmb-lang';
// import 'codemirror/lib/codemirror.css';
// import 'codemirror-blocks/lib/less/example.less';
// // eslint-disable-next-line import/no-unresolved
// import '../src/style.less';

// const container = document.createElement('div');
// document.body.appendChild(container);

// const api = CodeMirrorBlocks(
//   container,
//   { collapseAll: false, value: 'let y; let s = 123; return s;' },
//   snaxLang
// );
// api.setBlockMode(true);
// console.log('hello world');

import { EditorState, EditorView, basicSetup } from '@codemirror/basic-setup';
// import {javascript} from "@codemirror/lang-javascript"
import { example } from '../src/parser';

const code = `
struct MyStruct {
  a: i32;
}

func main(param1:i32) {
  reg a = 1;
  let b = 3; // this is a comment
  while (a < 10) {
    a = a+1;
  }
  return a;
}
`;

let view = new EditorView({
  state: EditorState.create({
    doc: code,
    extensions: [basicSetup, example()],
  }),
  parent: document.body,
});

import { parser } from '../src/grammar/snx-lang.js';
const tree = parser.parse(code);
window.tree = tree;
console.log(tree);

let indent = '';
tree.iterate({
  enter: (type, from, to, get) => {
    console.log(indent, type.name, type.isError);
    indent += '  ';
  },
  leave: () => {
    indent = indent.slice(0, indent.length - 2);
  },
});
