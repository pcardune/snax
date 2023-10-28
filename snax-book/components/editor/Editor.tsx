import React from 'react';
import { Compartment, EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { example } from './parser';
import { wast } from '@codemirror/lang-wast';

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: '#fafafa',
    border: '1px solid #ddd',
    fontSize: '14px',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-scroller': {
    lineHeight: 'normal',
  },
});

interface EditorProps {
  value: string;
  lang?: 'snax' | 'wat';
  extensions?: Extension[];
  theme?: Extension;
}

export type ViewRef = EditorView | undefined;

export default React.forwardRef(function CodeMirror(
  { theme = editorTheme, ...props }: EditorProps,
  ref: React.ForwardedRef<ViewRef>
) {
  const editorContainer = React.useRef(null);

  const viewRef = React.useRef<EditorView>();
  React.useImperativeHandle(ref, () => {
    return viewRef.current;
  });

  React.useEffect(() => {
    if (!editorContainer.current) {
      return;
    }
    const language = new Compartment();
    const state = EditorState.create({
      doc: props.value,
      extensions: [
        basicSetup,
        props.lang === 'wat' ? language.of(wast()) : example(),
        theme,
        ...(props.extensions || []),
      ],
    });
    const view = new EditorView({ state, parent: editorContainer.current });
    viewRef.current = view;
    return () => view.destroy();
  }, [editorContainer, props.extensions, props.lang, theme]);

  const { current: view } = viewRef;
  React.useEffect(() => {
    // if the new value is different from the old one, update the view
    if (view && view.state.sliceDoc(0) !== props.value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: props.value },
      });
    }
  }, [props.value, view]);

  return <div ref={editorContainer} />;
});
