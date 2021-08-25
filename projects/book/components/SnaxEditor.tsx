import { ok, Result } from 'neverthrow';
import { useState } from 'react';
import loadWabt from 'wabt';
import { ASTNode } from '../../snax/snax-ast';
import { SNAXParser } from '../../snax/snax-parser';
import { compileStr } from '../../snax/wat-compiler';

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
      <pre>
        <code>{wat}</code>
      </pre>
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
  const [wat, setWAT] = useState<Result<string, any>>(ok(''));
  const [parse, setParse] = useState<Result<ASTNode, any> | null>(null);

  const onClickCompile = () => {
    setParse(null);
    setWAT(compileStr(text));
  };

  const onClickParse = () => {
    process.env.DEBUG = 'true';
    setParse(SNAXParser.parseStr(text));
  };

  return (
    <div>
      <div>
        <textarea
          style={{ width: '100%', height: 200 }}
          onChange={(e) => setText(e.target.value)}
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
      {wat.isOk() ? (
        <CompilerOutput wat={wat.value} />
      ) : (
        <div>{wat.error.toString()}</div>
      )}
    </div>
  );
}
