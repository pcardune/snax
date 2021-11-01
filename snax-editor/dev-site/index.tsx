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

import ReactDOM from 'react-dom';
import React from 'react';
import Editor from '../src/Editor';
import './style.css';
const appContainer = document.createElement('div');
document.body.appendChild(appContainer);
ReactDOM.render(<Editor />, appContainer);
