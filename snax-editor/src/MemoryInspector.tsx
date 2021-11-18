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
  IconButton,
  Collapse,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
} from '@mui/material';
import { FileCompiler } from '@pcardune/snax/dist/snax/ast-compiler';
import {
  Area,
  DataLocation,
  FuncAllocatorMap,
  FuncStorageLocation,
  GlobalStorageLocation,
  LocalStorageLocation,
  StackStorageLocation,
  FuncLocalAllocator,
} from '@pcardune/snax/dist/snax/memory-resolution';
import {
  ASTNode,
  ExternFuncDecl,
  FuncDecl,
} from '@pcardune/snax/dist/snax/spec-gen';
import React, { useEffect } from 'react';
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

const FuncAllocRow: React.FC<{
  funcAllocator: FuncLocalAllocator;
  astNode: FuncDecl | ExternFuncDecl;
}> = (props) => {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <TableRow sx={{ '& > *': { borderBottom: 'unset' } }}>
        <TableCell>
          <IconButton
            aria-label="expand row"
            size="small"
            onClick={() => setOpen(!open)}
          >
            {open ? (
              <Icon>keyboard_arrow_up</Icon>
            ) : (
              <Icon>keyboard_arrow_down</Icon>
            )}
          </IconButton>
        </TableCell>
        <TableCell>{props.astNode.fields.symbol}</TableCell>
        <TableCell>{getLocationString(props.astNode.location)}</TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={3}>
          <Collapse in={open} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Type</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {props.funcAllocator.stack.map((location, index) => (
                    <TableRow key={index}>
                      <TableCell>{location.id}</TableCell>
                      <TableCell>{location.dataType.toString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const FuncAllocations: React.FC<{ funcAllocatorMap: FuncAllocatorMap }> = (
  props
) => {
  const rows = [];
  for (const [
    index,
    astNode,
    funcAllocator,
  ] of props.funcAllocatorMap.entries()) {
    rows.unshift(
      <FuncAllocRow
        key={index}
        funcAllocator={funcAllocator}
        astNode={astNode}
      />
    );
  }

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell />
          <TableCell>Function</TableCell>
          <TableCell>Source</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>{rows}</TableBody>
    </Table>
  );
};

const AllocationSection: React.FC<{ title: string }> = (props) => (
  <Accordion>
    <AccordionSummary expandIcon={<Icon>arrow_drop_down</Icon>}>
      <Typography>{props.title}</Typography>
    </AccordionSummary>
    <AccordionDetails>{props.children}</AccordionDetails>
  </Accordion>
);

const ByteExplorer: React.FC<{ buffer: ArrayBuffer }> = (props) => {
  const [startIndex, setStartIndex] = React.useState(0);
  const [numBytes, setNumBytes] = React.useState(20);
  const [width, setWidth] = React.useState(1);
  const goToEnd = () => {
    setStartIndex(props.buffer.byteLength - numBytes);
  };
  const goToStart = () => setStartIndex(0);

  const slice = props.buffer.slice(startIndex, startIndex + numBytes);
  let bytes: Int8Array | Int16Array | Int32Array;
  switch (width) {
    case 1:
      bytes = new Int8Array(slice);
      break;
    case 2:
      bytes = new Int16Array(slice);
      break;
    case 4:
      bytes = new Int32Array(slice);
      break;
    default:
      throw new Error('invalid width');
  }
  return (
    <Box>
      <FormControl component="fieldset">
        <FormLabel component="legend">Width</FormLabel>
        <RadioGroup
          row
          value={width}
          onChange={(e) => setWidth(parseInt(e.target.value))}
        >
          <FormControlLabel value="4" control={<Radio />} label="4 bytes" />
          <FormControlLabel value="2" control={<Radio />} label="2 bytes" />
          <FormControlLabel value="1" control={<Radio />} label="1 byte" />
        </RadioGroup>
      </FormControl>
      <Box>
        <Button
          disabled={startIndex <= 0}
          onClick={() => {
            const newStartIndex = Math.max(0, startIndex - 8 * width);
            setStartIndex(newStartIndex);
            setNumBytes(startIndex - newStartIndex + numBytes);
          }}
        >
          Load More
        </Button>
        <Button disabled={startIndex <= 0} onClick={goToStart}>
          Go to start
        </Button>
        <table>
          <tbody>
            {[...bytes].map((byte, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'right' }}>
                  {startIndex + i * width}:
                </td>
                <ByteStr byte={byte} />
              </tr>
            ))}
          </tbody>
        </table>

        <Button
          disabled={startIndex + numBytes >= props.buffer.byteLength}
          onClick={() => {
            setNumBytes(
              Math.min(
                props.buffer.byteLength - startIndex + numBytes,
                numBytes + 8 * width
              )
            );
          }}
        >
          Load More
        </Button>
        <Button
          disabled={startIndex + numBytes >= props.buffer.byteLength}
          onClick={goToEnd}
        >
          Go to end
        </Button>
      </Box>
    </Box>
  );
};

export function MemoryInspector({
  instance,
  compiler,
}: {
  instance: Instance;
  compiler: FileCompiler;
}) {
  const memory = instance.exports.memory;

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
      <ByteExplorer buffer={memory.buffer} />
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
      <AllocationSection title="Func Allocations">
        <FuncAllocations
          funcAllocatorMap={compiler.moduleAllocator.funcAllocatorMap}
        />
      </AllocationSection>
    </Box>
  );
}
