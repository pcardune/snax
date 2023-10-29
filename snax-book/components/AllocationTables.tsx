import { FileCompiler } from '@pcardune/snax/dist/snax/ast-compiler.js';
import { getLocationString } from './editor/util.js';
import styled from 'styled-components';
import { ExternFuncDecl, FuncDecl } from '@pcardune/snax/dist/snax/spec-gen.js';
import { FuncLocalAllocator } from '@pcardune/snax/dist/snax/memory-resolution.js';
import { useState } from 'react';

export function AllocationTables({ compiler }: { compiler: FileCompiler }) {
  return (
    <div>
      {/* {compiler.moduleAllocator.allocationMap
          .entries()
          .map(([index, astNode, locations]) => (
            <tr key={`foo-${index}`}>
              <td>{getLocationString(astNode.location)}</td>
              <td>
                {locations.map((loc, i) => (
                  <div key={i}>
                    {loc.id} {loc.area}
                  </div>
                ))}
              </td>
            </tr>
          ))
          .toArray()} */}
      {compiler.moduleAllocator.funcAllocatorMap
        .entries()
        .map(([index, funcDecl, funcAllocator]) => (
          <FuncAllocations
            key={index}
            funcDecl={funcDecl}
            funcAllocator={funcAllocator}
          />
        ))
        .toArray()}
    </div>
  );
}

function FuncAllocations({
  funcDecl,
  funcAllocator,
}: {
  funcDecl: FuncDecl | ExternFuncDecl;
  funcAllocator: FuncLocalAllocator;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <FuncRow className={expanded ? 'expanded' : ''}>
      <Header onClick={() => setExpanded((prev) => !prev)}>
        {funcDecl.fields.symbol}
      </Header>
      {expanded && (
        <FuncBody>
          <table>
            <thead>
              <tr>
                <th colSpan={4}>Locals</th>
              </tr>
              <tr>
                <td>Offset</td>
                <td>id</td>
                <td>value type</td>
              </tr>
            </thead>
            <tbody>
              {funcAllocator.locals.map((alloc, i) => (
                <tr key={`locals-${i}`}>
                  <td>{alloc.offset}</td>
                  <td>{alloc.local.id}</td>
                  <td>{alloc.local.valueType}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table>
            <thead>
              <tr>
                <th colSpan={4}>Stack</th>
              </tr>
              <tr>
                <td>Offset</td>
                <td>id</td>
                <td>value type</td>
              </tr>
            </thead>
            <tbody>
              {funcAllocator.stack.map((alloc, i) => (
                <tr key={`stack-${i}`}>
                  <td>{alloc.offset}</td>
                  <td>{alloc.id}</td>
                  <td>
                    {alloc.dataType.toString()} ({alloc.dataType.numBytes}{' '}
                    bytes)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FuncBody>
      )}
    </FuncRow>
  );
}

const Header = styled.div`
  padding: 8px 4px;
  cursor: pointer;
  &:hover {
    background-color: #eee;
  }
`;

const FuncRow = styled.div`
  border: 1px solid #eee;
  border-collapse: collapse;
  font-weight: bold;
  &.expanded {
    ${Header} {
      border-bottom: 1px solid #eee;
    }
  }
`;

const FuncBody = styled.div`
  display: flex;
  gap: 4px;
  justify-content: space-evenly;
`;
