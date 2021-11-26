import React from 'react';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from '@codemirror/basic-setup';
import { example } from './parser';

interface EditorProps {
  value: string;
  extensions?: Extension[];
}

export type ViewRef = EditorView | undefined;

export default React.forwardRef(function CodeMirror(
  props: EditorProps,
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
    const state = EditorState.create({
      extensions: [basicSetup, example(), ...(props.extensions || [])],
    });
    const view = new EditorView({ state, parent: editorContainer.current });
    viewRef.current = view;
    return () => view.destroy();
  }, [editorContainer, props.extensions]);

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
