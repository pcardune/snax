/**
 * Common type declaractions
 */

/**
 * Something that has a debug str
 */
export interface IHaveDebugStr {
  toDebugStr(): string;
}

export function log(...args: any[]) {
  logger.log(...args);
}

type Listener = (...args: any[]) => void;
class Logger {
  static readonly instance = new Logger();
  private listeners: Set<Listener> = new Set();
  private debugFile: any = undefined;

  private constructor() {}

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  log(...args: any[]) {
    for (const listener of this.listeners) {
      try {
        listener(...args);
      } catch {}
    }
    if (process.env.DEBUG) {
      console.log(...args);
    } else if (process.env.DEBUG_FILE) {
      const fs = require('fs');
      if (!this.debugFile) {
        this.debugFile = fs.openSync(process.env.DEBUG_FILE, 'w');
      }
      fs.writeSync(this.debugFile, args.join(' ') + '\n');
    }
  }

  capture<R>(insideFunc: () => R, logs: string[]): R {
    const unsub = this.subscribe((...args: any[]) => logs.push(args.join(' ')));
    const result = insideFunc();
    unsub();
    return result;
  }
}
export const logger = Logger.instance;

let shouldUseColors = false;
export function useColors() {
  shouldUseColors = true;
}

const ColorCodes = {
  black: '\u001b[30m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
  white: '\u001b[37m',
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  underline: '\u001b[4m',
  reversed: '\u001b[7m',
};
type ColorFuncs = {
  [Property in keyof typeof ColorCodes]: (s: string) => string;
};
const colors: ColorFuncs = {} as ColorFuncs;
for (let key in ColorCodes) {
  let color = key as keyof ColorFuncs;
  colors[color] = (s: string): string =>
    shouldUseColors ? ColorCodes[color] + s + ColorCodes.reset : s;
}
export { colors };
