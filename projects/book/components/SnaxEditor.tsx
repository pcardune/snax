import { ok, Result } from 'neverthrow';
import { useState } from 'react';
import loadWabt from 'wabt';
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

export function SnaxEditor() {
  const [text, setText] = useState('');
  const [wat, setWAT] = useState<Result<string, any>>(ok(''));

  const onClickCompile = () => {
    setWAT(compileStr(text));
  };

  return (
    <div>
      <div>
        <textarea onChange={(e) => setText(e.target.value)} value={text} />
      </div>

      <button onClick={onClickCompile}>Compile</button>
      {wat.isOk() ? (
        <CompilerOutput wat={wat.value} />
      ) : (
        <div>{wat.error.toString()}</div>
      )}
    </div>
  );
}
