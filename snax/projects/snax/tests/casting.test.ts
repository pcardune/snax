import binaryen from 'binaryen';
import * as AST from '../spec-gen.js';
import { NumberType, Sign, IntegerType, FloatType } from '../numbers';
import { exprCompiler, irCompiler } from './test-util.js';

abstract class BaseConversion<
  Source extends NumberType,
  Dest extends NumberType
> {
  sourceType: Source;
  destType: Dest;
  abstract get name(): string;

  constructor(sourceType: Source, destType: Dest) {
    this.sourceType = sourceType;
    this.destType = destType;
  }
}

class Convert extends BaseConversion<IntegerType, FloatType> {
  sign: Sign;
  name = 'convert';
  constructor(
    sourceType: IntegerType,
    destType: FloatType,
    sign: Sign = Sign.Signed
  ) {
    super(sourceType, destType);
    this.sign = sign;
  }
}

class Promote extends BaseConversion<NumberType.f32, NumberType.f64> {
  name = 'promote';
  constructor() {
    super(NumberType.f32, NumberType.f64);
  }
}

class Nop {}

describe('CastExprCompiler', () => {
  const { i32, i64, f32, f64 } = NumberType;
  const { Signed, Unsigned } = Sign;
  const noDropSign = new Error("I don't implicitly drop signs");
  const noTruncateFloat = new Error("I don't implicitly truncate floats");
  const noWrapBits = new Error("I don't implicitly wrap to smaller sizes");
  const noDemote = new Error("I don't implicitly demote floats");
  const cases: [string, string, Convert | Promote | Nop | Error][] = [
    // source type, destination type, instruction (or error)
    // convert to f64
    ['u8', 'f64', new Convert(i32, f64, Unsigned)],
    ['u16', 'f64', new Convert(i32, f64, Unsigned)],
    ['u32', 'f64', new Convert(i32, f64, Unsigned)],
    ['u64', 'f64', new Convert(i64, f64, Unsigned)],
    ['i8', 'f64', new Convert(i32, f64, Signed)],
    ['i16', 'f64', new Convert(i32, f64, Signed)],
    ['i32', 'f64', new Convert(i32, f64, Signed)],
    ['i64', 'f64', new Convert(i64, f64, Signed)],
    ['f32', 'f64', new Promote()],
    ['f64', 'f64', new Nop()],
    // convert to f32
    ['u8', 'f32', new Convert(i32, f32, Unsigned)],
    ['u16', 'f32', new Convert(i32, f32, Unsigned)],
    ['u32', 'f32', new Convert(i32, f32, Unsigned)],
    ['u64', 'f32', new Convert(i64, f32, Unsigned)],
    ['i8', 'f32', new Convert(i32, f32, Signed)],
    ['i16', 'f32', new Convert(i32, f32, Signed)],
    ['i32', 'f32', new Convert(i32, f32, Signed)],
    ['i64', 'f32', new Convert(i64, f32, Signed)],
    ['f32', 'f32', new Nop()],
    ['f64', 'f32', noDemote],
    // convert to i64
    ['u8', 'i64', new Nop()],
    ['u16', 'i64', new Nop()],
    ['u32', 'i64', new Nop()],
    ['u64', 'i64', new Nop()],
    ['i8', 'i64', new Nop()],
    ['i16', 'i64', new Nop()],
    ['i32', 'i64', new Nop()],
    ['i64', 'i64', new Nop()],
    ['f32', 'i64', noTruncateFloat],
    ['f64', 'i64', noTruncateFloat],
    // convert to u64
    ['u8', 'u64', new Nop()],
    ['u16', 'u64', new Nop()],
    ['u32', 'u64', new Nop()],
    ['u64', 'u64', new Nop()],
    ['i8', 'u64', noDropSign],
    ['i16', 'u64', noDropSign],
    ['i32', 'u64', noDropSign],
    ['i64', 'u64', noDropSign],
    ['f32', 'u64', noTruncateFloat],
    ['f64', 'u64', noTruncateFloat],
    // convert to i32
    ['u8', 'i32', new Nop()],
    ['u16', 'i32', new Nop()],
    ['u32', 'i32', new Nop()],
    ['u64', 'i32', noWrapBits],
    ['i8', 'i32', new Nop()],
    ['i16', 'i32', new Nop()],
    ['i32', 'i32', new Nop()],
    ['i64', 'i32', noWrapBits],
    ['f32', 'i32', noTruncateFloat],
    ['f64', 'i32', noTruncateFloat],
    // convert to u32
    ['u8', 'u32', new Nop()],
    ['u16', 'u32', new Nop()],
    ['u32', 'u32', new Nop()],
    ['u64', 'u32', noWrapBits],
    ['i8', 'u32', noDropSign],
    ['i16', 'u32', noDropSign],
    ['i32', 'u32', noDropSign],
    ['i64', 'u32', noWrapBits],
    ['f32', 'u32', noTruncateFloat],
    ['f64', 'u32', noTruncateFloat],
    // convert to i16
    ['u8', 'i16', new Nop()],
    ['u16', 'i16', new Nop()],
    ['u32', 'i16', noWrapBits],
    ['u64', 'i16', noWrapBits],
    ['i8', 'i16', new Nop()],
    ['i16', 'i16', new Nop()],
    ['i32', 'i16', noWrapBits],
    ['i64', 'i16', noWrapBits],
    ['f32', 'i16', noTruncateFloat],
    ['f64', 'i16', noTruncateFloat],
    // convert to u16
    ['u8', 'u16', new Nop()],
    ['u16', 'u16', new Nop()],
    ['u32', 'u16', noWrapBits],
    ['u64', 'u16', noWrapBits],
    ['i8', 'u16', noDropSign],
    ['i16', 'u16', noDropSign],
    ['i32', 'u16', noWrapBits],
    ['i64', 'u16', noWrapBits],
    ['f32', 'u16', noTruncateFloat],
    ['f64', 'u16', noTruncateFloat],
    // convert to i8
    ['u8', 'i8', new Nop()],
    ['u16', 'i8', noWrapBits],
    ['u32', 'i8', noWrapBits],
    ['u64', 'i8', noWrapBits],
    ['i8', 'i8', new Nop()],
    ['i16', 'i8', noWrapBits],
    ['i32', 'i8', noWrapBits],
    ['i64', 'i8', noWrapBits],
    ['f32', 'i8', noTruncateFloat],
    ['f64', 'i8', noTruncateFloat],
    // convert to u8
    ['u8', 'u8', new Nop()],
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
    let cast = AST.makeCastExpr(
      num,
      AST.makeTypeRef(AST.makeSymbolRef(dest)),
      false
    );
    const compiler = exprCompiler(cast);
    if (instruction instanceof Error) {
      expect(() => compiler.getRValue()).toThrowError(instruction.message);
    } else {
      // TODO: reimplement these tests in some better way....
      // const convertExpr = compiler.compile();
      // const valueExpr = compiler.compileChild(num);
      // const info = binaryen.getExpressionInfo(convertExpr);
      // info.id
      // expect(ir).toEqual([value, instruction]);
    }
  });

  describe('casting to pointer types', () => {
    const num = AST.makeNumberLiteral(154, 'int', 'i32');
    it('converts from i32 to &whatever', async () => {
      let cast = AST.makeCastExpr(
        num,
        AST.makePointerTypeExpr(AST.makeTypeRef(AST.makeSymbolRef('f64'))),
        true
      );
      const compiler = exprCompiler(cast);
      const ir = compiler.getRValue().expectDirect().valueExpr;
      const { module } = compiler.context;

      module.addFunction('main', binaryen.createType([]), binaryen.i32, [], ir);
      module.addFunctionExport('main', 'main');
      const { main } = (await WebAssembly.instantiate(module.emitBinary()))
        .instance.exports as { main: () => any };
      expect(main()).toEqual(154);
    });
    it('will not convert without being forced', () => {
      let cast = AST.makeCastExpr(
        num,
        AST.makePointerTypeExpr(AST.makeTypeRef(AST.makeSymbolRef('f64'))),
        false
      );
      expect(() =>
        exprCompiler(cast).getRValue()
      ).toThrowErrorMatchingInlineSnapshot(
        `"CompilerError at <unknown>: I only convert i32s to pointer types, and only when forced."`
      );
    });
  });
});
