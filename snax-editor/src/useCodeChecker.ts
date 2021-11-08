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

function useSnaxCompiler() {
  const client = useFileServer();

  return React.useCallback(
    (ast: File) =>
      compileAST(ast, {
        importResolver: async (sourcePath) => {
          if (sourcePath.startsWith('snax/')) {
            sourcePath = '/snax/stdlib/' + sourcePath;
          }
          const file = await client.readFile(sourcePath);
          const ast = SNAXParser.parseStrOrThrow(file.content, 'start', {
            grammarSource: file.url,
          });
          if (ast.name !== 'File') {
            throw new Error(`invalid parse result, expected a file.`);
          }
          return ast;
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

export type CodeChecker = {
  checks: { label: string; state: boolean | undefined }[];
  error: { node?: ASTNode; message: string } | null;
  runChecks: (code: string) => Promise<void>;
  runCode: () => Promise<void>;
};

export default function useCodeChecker(): CodeChecker {
  const [parses, setParses] = React.useState<boolean | undefined>();
  const [typeChecks, setTypechecks] = React.useState<boolean | undefined>();
  const [compiles, setCompiles] = React.useState<boolean | undefined>();
  const [validates, setValidates] = React.useState<boolean | undefined>();
  const [error, setError] = React.useState<{
    node?: ASTNode;
    message: string;
  } | null>(null);
  const [wasmModule, setModule] = React.useState<WebAssembly.Module>();

  const compileAST = useSnaxCompiler();

  const runChecks = React.useCallback(
    async (code: string) => {
      const result = SNAXParser.parseStr(code);
      debugParse(code);
      setParses(result.isOk());
      if (result.isOk()) {
        const ast = result.value;
        if (ast.name === 'File') {
          try {
            const binaryenModule = await compileAST(ast);
            setTypechecks(true);
            setCompiles(true);
            setError(null);

            const validates = binaryenModule.validate();
            setValidates(!!validates);
            if (validates) {
              setModule(
                await WebAssembly.compile(binaryenModule.emitBinary().buffer)
              );
            } else {
              setError({ message: 'Failed to validate' });
            }
            return;
          } catch (e) {
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
          }
        }
      } else {
        setError({ message: String(result.error) });
        setTypechecks(false);
        setCompiles(false);
      }
    },
    [compileAST]
  );
  const runCode = React.useCallback(async () => {
    if (wasmModule) {
      const wasi = new WASI();
      // TODO: do debugging in a better way
      const modInstance = await WebAssembly.instantiate(wasmModule, {
        wasi_snapshot_preview1: wasi.wasiImport,
        wasi_unstable: wasi.wasiImport,
        debug: { debug: (...a: any[]) => console.log('debug', ...a) },
      });
      (window as any).wasm = modInstance.exports;
      const result = wasi.start(modInstance);
      console.log('Run Result:', result);
    }
  }, [wasmModule]);

  const checks = [
    { label: 'parses', state: parses },
    { label: 'type checks', state: typeChecks },
    { label: 'compiles', state: compiles },
    { label: 'validates', state: validates },
  ];
  return { checks, error, runChecks, runCode };
}
