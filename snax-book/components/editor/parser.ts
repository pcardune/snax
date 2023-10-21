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
      'NumberLiteral/identifier': t.typeName,
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
      'StructPropValue/Identifier': t.definition(t.propertyName),
      'ParameterList/identifier': [t.variableName, t.emphasis],
      'TypeExpr TypeExpr/Identifier': t.typeName,
      CompilerCall: t.special(t.variableName),
      'FuncDeclBegin/Identifier': t.function(t.variableName),
      'ModuleDecl/Identifier': t.definition(t.variableName),
      'VarDecl/VarName': t.definition(t.variableName),
      'while if else return': t.controlKeyword,
      return: t.keyword,
      'global reg let func struct module': t.definitionKeyword,
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

export const exported = 123;
export function foo(a: boolean) {
  let b = 123;
  if (true) {
    console.log('whatever');
  }
}

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
    { label: 'module', type: 'keyword' },
    { label: '$heap_start', type: 'function' },
  ]),
});

const myHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'rgb(175,1,219)' },
  { tag: t.variableName, color: 'rgb(6,113,194)' },
  { tag: t.propertyName, color: '#bbbb00' },
  { tag: t.definitionKeyword, color: '#0000ff' },
  { tag: t.controlKeyword, color: 'rgb(175,1,219)' },
  { tag: t.definition(t.propertyName), color: '#bbbb00' },
  { tag: t.function(t.variableName), color: 'rgb(123,97,43)' },
  { tag: t.invalid, color: 'red', 'text-decoration': 'underline' },
  { tag: t.typeName, color: 'rgb(37, 127, 153)' },
  { tag: t.lineComment, color: 'rgb(0,128,0)'},
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
