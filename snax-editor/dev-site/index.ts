import CodeMirrorBlocks from 'codemirror-blocks';
import snaxLang from '../src/cmb-lang';
import 'codemirror/lib/codemirror.css';
import 'codemirror-blocks/lib/less/example.less';

const container = document.createElement('div');
document.body.appendChild(container);

const api = CodeMirrorBlocks(
  container,
  { collapseAll: false, value: '123;' },
  snaxLang
);

console.log('hello world');
