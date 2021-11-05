import React, { useEffect, useRef } from 'react';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView, keymap, ViewUpdate } from '@codemirror/view';
import { basicSetup } from '@codemirror/basic-setup';
import { example } from './parser';

interface EditorProps {
  value?: string;
  onUpdate?: (update: ViewUpdate) => void;
  extensions?: Extension[];
}

export default function CodeMirror({
  value = '',
  onUpdate = undefined,
  ...props
}: EditorProps) {
  const editorContainer = useRef(null);

  const viewRef = React.useRef<EditorView>();

  useEffect(() => {
    if (!editorContainer.current) {
      return;
    }
    const extensions: Extension[] = [basicSetup, example()];
    if (onUpdate) {
      extensions.push(EditorView.updateListener.of(onUpdate));
    }

    if (props.extensions) {
      extensions.push(...props.extensions);
    }

    const state = EditorState.create({
      doc: value,
      extensions,
    });
    const view = new EditorView({ state, parent: editorContainer.current });
    viewRef.current = view;
    return () => view.destroy();
  }, [editorContainer, props.extensions]);

  React.useEffect(() => {
    if (!viewRef.current) {
      return;
    }
    const view = viewRef.current;
    // if the new value is different from the old one, update the view
    if (view.state.sliceDoc(0) !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      });
    }
  }, [value]);

  return <div ref={editorContainer} />;
}
