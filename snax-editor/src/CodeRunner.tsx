import { Box, Button, Chip, Icon, Paper, Stack } from '@mui/material';
import React from 'react';
import { CodeChecker } from './useCodeChecker';

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

export default function CodeRunner({ checker }: { checker: CodeChecker }) {
  return (
    <Paper>
      <Stack spacing={2}>
        <Box sx={{ p: 2 }}>
          <CompilerStatus checks={checker.checks} />
        </Box>
        {checker.error && (
          <Box sx={{ p: 2 }}>
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {checker.error.message}
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
