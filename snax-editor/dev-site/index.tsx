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
import { ThemeProvider } from '@mui/material/styles';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Editor from '../src/Editor';
import './style.css';
import { FileServerClient, FileServerContext } from '../src/file-server-client';
import theme from '../src/theme';
import LandingPage from '../src/app/LandingPage';
import GistEditor from '../src/app/GistEditor';
import App from '../src/app/App';

const appContainer = document.createElement('div');
document.body.appendChild(appContainer);
ReactDOM.render(
  <HashRouter>
    <ThemeProvider theme={theme}>
      <App>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="local"
            element={
              <FileServerContext.Provider
                value={new FileServerClient('http://localhost:8085')}
              >
                <Editor />
              </FileServerContext.Provider>
            }
          />
          <Route path="gists/:username/:gistId" element={<GistEditor />} />
        </Routes>
      </App>
    </ThemeProvider>
  </HashRouter>,
  appContainer
);
