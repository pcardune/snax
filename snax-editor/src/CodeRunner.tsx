import { Box, Button, Chip, Icon, Paper, Stack } from '@mui/material';
import React from 'react';
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser';
import { compileAST } from '@pcardune/snax/dist/snax/wat-compiler';
import { TypeResolutionError } from '@pcardune/snax/dist/snax/errors';
import { useDebounce } from './hooks';

function useCodeChecker() {
  const [parses, setParses] = React.useState<boolean | undefined>();
  const [typeChecks, setTypechecks] = React.useState<boolean | undefined>();
  const [compiles, setCompiles] = React.useState<boolean | undefined>();
  const [validates, setValidates] = React.useState<boolean | undefined>();
  const [error, setError] = React.useState('');
  const [wasmModule, setModule] = React.useState<WebAssembly.Module>();

  async function runChecks(code: string) {
    const result = SNAXParser.parseStr(code);
    setParses(result.isOk());
    if (result.isOk()) {
      const ast = result.value;
      if (ast.name === 'File') {
        try {
          const binaryenModule = await compileAST(ast, {
            importResolver: () => {
              throw new Error('import not working yet...');
            },
          });
          setTypechecks(true);
          setCompiles(true);
          setError('');

          const validates = binaryenModule.validate();
          setValidates(!!validates);
          if (validates) {
            setModule(
              await WebAssembly.compile(binaryenModule.emitBinary().buffer)
            );
          } else {
            setError('Failed to validate');
          }
          return;
        } catch (e) {
          setError(String(e));
          if (e instanceof TypeResolutionError) {
            setTypechecks(false);
          } else {
            setTypechecks(true);
          }
          setCompiles(false);
        }
      }
    } else {
      setError(String(result.error));
      setTypechecks(false);
      setCompiles(false);
    }
  }

  const runCode = async () => {
    if (wasmModule) {
      // TODO: do debugging in a better way
      const modInstance = await WebAssembly.instantiate(wasmModule, {
        debug: { debug: (...a: any[]) => console.log('debug', ...a) },
      });
      (window as any).wasm = modInstance.exports;
      const result = (modInstance.exports as any)._start();
      console.log('Run Result:', result);
    }
  };

  const checks = [
    { label: 'parses', state: parses },
    { label: 'type checks', state: typeChecks },
    { label: 'compiles', state: compiles },
    { label: 'validates', state: validates },
  ];
  return { checks, error, runChecks, runCode };
}

function CompilerStatus(props: {
  checks: { label: string; state: boolean | undefined }[];
}) {
  const chips = props.checks.map((part) => {
    if (part.state === true) {
      return (
        <Chip
          key={part.label}
          label={part.label}
          color="success"
          icon={<Icon>check_circle</Icon>}
        />
      );
    } else if (part.state === false) {
      return (
        <Chip
          key={part.label}
          label={part.label}
          color="error"
          icon={<Icon>error</Icon>}
        />
      );
    } else {
      return (
        <Chip
          key={part.label}
          label={part.label}
          color="info"
          icon={<Icon>pending</Icon>}
        />
      );
    }
  });
  return (
    <Stack direction="row" spacing={1}>
      {chips}
    </Stack>
  );
}

export default function CodeRunner(props: { code: string }) {
  const checker = useCodeChecker();
  const debounce = useDebounce();
  React.useEffect(() => {
    debounce(() => {
      checker.runChecks(props.code);
    }, 250);
  }, [props.code]);

  return (
    <Paper>
      <Stack spacing={2}>
        <Box sx={{ p: 2 }}>
          <CompilerStatus checks={checker.checks} />
        </Box>
        {checker.error && (
          <Box sx={{ p: 2 }}>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {String(checker.error)}
            </pre>
          </Box>
        )}
        <Box>
          <Button disabled={!!checker.error} onClick={checker.runCode}>
            Run
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
