export enum StateType {
  Terminal,
  Internal,
}

export type EndState<T> = {
  type: StateType.Terminal;
  token: T;
  retract: number;
};
export type Matcher = (s: string) => boolean;
export type Edge = { char: Matcher; next: number };

export type InternalState = {
  type: StateType.Internal;
  edges: Edge[];
};

export type State<T> = EndState<T> | InternalState;

export type Graph<T> = State<T>[];

export const matchChar = (c: string) => {
  if (c.length != 1) {
    throw new Error(`matchChar is only for single characters. Given "${c}"`);
  }
  return (s: string) => s == c;
};
export const matchCharIn = (chars: string) => (s: string) => {
  for (let i = 0; i < chars.length; i++) {
    if (s == chars[i]) {
      return true;
    }
  }
  return false;
};
export const matchUnion = (matchers: Matcher[]) => (s: string) => {
  for (const matcher of matchers) {
    if (matcher(s)) {
      return true;
    }
  }
  return false;
};
export const matchAny = () => (s: string) => true;
export function terminal<T>(token: T, retract?: number): EndState<T> {
  return {
    type: StateType.Terminal,
    token,
    retract: retract || 0,
  };
}
export function inner(edges: Edge[]): InternalState {
  return {
    type: StateType.Internal,
    edges,
  };
}
export type Pos = number;
export type Span = { from: Pos; to: Pos };
export type Lexeme<T> = { token: T } & Span;
export type MatchResult<T> = Lexeme<T> | false;

export function lexeme<T>(token: T, from: Pos, to: Pos): Lexeme<T> {
  return {
    token,
    from,
    to,
  };
}

export function matchGraph<T>(graph: Graph<T>, input: string): MatchResult<T> {
  let index = 0;
  let lexemeBegin = 0;
  let forward = 0;

  while (true) {
    const state = graph[index];
    if (state.type == StateType.Internal) {
      // this is an internal node in the graph
      let found = false;
      for (const edge of state.edges) {
        if (edge.char(input[forward])) {
          found = true;
          index = edge.next;
          forward++;
          break;
        }
      }
      if (!found) {
        return false;
      }
    } else {
      // this is a terminal node in the graph
      if (state.retract) {
        forward -= state.retract;
      }
      return lexeme(state.token, lexemeBegin, forward);
    }
  }
}

export function sequence<T>(sequence: string, token: T): Graph<T> {
  let graph: Graph<T> = [];
  let i = 0;
  for (; i < sequence.length; i++) {
    graph.push(inner([{ char: matchChar(sequence[i]), next: i + 1 }]));
  }
  graph.push(terminal(token, 1));
  return graph;
}
