import { Result } from 'neverthrow';
import React, { useCallback, useEffect, useState } from 'react';
import { ASTNode, File } from '@pcardune/snax/dist/snax/spec-gen.js';
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser.js';
import { compileAST } from '@pcardune/snax/dist/snax/wat-compiler.js';
import type binaryen from 'binaryen';
import { WASI } from '@pcardune/snax/dist/snax/wasi';

function ParseOutput({ ast }: { ast: ASTNode }) {
  return (
    <div>
      <pre>
        <code>{JSON.stringify(ast, null, 2)}</code>
      </pre>
    </div>
  );
}

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
  const compile = useCallback(async (file: File) => {
    const result = await compileAST(file, {
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
    const { binaryenModule } = result;
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
  return { compile, runner, wat };
}

export function SnaxEditor({ children }: { children: string }) {
  const [text, setText] = useState(children);
  const [wat, setWAT] = useState<Result<binaryen.Module, any> | null>(null);
  const [parse, setParse] = useState<Result<ASTNode, any> | null>(null);
  const [stdout, setStdout] = useState('');
  const compiler = useCompiler();
  useEffect(() => {
    const saved = localStorage.getItem('snax-code');
    if (saved) {
      setText(saved);
    }
  }, []);

  const onClickCompile = async () => {
    const parseResult = onClickParse();
    if (parseResult.isErr()) {
      return;
    }
    if (parseResult.value.name !== 'File') {
      // TODO: show some kind of parse error.
      return;
    }
    await compiler.compile(parseResult.value);
    const buffer: string[] = [];
    const wasi = new WASI({
      write: (str: string) => {
        buffer.push(str);
      },
    });
    await compiler.runner.runCode(wasi);
    setStdout((prev) => prev + buffer.join('') + '\n');
  };

  const onClickParse = () => {
    process.env.DEBUG = 'true';
    const result = SNAXParser.parseStr(text);
    setParse(SNAXParser.parseStr(text));
    return result;
  };

  const onChangeText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    localStorage.setItem('snax-code', e.target.value);
    setText(e.target.value);
    setWAT(null);
    setParse(null);
  };

  return (
    <div>
      <div>
        <textarea
          style={{ width: '100%', height: 200 }}
          onChange={onChangeText}
          value={text}
        />
      </div>
      <button onClick={onClickParse}>Parse</button>
      <button onClick={onClickCompile}>Run</button>
      {stdout && <pre>{stdout}</pre>}
      {parse && (
        <div>
          Parse Result:
          {parse.isOk() ? (
            <ParseOutput ast={parse.value} />
          ) : (
            <div>{parse.error.toString()}</div>
          )}
        </div>
      )}
      {compiler.wat && <pre>{compiler.wat}</pre>}
    </div>
  );
}
