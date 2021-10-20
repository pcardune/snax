import { URL } from 'url';
const __dirname = new URL('.', import.meta.url).pathname;

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { FieldSpec, nodes } from './spec.js';

function write() {
  let out: string[] = [];
  const emit = (s: string) => out.push(s);
  const emitLn = (...s: string[]) => emit(s.join('') + '\n');

  emitLn(`
export type Location = {
  source: string,
  start: {offset: number, line: number, column: number},
  end: {offset: number, line: number, column: number},
};
`);

  const emitNode = (name: string, fields: Record<string, FieldSpec>) => {
    emitLn();

    const argTypeSpec = (fieldName: string, spec: FieldSpec) =>
      `${fieldName}: ${spec.type}${spec.list ? '[]' : ''}${
        spec.optional ? '|undefined' : ''
      }`;
    const typeSpec = (fieldName: string, spec: FieldSpec) =>
      `${fieldName}${spec.optional ? '?' : ''}: ${spec.type}${
        spec.list ? '[]' : ''
      }`;

    let fieldType = `{`;
    Object.entries(fields).forEach(([fieldName, spec]) => {
      fieldType += typeSpec(fieldName, spec) + `; `;
    });
    fieldType += '}';

    emitLn(`type ${name}Fields = ${fieldType};`);

    emitLn(`
      export type ${name} = {
        name:"${name}",
        fields:${name}Fields,
        location?: Location,
      };
    `);
    emitLn(`
      export function is${name}(node: ASTNode): node is ${name} {
        return node.name === "${name}";
      }
    `);
    let args: string[] = [];
    Object.entries(fields).forEach(([fieldName, spec]) => {
      args.push(argTypeSpec(fieldName, spec));
    });
    emitLn(`
      export function make${name}(${args.join(', ')}): ${name} {
        return {
          name: "${name}",
          fields: {
            ${Object.keys(fields).join(', ')}
          }
        };
      }
    `);

    emitLn(`
      export function make${name}With(fields:${fieldType}): ${name} {
        return {
          name: "${name}",
          fields,
        };
      }
    `);
  };

  const emitUnionNode = (name: string, union: string[]) => {
    emitLn();
    emitLn(`export type ${name} = ${union.join(' | ')};`);
    emitLn(`export function is${name}(node: ASTNode): node is ${name} {
      return ${union.map((u) => `is${u}(node)`).join(' || ')};
    }`);
  };

  let allTypes: string[] = [];
  let allNames: string[] = [];
  for (const key in nodes) {
    const { fields, union } = nodes[key];
    if (fields) {
      emitNode(key, fields);
      allNames.push(key);
    } else if (union) {
      emitUnionNode(key, union);
    }
    allTypes.push(key);
  }

  emitLn(`export type ASTNode = ${allTypes.join(' | ')};`);
  emitLn(
    `export type ASTNodeName = ${allNames
      .map((name) => `"${name}"`)
      .join(' | ')};`
  );
  let outPath = path.join(__dirname, 'spec-gen.ts');
  fs.writeFileSync(outPath, out.join(''));

  exec(`npx prettier --write ${outPath}`, (error, stdout, stderr) => {
    if (error) {
      console.log(`error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.log(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
  });
}
write();
