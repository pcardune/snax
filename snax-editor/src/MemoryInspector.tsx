import { Box } from '@mui/system';
import { ListItem, ListItemText } from '@mui/material';
import { FileCompiler } from '@pcardune/snax/dist/snax/ast-compiler';
import { Area, DataLocation } from '@pcardune/snax/dist/snax/memory-resolution';
import { ASTNode } from '@pcardune/snax/dist/snax/spec-gen';
import React from 'react';
import type { Instance } from './useCodeChecker';
import { getLocationString } from './util';

function ByteStr({ byte }: { byte?: number }) {
  if (byte === undefined) {
    return null;
  }
  return (
    <>
      <td style={{ textAlign: 'right' }}>{byte}</td>
      <td>{String.fromCharCode(byte)}</td>
    </>
  );
}

export function MemoryInspector({
  instance,
  compiler,
}: {
  instance: Instance;
  compiler: FileCompiler;
}) {
  const memory = instance.exports.memory;
  const arr = memory.buffer.slice(0, 140);
  const bytes = [...new Int8Array(arr)];

  const byArea: {
    [Area.DATA]: Array<{ location: DataLocation; astNode: ASTNode }>;
  } = { [Area.DATA]: [] };

  for (const [
    index,
    astNode,
    location,
  ] of compiler.moduleAllocator.allocationMap.entries()) {
    if (location.area === 'data') {
      byArea[location.area].push({ astNode, location });
    }
  }
  const allocations = byArea[Area.DATA].map(({ location, astNode }, index) => (
    <ListItem key={index} disablePadding sx={{ fontFamily: 'monospace' }}>
      <ListItemText
        disableTypography
        primary={`${location.memIndex} ${JSON.stringify(location.data)}`}
        secondary={
          <Box sx={{ ml: 1, display: 'inline', color: 'text.secondary' }}>
            {getLocationString(astNode.location)}
          </Box>
        }
      />
    </ListItem>
  ));
  return (
    <Box sx={{ fontFamily: 'monospace' }}>
      <div>stack pointer: {instance.exports.stackPointer.value}</div>
      <div>data offset: {compiler.moduleAllocator.dataOffset}</div>
      <div>allocations: {allocations}</div>
      <table>
        <tbody>
          {bytes.map((byte, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'right' }}>{i}:</td>
              <ByteStr byte={byte} />
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}
