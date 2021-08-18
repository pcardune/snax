import { charCodes, iter } from '../utils/iter';
import { lexer, PestParser } from './pest';
import { useColors, colors } from '../utils/debug';
import { ASTNode, PestFile } from './ast';
import fs from 'fs';
import path from 'path';
useColors();

function doINIGrammar() {
  const iniGrammar = `
char = { ASCII_ALPHANUMERIC | "." | "_" | "/" }
name = { char+ }
value = { char* }
section = { "[" ~ name ~ "]" }
property = { name ~ "=" ~ value }
file = {
  SOI ~
  ((section|property)? ~ NEWLINE)* ~
  EOI
}
`;
  for (const token of lexer.parse(charCodes(iniGrammar))) {
    console.log(token);
  }
  const root = PestParser.parseStr(iniGrammar);
  if (root) {
    console.log(root.pretty());
  } else {
    console.log('failed....');
  }

  let file = new PestFile(root);
  console.log(file.pretty());

  for (const node of file.iterNodes()) {
    let astNode = node as ASTNode;
    console.log(astNode.node.symbol.toString());
  }

  console.log(
    iter([1])
      .chain(iter([2, 3]), iter([4, 5]).chain(iter([6, 7])))
      .toArray()
  );

  const iniText = `
username = noha
password = plain_text
salt = NaCl

[server_1]
interface=eth0
ip=127.0.0.1
document_root=/var/www/example.org

[empty_section]

[second_server]
document_root=/var/www/example.com
ip=
interface=eth1
`;
  const iniStream = charCodes(iniText);
  const iniLexer = file.buildLexer();
  for (const token of iniLexer.parse(iniStream)) {
    console.log(token);
  }
}

import {
  compileLexerToTypescript,
  lexer as parserGenLexer,
  parser as parserGenParser,
} from '../parser-gen/dsl';
import { compileFile } from '../parser-gen/cli';

function doParserGen() {
  compileFile('projects/parser-gen/dsl.grammar');

  // const example = `
  // ID = r"[a-zA-Z_]([a-zA-Z0-9_]*)"
  // STRING = r"\\"([^\\"])*\\""
  // WHITESPACE = r"( |\\t)"
  // EQUALS = "="
  // `;

  // console.log('TOKENS:');
  // parserGenLexer.parse(charCodes(example)).forEach((t) => console.log(t));
  // console.log('PARSE TREE:');
  // const root = parserGenParser.parseTokens(
  //   parserGenLexer.parse(charCodes(example))
  // );
  // if (!root) {
  //   console.log("Couldn't parse");
  //   return;
  // }
  // console.log(root.pretty());
  // console.log(compileLexerToTypescript(root));
}

console.log(colors.underline(colors.bold('Welcome to the Playground')));
doParserGen();
