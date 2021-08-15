import { SingleCharNFA } from "./regex-nfa";

test("SingleCharNFA", () => {
  expect("\n" + new SingleCharNFA("a").toDebugStr()).toMatchInlineSnapshot(`
"
     δ    a
  >s0:  *s1
  *s1:   se
"
`);
});

describe("concat()", () => {
  let aNFA = new SingleCharNFA("a");
  let bNFA = new SingleCharNFA("b");

  test("concat(ab)", () => {
    expect("\n" + aNFA.concat(bNFA).toDebugStr()).toMatchInlineSnapshot(`
"
     δ   a    b   ￿
  >s0:  s1   se  se
   s1:  se   se  s2
   s2:  se  *s3  se
  *s3:  se   se  se
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
     δ   a      ￿   b
   s0:  s1     se  se
   s1:  se    *s3  se
  >s2:  se  s0,s4  se
  *s3:  se     se  se
   s4:  se     se  s5
   s5:  se    *s3  se
"
`);
  });
});

describe("star()", () => {
  let aNFA = new SingleCharNFA("a");
  test("star(a)", () => {
    expect("\n" + aNFA.star().toDebugStr()).toMatchInlineSnapshot(`
"
     δ   a       ￿
   s0:  s1      se
   s1:  se  s0,*s3
  >s2:  se  s0,*s3
  *s3:  se      se
"
`);
  });
});
