import { SingleCharNFA } from './regex-nfa';

test('SingleCharNFA', () => {
  expect('\n' + new SingleCharNFA('a').toDebugStr()).toMatchInlineSnapshot(`
"
     δ    a
  >s0:  *s1
  *s1:    _
"
`);
});

describe('concat()', () => {
  let aNFA = new SingleCharNFA('a');
  let bNFA = new SingleCharNFA('b');

  test('concat(ab)', () => {
    expect('\n' + aNFA.concat(bNFA).toDebugStr()).toMatchInlineSnapshot(`
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

describe('or()', () => {
  let aNFA = new SingleCharNFA('a');
  let bNFA = new SingleCharNFA('b');
  test('or(ab)', () => {
    expect('\n' + aNFA.or(bNFA).toDebugStr()).toMatchInlineSnapshot(`
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

describe('star()', () => {
  let aNFA = new SingleCharNFA('a');
  test('star(a)', () => {
    expect('\n' + aNFA.star().toDebugStr()).toMatchInlineSnapshot(`
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

describe('toDFA', () => {
  let aOrB = charClass('abcd');
  test('toDFA(a|b|c|d)', () => {
    const dfa = aOrB.toDFA();
    expect('\n' + dfa.toDebugStr()).toMatchInlineSnapshot(`
"
     δ    a    b    c    d
  >s0:  *s1  *s2  *s3  *s4
  *s1:    _    _    _    _
  *s2:    _    _    _    _
  *s3:    _    _    _    _
  *s4:    _    _    _    _
"
`);
  });
});
