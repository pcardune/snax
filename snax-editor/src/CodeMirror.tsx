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

  useEffect(() => {
    const currentEditor = editorContainer.current as Exclude<
      typeof editorContainer['current'],
      null
    >;
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
    const view = new EditorView({ state, parent: currentEditor });

    return () => view.destroy();
  }, [editorContainer, value, props.extensions]);

  return <div ref={editorContainer} />;
}
