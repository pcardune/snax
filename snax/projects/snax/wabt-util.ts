import loadWabt from 'wabt';

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;

export type WabtModule = ThenArg<ReturnType<typeof loadWabt>>;
export type WasmModule = ReturnType<WabtModule['parseWat']>;

const WASM_FEATURES = {
  bulk_memory: true,
};

export async function parseWat(
  filename: string,
  buffer: string | Uint8Array
): Promise<WasmModule> {
  const wabt = await loadWabt();
  return wabt.parseWat(filename, buffer, WASM_FEATURES);
}
