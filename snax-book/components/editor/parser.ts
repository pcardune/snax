import { parser } from './grammar/snx-lang.js';
import {
  foldNodeProp,
  foldInside,
  indentNodeProp,
  LRLanguage,
  LanguageSupport,
  HighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';
import { completeFromList } from '@codemirror/autocomplete';
import hoverTypeInfo from './cm-extensions/hover-type-info';

let parserWithMetadata = parser.configure({
  props: [
    styleTags({
      '⚠': t.invalid,
      Identifier: t.local(t.variableName),
      NumberLiteral: t.number,
      Boolean: t.bool,
      String: t.string,
      Char: t.literal,
      LineComment: t.lineComment,
      LogicOp: t.logicOperator,
      ArithOp: t.arithmeticOperator,
      'extern import from': t.keyword,
      'ImportStatement/Identifier': t.local(t.variableName),
      'StructPropDecl/Identifier': t.propertyName,
      'StructLiteral/Identifier': t.typeName,
      'StructPropValue/identifier': t.definition(t.propertyName),
      'ParameterList/Identifier': [t.variableName, t.emphasis],
      'TypeExpr TypeExpr/Identifier': t.typeName,
      CompilerCall: t.special(t.variableName),
      'FuncDeclBegin/Identifier': t.definition(t.variableName),
      'VarDecl/VarName': t.definition(t.variableName),
      'while if else return': t.controlKeyword,
      'global reg let func struct': t.definitionKeyword,
      pub: t.annotation,
      'CastExpr CastExpr/as': t.operatorKeyword,
      '( )': t.paren,
    }),
    indentNodeProp.add({
      Statement: (context) => context.column(context.node.from) + context.unit,
    }),
    // indentNodeProp.add({
    //   Application: (context) =>
    //     context.column(context.node.from) + context.unit,
    // }),
    foldNodeProp.add({
      Application: foldInside,
    }),
  ],
});

export const exampleLanguage = LRLanguage.define({
  parser: parserWithMetadata,
  languageData: {
    commentTokens: { line: '//' },
  },
});

export const exampleCompletion = exampleLanguage.data.of({
  autocomplete: completeFromList([
    { label: 'func', type: 'keyword' },
    { label: 'struct', type: 'keyword' },
    { label: 'import', type: 'keyword' },
    { label: 'let', type: 'keyword' },
    { label: 'reg', type: 'keyword' },
    { label: 'global', type: 'keyword' },
    { label: 'while', type: 'keyword' },
    { label: 'return', type: 'keyword' },
    { label: '$heap_start', type: 'function' },
  ]),
});

const myHighlightStyle = HighlightStyle.define([
  { tag: t.variableName, color: '#0000ff' },
  { tag: t.propertyName, color: '#bbbb00' },
  { tag: t.definitionKeyword, color: '#00aa00' },
  { tag: t.controlKeyword, color: '#cc5500' },
  { tag: t.function(t.variableName), color: '#ff0000' },
  { tag: t.invalid, color: 'red', 'text-decoration': 'underline' },
]);

export function example() {
  return new LanguageSupport(exampleLanguage, [
    exampleCompletion,
    syntaxHighlighting(myHighlightStyle),
    // the above line replaces the below line... does it work?
    // myHighlightStyle.fallback,
    hoverTypeInfo,
  ]);
}
