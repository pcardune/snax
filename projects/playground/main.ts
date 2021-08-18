import { charCodes } from '../utils/iter';
import { lexer, PestParser } from './pest';
import { useColors } from '../utils/debug';
import { PestFile } from './ast';
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
  // ((section | property)? ~ NEWLINE)* ~
  EOI
}
`;
console.log(
  lexer
    .parse(charCodes(input))
    .map((t) => t.token)
    .join(' ')
);
const root = PestParser.parseStr(input);
if (root) {
  console.log(root.pretty());
} else {
  console.log('failed....');
}

let file = new PestFile(root);
console.log(file.pretty());
