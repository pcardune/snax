import React, { useCallback, useMemo, useState } from 'react';
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser.js';
import { compileStr } from '@pcardune/snax/dist/snax/wat-compiler.js';
import { WASI } from '@pcardune/snax/dist/snax/wasi';
import styled from 'styled-components';
import Editor, { ViewRef } from './editor/Editor.jsx';
import { EditorView, ViewUpdate } from '@codemirror/view';

type Instance = WebAssembly.Instance & {
  exports: WebAssembly.Exports & {
    memory: WebAssembly.Memory;
    stackPointer: WebAssembly.Global;
  };
};

function useCodeRunner(
  wasmModule: React.RefObject<WebAssembly.Module | undefined>
) {
  const [instance, setInstance] = React.useState<Instance>();
  const runCode = React.useCallback(
    async (wasi: WASI) => {
      if (!wasmModule.current) {
        return;
      }
      // TODO: do debugging in a better way
      const modInstance = await WebAssembly.instantiate(wasmModule.current, {
        wasi_snapshot_preview1: wasi.wasiImport,
        wasi_unstable: wasi.wasiImport,
        debug: { debug: (...a: any[]) => console.log('debug', ...a) },
      });
      setInstance(modInstance as Instance);
      (window as any).wasm = modInstance.exports;
      try {
        const result = wasi.start(modInstance);
        console.log('Run Result:', result);
        if (typeof result === 'number') {
          return result;
        }
      } catch (e) {
        console.error('Failed:', e);
      }
    },
    [wasmModule]
  );
  return { runCode, instance };
}

function useCompiler() {
  const wasmModuleRef = React.useRef<WebAssembly.Module>();
  const [wat, setWAT] = useState<string | null>(null);
  const [error, setError] = useState<null | Error>(null);
  const compile = useCallback(async (input: string) => {
    wasmModuleRef.current = undefined;
    setError(null);
    const result = await compileStr(input, {
      includeRuntime: true,
      importResolver: async (sourcePath, fromCanonicalUrl) => {
        if (!sourcePath.startsWith('snax/')) {
          throw new Error(
            "Importing non standard library modules isn't supported yet."
          );
        }
        const resp = await fetch(
          'https://raw.githubusercontent.com/pcardune/snax/main/snax/stdlib/' +
            sourcePath
        );
        if (!resp.ok) {
          throw new Error('Failed to load module: ' + sourcePath);
        }
        const content = await resp.text();
        const result = SNAXParser.parseStr(content, 'start', {
          grammarSource: resp.url,
        });
        if (!result.isOk()) {
          alert('Failed to parse module: ' + sourcePath + ' ' + result.error);
          throw new Error('Failed to parse module: ' + sourcePath);
        }
        if (result.value.name !== 'File') {
          alert('Failed to parse module: ' + sourcePath);
          throw new Error('Failed to parse module: ' + sourcePath);
        }
        return { ast: result.value, canonicalUrl: resp.url };
      },
    });
    if (result.isErr()) {
      console.error(result.error);
      setError(result.error);
      return;
    }
    const binaryenModule = result.value;
    const validates = binaryenModule.validate();
    if (validates) {
      // now optimize it...
      const sourceMapUrl = 'script.map';
      let { binary, sourceMap } = binaryenModule.emitBinary(sourceMapUrl);

      wasmModuleRef.current = await WebAssembly.compile(binary.buffer);
      setWAT(binaryenModule.emitText());
      binaryenModule.dispose();
      return {
        binary,
        sourceMap: { url: sourceMapUrl, content: sourceMap },
      };
    } else {
      alert('Failed to validate');
    }
    return;
    // TODO: this got deprecated... maybe this whole file should disappear
    // setWAT(await compileStr(text));
  }, []);
  const runner = useCodeRunner(wasmModuleRef);
  return { compile, runner, wat, error };
}

export function SnaxEditor({ children }: { children: string }) {
  const [editedText, setText] = useState(() => children.trim());
  const [wasEdited, setWasEdited] = useState(false);
  const [stdout, setStdout] = useState('');
  const compiler = useCompiler();

  const text = wasEdited ? editedText : children.trim();

  const onClickRun = async () => {
    process.env.DEBUG = 'true';
    setStdout('Compiling...');
    await compiler.compile(text);
    const buffer: string[] = [];
    const wasi = new WASI({
      write: (str: string) => {
        buffer.push(str);
      },
    });
    const result = await compiler.runner.runCode(wasi);
    if (buffer.length === 0) {
      setStdout(`Return Value: ${result}`);
    } else {
      setStdout(buffer.join(''));
    }
  };

  const onChangeText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setWasEdited(true);
    setText(e.target.value);
  };

  let output = stdout;
  if (compiler.error) {
    output = compiler.error.toString();
  }
  const extensions = useMemo(
    () => [
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          setWasEdited(true);
          setText(update.state.doc.sliceString(0));
        }
      }),
      EditorView.theme({
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
      }),
    ],
    []
  );
  const cmViewRef = React.useRef<ViewRef>();
  return (
    <Container>
      <Editor value={text} extensions={extensions} ref={cmViewRef} />
      <RunButton onClick={onClickRun}>&#x25BA; Run</RunButton>
      {output && <Output>{output}</Output>}
    </Container>
  );
}

const RunButton = styled.button`
  border: 1px solid #ddd;
  cursor: pointer;
  padding: 4px 8px;
  background-color: #bcd0f5;
`;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  ${RunButton} {
    position: absolute;
    align-self: flex-end;
  }
  &:hover ${RunButton} {
    visibility: visible;
  }
`;
const Output = styled.pre`
  margin: 0px;
  background-color: #eee;
  padding: 8px;
  font-size: 14px;
`;
