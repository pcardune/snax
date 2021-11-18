import { Box } from '@mui/system';
import {
  ListItem,
  ListItemText,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Accordion,
  AccordionSummary,
  Typography,
  AccordionDetails,
  Icon,
} from '@mui/material';
import { FileCompiler } from '@pcardune/snax/dist/snax/ast-compiler';
import {
  Area,
  DataLocation,
  FuncStorageLocation,
  GlobalStorageLocation,
  LocalStorageLocation,
  StackStorageLocation,
} from '@pcardune/snax/dist/snax/memory-resolution';
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

function GlobalAllocations(props: {
  allocations: Array<{ location: GlobalStorageLocation; astNode: ASTNode }>;
}) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Offset</TableCell>
          <TableCell>ID</TableCell>
          <TableCell>Type</TableCell>
          <TableCell>Source</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {props.allocations.map(({ location, astNode }, index) => (
          <TableRow key={index}>
            <TableCell>{location.offset}</TableCell>
            <TableCell>{location.id}</TableCell>
            <TableCell>{JSON.stringify(location.valueType)}</TableCell>
            <TableCell>{getLocationString(astNode.location)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function LocalAllocations(props: {
  allocations: Array<{ location: LocalStorageLocation; astNode: ASTNode }>;
}) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Offset</TableCell>
          <TableCell>ID</TableCell>
          <TableCell>Type</TableCell>
          <TableCell>Source</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {props.allocations.map(({ location, astNode }, index) => (
          <TableRow key={index}>
            <TableCell>{location.offset}</TableCell>
            <TableCell>{location.id}</TableCell>
            <TableCell>{JSON.stringify(location.valueType)}</TableCell>
            <TableCell>{getLocationString(astNode.location)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function StackAllocations(props: {
  allocations: Array<{ location: StackStorageLocation; astNode: ASTNode }>;
}) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Offset</TableCell>
          <TableCell>ID</TableCell>
          <TableCell>Type</TableCell>
          <TableCell>Source</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {props.allocations.map(({ location, astNode }, index) => (
          <TableRow key={index}>
            <TableCell>{location.offset}</TableCell>
            <TableCell>{location.id}</TableCell>
            <TableCell>{location.dataType.toString()}</TableCell>
            <TableCell>{getLocationString(astNode.location)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DataAllocations(props: {
  allocations: Array<{ location: DataLocation; astNode: ASTNode }>;
}) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Offset</TableCell>
          <TableCell>Data</TableCell>
          <TableCell>Source</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {props.allocations.map(({ location, astNode }, index) => (
          <TableRow key={index}>
            <TableCell>{location.memIndex}</TableCell>
            <TableCell>{JSON.stringify(location.data)}</TableCell>
            <TableCell>{getLocationString(astNode.location)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const FunctionAllocations: React.FC<{
  allocations: Array<{ location: FuncStorageLocation; astNode: ASTNode }>;
}> = (props) => (
  <Table size="small">
    <TableHead>
      <TableRow>
        <TableCell>Offset</TableCell>
        <TableCell>ID</TableCell>
        <TableCell>Type</TableCell>
        <TableCell>Source</TableCell>
      </TableRow>
    </TableHead>
    <TableBody>
      {props.allocations.map(({ location, astNode }, index) => (
        <TableRow key={index}>
          <TableCell>{location.offset}</TableCell>
          <TableCell>{location.id}</TableCell>
          <TableCell>{location.funcType.toString()}</TableCell>
          <TableCell>{getLocationString(astNode.location)}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const AllocationSection: React.FC<{ title: string }> = (props) => (
  <Accordion>
    <AccordionSummary expandIcon={<Icon>arrow_drop_down</Icon>}>
      <Typography>{props.title}</Typography>
    </AccordionSummary>
    <AccordionDetails>{props.children}</AccordionDetails>
  </Accordion>
);

export function MemoryInspector({
  instance,
  compiler,
}: {
  instance: Instance;
  compiler: FileCompiler;
}) {
  const memory = instance.exports.memory;
  const arr = memory.buffer.slice(0, 140);
  const [bytes, setBytes] = React.useState([...new Int8Array(arr)]);
  const onClickRefresh = () => {
    const memory = instance.exports.memory;
    const arr = memory.buffer.slice(0, 140);
    setBytes([...new Int8Array(arr)]);
  };

  const byArea: {
    [Area.DATA]: Array<{ location: DataLocation; astNode: ASTNode }>;
    [Area.GLOBALS]: Array<{
      location: GlobalStorageLocation;
      astNode: ASTNode;
    }>;
    [Area.FUNCS]: Array<{
      location: FuncStorageLocation;
      astNode: ASTNode;
    }>;
    [Area.LOCALS]: Array<{
      location: LocalStorageLocation;
      astNode: ASTNode;
    }>;
    [Area.STACK]: Array<{
      location: StackStorageLocation;
      astNode: ASTNode;
    }>;
  } = {
    [Area.DATA]: [],
    [Area.GLOBALS]: [],
    [Area.FUNCS]: [],
    [Area.LOCALS]: [],
    [Area.STACK]: [],
  };

  for (const [
    index,
    astNode,
    locations,
  ] of compiler.moduleAllocator.allocationMap.entries()) {
    for (const location of locations) {
      switch (location.area) {
        case Area.GLOBALS:
          byArea[location.area].push({ astNode, location });
          break;
        case Area.DATA:
          byArea[location.area].push({ astNode, location });
          break;
        case Area.FUNCS:
          byArea[location.area].push({ astNode, location });
          break;
        case Area.LOCALS:
          byArea[location.area].push({ astNode, location });
          break;
        case Area.STACK:
          byArea[location.area].push({ astNode, location });
          break;
      }
    }
  }
  return (
    <Box sx={{ fontFamily: 'monospace' }}>
      <Button onClick={onClickRefresh}>Refresh</Button>
      {/* <div>stack pointer: {instance.exports.stackPointer.value}</div>
      <div>data offset: {compiler.moduleAllocator.dataOffset}</div> */}
      <AllocationSection title="Static Data">
        <DataAllocations allocations={byArea[Area.DATA]} />
      </AllocationSection>
      <AllocationSection title="Globals">
        <GlobalAllocations allocations={byArea[Area.GLOBALS]} />
      </AllocationSection>
      <AllocationSection title="Functions">
        <FunctionAllocations allocations={byArea[Area.FUNCS]} />
      </AllocationSection>
      <AllocationSection title="Locals">
        <LocalAllocations allocations={byArea[Area.LOCALS]} />
      </AllocationSection>
      <AllocationSection title="Stack">
        <StackAllocations allocations={byArea[Area.STACK]} />
      </AllocationSection>
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
