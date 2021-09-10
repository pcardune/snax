import { ok, Result } from 'neverthrow';
import React, { useEffect, useState } from 'react';
import loadWabt from 'wabt';
import { ASTNode } from '@pcardune/snax/dist/snax/spec-gen.js';
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser.js';
import { compileStr } from '@pcardune/snax/dist/snax/wat-compiler.js';
import styled from 'styled-components';

const OutputScroller = styled.pre`
  overflow: scroll;
  max-height: 200px;
`;

function WATOutput(props: { wat: string }) {
  const [formattedWAT, setFormattedWAT] = useState(props.wat);
  useEffect(() => {
    (async () => {
      const wabt = await loadWabt();
      let wasmModule;
      try {
        wasmModule = wabt.parseWat('', props.wat);
      } catch (e) {
        return;
      }

      setFormattedWAT(wasmModule.toText({ foldExprs: true }));
    })();
  }, [props.wat]);

  return (
    <OutputScroller>
      <code>{formattedWAT}</code>
    </OutputScroller>
  );
}

function CompilerOutput({ wat }: { wat: string }) {
  const [runOutput, setRunOutput] = useState<any>();
  const [runError, setRunError] = useState<any>();
  const [shouldDebug, setShouldDebug] = useState(false);
  const onClickRun = async () => {
    setRunOutput('');

    const wabt = await loadWabt();
    const wasmModule = wabt.parseWat('', wat);
    wasmModule.validate();
    const result = wasmModule.toBinary({ write_debug_names: true });
    let output = '';
    const module = await WebAssembly.instantiate(result.buffer, {
      wasi_unstable: {
        fd_write(
          fd: number,
          iovPointer: number,
          iovLength: number,
          numWrittenPointer: number
        ) {
          const memory = module.instance.exports.memory as WebAssembly.Memory;
          console.log(
            'called fd_write with',
            fd,
            iovPointer,
            iovLength,
            numWrittenPointer
          );
          let [start, length] = [
            ...new Int32Array(
              memory.buffer.slice(
                (iovPointer / 4) * 4,
                (iovPointer / 4) * 4 + 8
              )
            ),
          ];
          const strBuffer = new Int8Array(
            memory.buffer.slice((start / 4) * 4, (start / 4) * 4 + length)
          );
          output += new TextDecoder('utf-8').decode(strBuffer);
          setRunOutput(output);
          console.log(output);
        },
      },
    });
    const exports: any = module.instance.exports;
    try {
      if (shouldDebug) {
        debugger;
      }
      exports._start();
      // setRunOutput();
      setRunError(null);
    } catch (e) {
      setRunError(e);
    }
  };

  return (
    <div>
      <WATOutput wat={wat} />
      <button onClick={onClickRun}>Run</button>
      <input
        type="checkbox"
        checked={shouldDebug}
        onChange={(e) => setShouldDebug(e.target.checked)}
      />{' '}
      debug
      <div>
        Output:{' '}
        <pre>
          <code>{runOutput}</code>
        </pre>
      </div>
      {runError && (
        <div>
          Error: <code>{runOutput}</code>
        </div>
      )}
    </div>
  );
}

function ParseOutput({ ast }: { ast: ASTNode }) {
  return (
    <div>
      <pre>
        <code>{ast.toString()}</code>
      </pre>
    </div>
  );
}

export function SnaxEditor() {
  const [text, setText] = useState('let x = 3;');
  const [wat, setWAT] = useState<Result<string, any> | null>(null);
  const [parse, setParse] = useState<Result<ASTNode, any> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('snax-code');
    if (saved) {
      setText(saved);
    }
  }, []);

  const onClickCompile = async () => {
    setParse(null);
    setWAT(compileStr(text));
  };

  const onClickParse = () => {
    process.env.DEBUG = 'true';
    setParse(SNAXParser.parseStr(text));
  };

  const onChangeText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    localStorage.setItem('snax-code', e.target.value);
    setText(e.target.value);
    setWAT(ok(''));
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
      <button onClick={onClickCompile}>Compile</button>
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
      {wat && wat.isOk() ? (
        <CompilerOutput wat={wat.value} />
      ) : (
        <div>{wat?.error.toString()}</div>
      )}
    </div>
  );
}
