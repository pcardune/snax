export class WASI {
  private _instance?: WebAssembly.Instance;
  private get instance() {
    if (!this._instance) {
      throw new Error(`start() wasn't called`);
    }
    return this._instance;
  }

  private get memory() {
    return this.instance.exports.memory as WebAssembly.Memory;
  }

  readonly wasiImport = {
    fd_write: (
      fd: number,
      iovPointer: number,
      iovLength: number,
      numWrittenPointer: number
    ) => {
      let [start, length] = [
        ...new Int32Array(
          this.memory.buffer.slice(
            (iovPointer / 4) * 4,
            (iovPointer / 4) * 4 + 8
          )
        ),
      ];
      const strBuffer = new Int8Array(
        this.memory.buffer.slice((start / 4) * 4, (start / 4) * 4 + length)
      );
      const output = new TextDecoder('utf-8').decode(strBuffer);
      this.stdout.write(output);
    },
    fd_read: () => {
      throw new Error('not implemented yet');
    },
  };

  stdout = {
    write: (str: string) => {
      console.log(str);
    },
  };

  start(instance: WebAssembly.Instance) {
    const { exports } = instance;
    if (!exports._start || typeof exports._start !== 'function') {
      throw new Error(`No _start() function. Not WASI compatible`);
    }
    this._instance = instance;
    return exports._start();
  }
}
