import { ok, Result } from 'neverthrow';
import React, { useEffect, useState } from 'react';
import loadWabt from 'wabt';
import { ASTNode } from '../../dist/snax/snax-ast';
import { SNAXParser } from '../../dist/snax/snax-parser';
import { compileStr } from '../../dist/snax/wat-compiler';

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
    <pre>
      <code>{formattedWAT}</code>
    </pre>
  );
}

function CompilerOutput({ wat }: { wat: string }) {
  const [runOutput, setRunOutput] = useState<any>();
  const [runError, setRunError] = useState<any>();
  const onClickRun = async () => {
    const wabt = await loadWabt();
    const wasmModule = wabt.parseWat('', wat);
    wasmModule.validate();
    const result = wasmModule.toBinary({ write_debug_names: true });
    const module = await WebAssembly.instantiate(result.buffer);
    const exports: any = module.instance.exports;
    try {
      setRunOutput(exports.main());
      setRunError(null);
    } catch (e) {
      setRunError(e);
    }
  };
  return (
    <div>
      <WATOutput wat={wat} />
      <button onClick={onClickRun}>Run</button>
      <div>
        Output: <code>{runOutput}</code>
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

  const onClickCompile = async () => {
    setParse(null);
    setWAT(compileStr(text));
  };

  const onClickParse = () => {
    process.env.DEBUG = 'true';
    setParse(SNAXParser.parseStr(text));
  };

  const onChangeText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
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
