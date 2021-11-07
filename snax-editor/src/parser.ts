import { parser } from './grammar/snx-lang.js';
import {
  foldNodeProp,
  foldInside,
  indentNodeProp,
  LRLanguage,
  LanguageSupport,
} from '@codemirror/language';
import { styleTags, HighlightStyle, tags as t } from '@codemirror/highlight';

let parserWithMetadata = parser.configure({
  props: [
    styleTags({
      '⚠': t.invalid,
      Identifier: t.local(t.variableName),
      Number: t.number,
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
      'TypeExpr/Identifier': t.typeName,
      TypeExpr: t.typeOperator,
      'FuncDecl/Identifier': t.function(t.variableName),
      'while if else return': t.controlKeyword,
      'reg let func struct': t.definitionKeyword,
      as: t.operatorKeyword,
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

import { completeFromList } from '@codemirror/autocomplete';
import hoverTypeInfo from './cm-extensions/hover-type-info';

export const exampleCompletion = exampleLanguage.data.of({
  autocomplete: completeFromList([
    { label: 'defun', type: 'keyword' },
    { label: 'defvar', type: 'keyword' },
    { label: 'let', type: 'keyword' },
    { label: 'cons', type: 'function' },
    { label: 'car', type: 'function' },
    { label: 'cdr', type: 'function' },
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
    myHighlightStyle.fallback,
    hoverTypeInfo,
  ]);
}
