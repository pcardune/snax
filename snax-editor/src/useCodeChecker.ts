import React from 'react';
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser';
import { compileAST } from '@pcardune/snax/dist/snax/wat-compiler';
import {
  NodeError,
  TypeResolutionError,
} from '@pcardune/snax/dist/snax/errors';
import { WASI } from '@pcardune/snax/dist/snax/wasi';
import { useFileServer } from './file-server-client';
import { ASTNode, File } from '@pcardune/snax/dist/snax/spec-gen';
import { parser } from './grammar/snx-lang.js';
import binaryen from 'binaryen';
import {
  FileCompiler,
  WASM_FEATURE_FLAGS,
} from '@pcardune/snax/dist/snax/ast-compiler';

function useSnaxCompiler() {
  const client = useFileServer();

  return React.useCallback(
    (ast: File) =>
      compileAST(ast, {
        includeRuntime: true,
        importResolver: async (sourcePath, fromCanonicalUrl) => {
          const file = sourcePath.startsWith('snax/')
            ? await client.getStdlibFile(sourcePath)
            : await client.readFile(sourcePath);
          const result = SNAXParser.parseStr(file.content, 'start', {
            grammarSource: file.url,
          });
          if (result.isOk()) {
            const ast = result.value;
            if (ast.name !== 'File') {
              throw new Error(`invalid parse result, expected a file.`);
            }
            return { ast, canonicalUrl: file.url };
          } else {
            throw new Error(`Failed to parse ${sourcePath}: ${result.error}`);
          }
        },
      }),
    [client]
  );
}

function debugParse(code: string) {
  const tree = parser.parse(code);
  const lines: string[] = [];
  let indent = '';
  tree.iterate({
    enter: (type, from, to, get) => {
      lines.push(`${indent}<${type.name}>`);
      indent += '  ';
    },
    leave: (type, from, to, get) => {
      indent = indent.slice(2);
    },
  });
  console.log(lines.join('\n'));
}

type RunChecksOutput = {
  binary: Uint8Array;
  sourceMap: { url: string; content: string | null };
};

type RunCodeOutput = undefined | number;

export type CodeRunner = {
  runCode: (wasi: WASI) => Promise<RunCodeOutput>;
  instance?: Instance;
};

export type CodeChecker = CodeRunner & {
  checks: { label: string; state: boolean | undefined }[];
  error: { node?: ASTNode; message: string } | null;
  ast: ASTNode | null;
  compiler: FileCompiler | null;
  runChecks: (
    code: string,
    grammarSource?: string
  ) => Promise<RunChecksOutput | undefined>;
};

export type Instance = WebAssembly.Instance & {
  exports: WebAssembly.Exports & {
    memory: WebAssembly.Memory;
    stackPointer: WebAssembly.Global;
  };
};

function useCodeRunner(
  wasmModule: React.RefObject<WebAssembly.Module | undefined>
): CodeRunner {
  const [instance, setInstance] = React.useState<Instance>();
  const runCode = React.useCallback(
    async (wasi: WASI): Promise<RunCodeOutput> => {
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

export default function useCodeChecker(optimize = false): CodeChecker {
  const [parses, setParses] = React.useState<boolean | undefined>();
  const [typeChecks, setTypechecks] = React.useState<boolean | undefined>();
  const [compiles, setCompiles] = React.useState<boolean | undefined>();
  const [validates, setValidates] = React.useState<boolean | undefined>();
  const [error, setError] = React.useState<{
    node?: ASTNode;
    message: string;
  } | null>(null);
  const wasmModuleRef = React.useRef<WebAssembly.Module>();
  const [ast, setAST] = React.useState<ASTNode | null>(null);
  const [compiler, setCompiler] = React.useState<FileCompiler | null>(null);

  const compileAST = useSnaxCompiler();

  const runChecks = React.useCallback(
    async (
      code: string,
      grammarSource: string = ''
    ): Promise<RunChecksOutput | undefined> => {
      const result = SNAXParser.parseStr(code, 'start', {
        grammarSource,
      });
      setParses(result.isOk());
      if (result.isOk()) {
        const ast = result.value;
        setAST(ast);
        if (ast.name === 'File') {
          try {
            let { binaryenModule, compiler } = await compileAST(ast);
            setCompiler(compiler);
            setTypechecks(true);
            setCompiles(true);
            setError(null);

            const validates = binaryenModule.validate();
            setValidates(!!validates);
            if (validates) {
              // now optimize it...
              const sourceMapUrl = grammarSource + '.map';
              let { binary, sourceMap } =
                binaryenModule.emitBinary(sourceMapUrl);
              if (optimize) {
                binaryenModule.dispose();
                binaryenModule = binaryen.readBinary(binary);
                binaryen.setOptimizeLevel(2);
                binaryenModule.setFeatures(WASM_FEATURE_FLAGS);
                binaryenModule.optimize();
                const newOutput = binaryenModule.emitBinary(sourceMapUrl);
                binary = newOutput.binary;
                sourceMap = newOutput.sourceMap;
              }

              wasmModuleRef.current = await WebAssembly.compile(binary.buffer);
              binaryenModule.dispose();
              return {
                binary,
                sourceMap: { url: sourceMapUrl, content: sourceMap },
              };
            } else {
              setError({ message: 'Failed to validate' });
            }
            return;
          } catch (e) {
            setCompiler(null);
            setError({
              node: e instanceof NodeError ? e.node : undefined,
              message: String(e),
            });
            if (e instanceof TypeResolutionError) {
              setTypechecks(false);
            } else {
              console.error(e);
              setTypechecks(true);
            }
            setCompiles(false);
            setValidates(false);
          }
        }
      } else {
        setAST(null);
        setError({ message: String(result.error) });
        setTypechecks(false);
        setCompiles(false);
      }
    },
    [compileAST, optimize]
  );
  const { runCode, instance } = useCodeRunner(wasmModuleRef);

  const checks = [
    { label: 'parses', state: parses },
    { label: 'type checks', state: typeChecks },
    { label: 'compiles', state: compiles },
    { label: 'validates', state: validates },
  ];
  return { checks, error, ast, compiler, runChecks, runCode, instance };
}
