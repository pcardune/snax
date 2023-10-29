import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser.js';
import { compileStr } from '@pcardune/snax/dist/snax/wat-compiler.js';
import { WASI } from '@pcardune/snax/dist/snax/wasi';
import styled from 'styled-components';
import Editor, { ViewRef } from './editor/Editor.jsx';
import { EditorView, ViewUpdate } from '@codemirror/view';
import {
  FileCompiler,
  ModuleCompilerOptions,
  WASM_FEATURE_FLAGS,
} from '@pcardune/snax/dist/snax/ast-compiler.js';
import { AllocationTables } from './AllocationTables.jsx';
import binaryen from 'binaryen';

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
        console.log('Run Result:', typeof result, result);
        return result;
      } catch (e) {
        console.error('Failed:', e);
      }
    },
    [wasmModule]
  );
  return { runCode, instance };
}

type CompilerOptions = Pick<ModuleCompilerOptions, 'includeRuntime'> & {
  shouldOptimize?: boolean;
};

function useCompiler({
  includeRuntime = true,
  shouldOptimize = false,
}: CompilerOptions = {}) {
  const wasmModuleRef = React.useRef<WebAssembly.Module>();
  const [wat, setWAT] = useState<string | null>(null);
  const [optimizedWat, setOptimizedWAT] = useState<string | null>(null);
  const [error, setError] = useState<null | Error>(null);
  const [fileCompiler, setFileCompiler] = useState<null | FileCompiler>(null);
  const compile = useCallback(
    async (input: string) => {
      wasmModuleRef.current = undefined;
      setError(null);
      const result = await compileStr(input, {
        includeRuntime,
        importResolver: async (sourcePath, fromCanonicalUrl) => {
          if (!sourcePath.startsWith('snax/')) {
            throw new Error(
              "Importing non standard library modules isn't supported yet."
            );
          }
          const resp = await fetch(
            // 'https://raw.githubusercontent.com/pcardune/snax/main/snax/stdlib/' +
            '/snax/stdlib/' + sourcePath
          );

          if (!resp.ok) {
            throw new Error('Failed to load module: ' + sourcePath);
          }
          const content = await resp.text();
          const result = SNAXParser.parseStr(content, 'start', {
            grammarSource: resp.url,
          });
          if (!result.isOk()) {
            setError(
              new Error(
                'Failed to parse module: ' + sourcePath + ' ' + result.error
              )
            );
            throw new Error('Failed to parse module: ' + sourcePath);
          }
          if (result.value.rootNode.name !== 'File') {
            setError(new Error('Failed to parse module: ' + sourcePath));
            throw new Error('Failed to parse module: ' + sourcePath);
          }
          return { ast: result.value.rootNode, canonicalUrl: resp.url };
        },
      });
      if (result.isErr()) {
        console.error(result.error);
        setError(result.error);
        return;
      }
      const { binaryenModule, compiler } = result.value;
      setFileCompiler(compiler);
      const validates = binaryenModule.validate();
      if (validates) {
        const sourceMapUrl = 'script.map';
        let { binary, sourceMap } = binaryenModule.emitBinary(sourceMapUrl);

        if (shouldOptimize) {
          const newModule = binaryen.readBinary(binary);
          binaryen.setOptimizeLevel(2);
          newModule.setFeatures(WASM_FEATURE_FLAGS);
          newModule.optimize();
          setOptimizedWAT(newModule.emitText());
          newModule.dispose();
        }

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
    },
    [includeRuntime, shouldOptimize]
  );
  const runner = useCodeRunner(wasmModuleRef);
  return { compile, runner, wat, optimizedWat, error, fileCompiler };
}

export function SnaxEditor({
  children,
  showWAT = false,
  compilerOptions,
  runOnMount = false,
  showRunResult = true,
}: {
  children: string;
  showWAT?: boolean;
  showRunResult?: boolean;
  runOnMount?: boolean;
  compilerOptions?: CompilerOptions;
}) {
  const [editedText, setText] = useState(() => children.trim());
  const [showWATOutput, setShowWATOutput] = useState(showWAT);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [shouldOptimize, setShouldOptimize] = useState(false);
  const [showAllocationTables, setShowAllocationTables] = useState(false);
  const [wasEdited, setWasEdited] = useState(false);
  const [stdout, setStdout] = useState('');
  const compiler = useCompiler({ ...compilerOptions, shouldOptimize });

  const text = wasEdited ? editedText : children.trim();

  const onClickRun = useCallback(async () => {
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
  }, [compiler, text]);

  useEffect(() => {
    if (runOnMount && !compiler.wat) {
      compiler.compile(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    ],
    []
  );

  const cmViewRef = React.useRef<ViewRef>();
  return (
    <Container>
      <Editor
        value={text}
        extensions={extensions}
        theme={editorTheme}
        ref={cmViewRef}
      />
      <ButtonContainer>
        <RunButton onClick={onClickRun}>&#x25BA; Run</RunButton>
        <Button
          title="Toggle Controls"
          onClick={() => setShowConfigPanel((prev) => !prev)}
        >
          &middot;&middot;&middot;
        </Button>
      </ButtonContainer>
      {showConfigPanel && (
        <div>
          <Checkbox
            checked={showRunResult}
            // onChange={(checked) => setShowWATOutput(checked)}
            label="Show Run Result"
          />
          <Checkbox
            checked={showWATOutput}
            onChange={(checked) => setShowWATOutput(checked)}
            label="Show Web Assembly Output"
          />
          <Checkbox
            checked={shouldOptimize}
            onChange={(checked) => setShouldOptimize(checked)}
            label="Run Optimization Pass"
          />
          <Checkbox
            checked={showAllocationTables}
            onChange={(checked) => setShowAllocationTables(checked)}
            label="Show Allocation Tables"
          />
        </div>
      )}
      {showWATOutput && !shouldOptimize && compiler.wat && (
        <Editor value={compiler.wat} lang="wat" theme={editorTheme} />
      )}
      {showWATOutput && shouldOptimize && compiler.optimizedWat && (
        <Editor value={compiler.optimizedWat} lang="wat" theme={editorTheme} />
      )}
      {showAllocationTables && compiler.fileCompiler && (
        <AllocationTables compiler={compiler.fileCompiler} />
      )}
      {showRunResult && output && <Output>{output}</Output>}
    </Container>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <FormField>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={(e) => onChange && onChange(e.target.checked)}
      />
      {label && <label htmlFor={id}>{label}</label>}
    </FormField>
  );
}

const FormField = styled.div`
  display: flex;
  gap: 4px;
  align-items: center;
  label {
    font-size: 14px;
  }
`;

const Button = styled.button`
  cursor: pointer;
  padding: 4px 8px;
`;

const RunButton = styled(Button)`
  border: 1px solid #bcd0f5;
  background-color: #bcd0f5;
`;

const ButtonContainer = styled.div`
  display: flex;
  gap: 4px;
`;

const Container = styled.div`
  font-family: 'Open Sans', sans-serif;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  ${ButtonContainer} {
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
  text-wrap: wrap;
`;
