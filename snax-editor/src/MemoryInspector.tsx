import { Box } from '@mui/system';
import { FileCompiler } from '@pcardune/snax/dist/snax/ast-compiler';
import { Area, DataLocation } from '@pcardune/snax/dist/snax/memory-resolution';
import React from 'react';
import type { Instance } from './useCodeChecker';

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

  const byArea: { [Area.DATA]: DataLocation[] } = { [Area.DATA]: [] };

  for (const location of compiler.moduleAllocator.allocationMap.values()) {
    if (location.area === 'data') {
      byArea[location.area].push(location);
    }
  }
  const allocations = byArea[Area.DATA].map((location, index) => (
    <div key={index}>
      {location.memIndex} {JSON.stringify(location.data)}
    </div>
  ));
  return (
    <Box sx={{ fontFamily: 'monospace' }}>
      <div>stack pointer: {instance.exports.stackPointer.value}</div>
      <div>data offset: {compiler.moduleAllocator.dataOffset}</div>
      <div>allocations: {allocations}</div>
      <table>
        {bytes.map((byte, i) => (
          <tr key={i}>
            <td style={{ textAlign: 'right' }}>{i}:</td>
            <ByteStr byte={byte} />
          </tr>
        ))}
      </table>
    </Box>
  );
}
