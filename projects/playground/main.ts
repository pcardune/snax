import { charCodes, iter } from '../utils/iter';
import { lexer, PestParser } from './pest';
import { useColors } from '../utils/debug';
import { ASTNode, PestFile } from './ast';
useColors();

const input = `
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
for (const token of lexer.parse(charCodes(input))) {
  console.log(token);
}
const root = PestParser.parseStr(input);
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
