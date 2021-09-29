import { Result } from 'neverthrow';
import React, { useEffect, useState } from 'react';
import { ASTNode } from '@pcardune/snax/dist/snax/spec-gen.js';
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser.js';
import { compileStr } from '@pcardune/snax/dist/snax/wat-compiler.js';
import styled from 'styled-components';
import type binaryen from 'binaryen';

const OutputScroller = styled.pre`
  overflow: scroll;
  max-height: 200px;
`;

function WATOutput(props: { wat: string }) {
  return (
    <OutputScroller>
      <code>{props.wat}</code>
    </OutputScroller>
  );
}

function CompilerOutput(props: { module: binaryen.Module }) {
  const [runOutput, setRunOutput] = useState<any>();
  const [runError, setRunError] = useState<any>();
  const [shouldDebug, setShouldDebug] = useState(false);
  const onClickRun = async () => {
    setRunOutput('');

    let output = '';
    const module = await WebAssembly.instantiate(props.module.emitBinary(), {
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
        fd_read() {},
      },
    });
    const exports: any = module.instance.exports;
    try {
      if (shouldDebug) {
        // eslint-disable-next-line no-debugger
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
      <WATOutput wat={props.module.emitText()} />
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
  const [wat, setWAT] = useState<Result<binaryen.Module, any> | null>(null);
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
        <CompilerOutput module={wat.value} />
      ) : (
        <div>{wat?.error.toString()}</div>
      )}
    </div>
  );
}
