import * as AST from '../spec-gen.js';
import * as IR from '../stack-ir.js';
import { irCompiler } from './test-util.js';

describe('CastExprCompiler', () => {
  const { i32, i64, f32, f64 } = IR.NumberType;
  const { Signed, Unsigned } = IR.Sign;
  const noDropSign = new Error("I don't implicitly drop signs");
  const noTruncateFloat = new Error("I don't implicitly truncate floats");
  const noWrapBits = new Error("I don't implicitly wrap to smaller sizes");
  const noDemote = new Error("I don't implicitly demote floats");
  const cases: [string, string, IR.Instruction | Error][] = [
    // source type, destination type, instruction (or error)
    // convert to f64
    ['u8', 'f64', new IR.Convert(i32, f64, Unsigned)],
    ['u16', 'f64', new IR.Convert(i32, f64, Unsigned)],
    ['u32', 'f64', new IR.Convert(i32, f64, Unsigned)],
    ['u64', 'f64', new IR.Convert(i64, f64, Unsigned)],
    ['i8', 'f64', new IR.Convert(i32, f64, Signed)],
    ['i16', 'f64', new IR.Convert(i32, f64, Signed)],
    ['i32', 'f64', new IR.Convert(i32, f64, Signed)],
    ['i64', 'f64', new IR.Convert(i64, f64, Signed)],
    ['f32', 'f64', new IR.Promote()],
    ['f64', 'f64', new IR.Nop()],
    // convert to f32
    ['u8', 'f32', new IR.Convert(i32, f32, Unsigned)],
    ['u16', 'f32', new IR.Convert(i32, f32, Unsigned)],
    ['u32', 'f32', new IR.Convert(i32, f32, Unsigned)],
    ['u64', 'f32', new IR.Convert(i64, f32, Unsigned)],
    ['i8', 'f32', new IR.Convert(i32, f32, Signed)],
    ['i16', 'f32', new IR.Convert(i32, f32, Signed)],
    ['i32', 'f32', new IR.Convert(i32, f32, Signed)],
    ['i64', 'f32', new IR.Convert(i64, f32, Signed)],
    ['f32', 'f32', new IR.Nop()],
    ['f64', 'f32', noDemote],
    // convert to i64
    ['u8', 'i64', new IR.Nop()],
    ['u16', 'i64', new IR.Nop()],
    ['u32', 'i64', new IR.Nop()],
    ['u64', 'i64', new IR.Nop()],
    ['i8', 'i64', new IR.Nop()],
    ['i16', 'i64', new IR.Nop()],
    ['i32', 'i64', new IR.Nop()],
    ['i64', 'i64', new IR.Nop()],
    ['f32', 'i64', noTruncateFloat],
    ['f64', 'i64', noTruncateFloat],
    // convert to u64
    ['u8', 'u64', new IR.Nop()],
    ['u16', 'u64', new IR.Nop()],
    ['u32', 'u64', new IR.Nop()],
    ['u64', 'u64', new IR.Nop()],
    ['i8', 'u64', noDropSign],
    ['i16', 'u64', noDropSign],
    ['i32', 'u64', noDropSign],
    ['i64', 'u64', noDropSign],
    ['f32', 'u64', noTruncateFloat],
    ['f64', 'u64', noTruncateFloat],
    // convert to i32
    ['u8', 'i32', new IR.Nop()],
    ['u16', 'i32', new IR.Nop()],
    ['u32', 'i32', new IR.Nop()],
    ['u64', 'i32', noWrapBits],
    ['i8', 'i32', new IR.Nop()],
    ['i16', 'i32', new IR.Nop()],
    ['i32', 'i32', new IR.Nop()],
    ['i64', 'i32', noWrapBits],
    ['f32', 'i32', noTruncateFloat],
    ['f64', 'i32', noTruncateFloat],
    // convert to u32
    ['u8', 'u32', new IR.Nop()],
    ['u16', 'u32', new IR.Nop()],
    ['u32', 'u32', new IR.Nop()],
    ['u64', 'u32', noWrapBits],
    ['i8', 'u32', noDropSign],
    ['i16', 'u32', noDropSign],
    ['i32', 'u32', noDropSign],
    ['i64', 'u32', noWrapBits],
    ['f32', 'u32', noTruncateFloat],
    ['f64', 'u32', noTruncateFloat],
    // convert to i16
    ['u8', 'i16', new IR.Nop()],
    ['u16', 'i16', new IR.Nop()],
    ['u32', 'i16', noWrapBits],
    ['u64', 'i16', noWrapBits],
    ['i8', 'i16', new IR.Nop()],
    ['i16', 'i16', new IR.Nop()],
    ['i32', 'i16', noWrapBits],
    ['i64', 'i16', noWrapBits],
    ['f32', 'i16', noTruncateFloat],
    ['f64', 'i16', noTruncateFloat],
    // convert to u16
    ['u8', 'u16', new IR.Nop()],
    ['u16', 'u16', new IR.Nop()],
    ['u32', 'u16', noWrapBits],
    ['u64', 'u16', noWrapBits],
    ['i8', 'u16', noDropSign],
    ['i16', 'u16', noDropSign],
    ['i32', 'u16', noWrapBits],
    ['i64', 'u16', noWrapBits],
    ['f32', 'u16', noTruncateFloat],
    ['f64', 'u16', noTruncateFloat],
    // convert to i8
    ['u8', 'i8', new IR.Nop()],
    ['u16', 'i8', noWrapBits],
    ['u32', 'i8', noWrapBits],
    ['u64', 'i8', noWrapBits],
    ['i8', 'i8', new IR.Nop()],
    ['i16', 'i8', noWrapBits],
    ['i32', 'i8', noWrapBits],
    ['i64', 'i8', noWrapBits],
    ['f32', 'i8', noTruncateFloat],
    ['f64', 'i8', noTruncateFloat],
    // convert to u8
    ['u8', 'u8', new IR.Nop()],
    ['u16', 'u8', noWrapBits],
    ['u32', 'u8', noWrapBits],
    ['u64', 'u8', noWrapBits],
    ['i8', 'u8', noDropSign],
    ['i16', 'u8', noWrapBits],
    ['i32', 'u8', noWrapBits],
    ['i64', 'u8', noWrapBits],
    ['f32', 'u8', noTruncateFloat],
    ['f64', 'u8', noTruncateFloat],
  ];

  it.each(cases)('converts from %p to %p', (source, dest, instruction) => {
    const num = AST.makeNumberLiteral(1, 'int', source);
    let cast = AST.makeCastExpr(num, AST.makeTypeRef(dest), false);
    const compiler = irCompiler(cast);
    if (instruction instanceof Error) {
      expect(() => compiler.compile()).toThrowError(instruction);
    } else {
      const ir = compiler.compile();
      expect(ir).toEqual([...compiler.compileChild(num), instruction]);
    }
  });
});
