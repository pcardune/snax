import { CombinedNFA, SingleCharNFA } from "./regex-nfa";

test("SingleCharNFA", () => {
  expect("\n" + new SingleCharNFA("a").toDebugStr()).toMatchInlineSnapshot(`
    "
         δ    a
      >s0:  *s1
      *s1:    _
    "
  `);
});

describe("concat()", () => {
  let aNFA = new SingleCharNFA("a");
  let bNFA = new SingleCharNFA("b");

  test("concat(ab)", () => {
    expect("\n" + aNFA.concat(bNFA).toDebugStr()).toMatchInlineSnapshot(`
      "
           δ   a    b   ϵ
        >s0:  s1    _   _
         s1:   _    _  s2
         s2:   _  *s3   _
        *s3:   _    _   _
      "
    `);
  });
});

describe("or()", () => {
  let aNFA = new SingleCharNFA("a");
  let bNFA = new SingleCharNFA("b");
  test("or(ab)", () => {
    expect("\n" + aNFA.or(bNFA).toDebugStr()).toMatchInlineSnapshot(`
      "
           δ   a      ϵ   b
         s0:  s1      _   _
         s1:   _    *s3   _
        >s2:   _  s0,s4   _
        *s3:   _      _   _
         s4:   _      _  s5
         s5:   _    *s3   _
      "
    `);
  });
});

describe("star()", () => {
  let aNFA = new SingleCharNFA("a");
  test("star(a)", () => {
    expect("\n" + aNFA.star().toDebugStr()).toMatchInlineSnapshot(`
      "
           δ   a       ϵ
         s0:  s1       _
         s1:   _  s0,*s3
        >s2:   _  s0,*s3
        *s3:   _       _
      "
    `);
  });
});

function char(char: string) {
  return new SingleCharNFA(char);
}

function charClass(chars: string) {
  let re = char(chars[0]);
  for (let i = 1; i < chars.length; i++) {
    re.or(char(chars[i]));
  }
  return re;
}

function str(chars: string) {
  let re = char(chars[0]);
  for (let i = 1; i < chars.length; i++) {
    re.concat(char(chars[i]));
  }
  return re;
}

describe("toDFA", () => {
  let aOrB = charClass("abcd");
  test("toDFA(a|b|c|d)", () => {
    const dfa = aOrB.toDFA();
    expect("\n" + dfa.toDebugStr()).toMatchInlineSnapshot(`
      "
      DFAfromNFA:
           δ    a    b    c    d
        >s0:  *s1  *s2  *s3  *s4
        *s1:    _    _    _    _
        *s2:    _    _    _    _
        *s3:    _    _    _    _
        *s4:    _    _    _    _

      Mapping from DFA state to source NFA states:
      s0: {0,2,4,6,8,10,12}
      s1: {1,3,7,11}
      s2: {3,5,7,11}
      s3: {7,9,11}
      s4: {11,13}
      "
    `);
  });
});

describe("CombinedNFA", () => {
  const nfas = [str("who"), str("what"), str("where")];

  test("toDebugStr", () => {
    let combined = new CombinedNFA(nfas);
    expect("\n" + combined.toDebugStr()).toMatchInlineSnapshot(`
      "
      CombinedNFA:
            δ    w    h          ￿    o    a     t     e    r
          s0:   s1    _          _    _    _     _     _    _
          s1:    _    _         s2    _    _     _     _    _
          s2:    _   s3          _    _    _     _     _    _
          s3:    _    _         s4    _    _     _     _    _
          s4:    _    _          _  *s5    _     _     _    _
         *s5:    _    _          _    _    _     _     _    _
          s6:   s7    _          _    _    _     _     _    _
          s7:    _    _         s8    _    _     _     _    _
          s8:    _   s9          _    _    _     _     _    _
          s9:    _    _        s10    _    _     _     _    _
         s10:    _    _          _    _  s11     _     _    _
         s11:    _    _        s12    _    _     _     _    _
         s12:    _    _          _    _    _  *s13     _    _
        *s13:    _    _          _    _    _     _     _    _
         s14:  s15    _          _    _    _     _     _    _
         s15:    _    _        s16    _    _     _     _    _
         s16:    _  s17          _    _    _     _     _    _
         s17:    _    _        s18    _    _     _     _    _
         s18:    _    _          _    _    _     _   s19    _
         s19:    _    _        s20    _    _     _     _    _
         s20:    _    _          _    _    _     _     _  s21
         s21:    _    _        s22    _    _     _     _    _
         s22:    _    _          _    _    _     _  *s23    _
        *s23:    _    _          _    _    _     _     _    _
        >s24:    _    _  s0,s6,s14    _    _     _     _    _

      0: [5]
      1: [13]
      2: [23]
      state to source nfa mapping:
      5: 0
      13: 1
      23: 2
      "
    `);
  });
});

describe("CombinedDFA", () => {
  test("toDebugStr", () => {
    const nfas = [str("who"), str("what"), str("where")];
    let combined = new CombinedNFA(nfas).toCombinedDFA();
    expect("\n" + combined.toDebugStr()).toMatchInlineSnapshot(`
      "
      CombinedDFA:
      DFAfromNFA:
           δ   w   h    o   a    t    e   r
        >s0:  s1   _    _   _    _    _   _
         s1:   _  s2    _   _    _    _   _
         s2:   _   _  *s3  s4    _   s5   _
        *s3:   _   _    _   _    _    _   _
         s4:   _   _    _   _  *s8    _   _
         s5:   _   _    _   _    _    _  s6
         s6:   _   _    _   _    _  *s7   _
        *s7:   _   _    _   _    _    _   _
        *s8:   _   _    _   _    _    _   _

      Mapping from DFA state to source NFA states:
      s0: {0,6,14,24}
      s1: {1,2,7,8,15,16}
      s2: {3,4,9,10,17,18}
      s3: {5}
      s4: {11,12}
      s5: {19,20}
      s6: {21,22}
      s7: {23}
      s8: {13}

      Mapping from DFA state to source nfa index:
      3: [0]
      8: [1]
      7: [2]
      "
    `);
  });

  test("Overlapping NFAs", () => {
    const nfas = [charClass("ab"), charClass("bc")];
    let combined = new CombinedNFA(nfas).toCombinedDFA();
    expect("\n" + combined.toDebugStr()).toMatchInlineSnapshot(`
      "
      CombinedDFA:
      DFAfromNFA:
           δ    a    b    c
        >s0:  *s1  *s2  *s3
        *s1:    _    _    _
        *s2:    _    _    _
        *s3:    _    _    _

      Mapping from DFA state to source NFA states:
      s0: {0,2,4,6,8,10,12}
      s1: {1,3}
      s2: {3,5,7,9}
      s3: {9,11}

      Mapping from DFA state to source nfa index:
      1: [0]
      2: [0,1]
      3: [1]
      "
    `);
  });
});
