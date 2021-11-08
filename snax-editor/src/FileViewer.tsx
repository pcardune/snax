import React from 'react';
import { EditorView, keymap, ViewUpdate } from '@codemirror/view';
import { Grid, Paper, Typography, Toolbar, Stack, Button } from '@mui/material';
import { Box } from '@mui/system';
import CodeMirror, { ViewRef } from './CodeMirror';
import { useWriteableFile, useDebounce } from './hooks';
import CodeRunner from './CodeRunner';
import { formatTime } from './util';
import useCodeChecker from './useCodeChecker';
import { removeUnderlines, underlineSection } from './codemirror/error-marker';

function Time(props: { time: number }) {
  const [label, setLabel] = React.useState(formatTime(props.time));
  React.useEffect(() => {
    const interval = setInterval(() => {
      setLabel(formatTime(props.time));
    }, 1000);
    return () => clearInterval(interval);
  }, [props.time]);
  return <>{label}</>;
}

export default function FileViewer(props: { path: string }) {
  const cmViewRef = React.useRef<ViewRef>();
  const { saveFile, cacheFile, ...writeable } = useWriteableFile(props.path);
  const needsSave =
    writeable.file.fileContent.lastSaveTime <
    writeable.file.fileContent.localModified;

  const checker = useCodeChecker();
  const { runChecks } = checker;

  const onClickSave = React.useCallback(async () => {
    await saveFile(cmViewRef.current!.state.doc.sliceString(0));
  }, [saveFile]);

  const debounce = useDebounce();
  const extensions = React.useMemo(() => {
    return [
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          debounce(() => {
            const code = update.state.doc.sliceString(0);
            runChecks(code);
            cacheFile(code);
          }, 50);
        }
      }),
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            onClickSave();
            return true;
          },
        },
      ]),
    ];
  }, [debounce, onClickSave, cacheFile, runChecks]);

  React.useEffect(() => {
    if (!cmViewRef.current) {
      return;
    }
    if (checker.error) {
      const { node } = checker.error;
      if (node && node.location) {
        underlineSection(
          cmViewRef.current,
          node.location.start.offset,
          node.location.end.offset
        );
      }
    } else {
      removeUnderlines(cmViewRef.current);
    }
  }, [checker.error]);

  return (
    <Grid container spacing={2}>
      <Grid item xs={8}>
        <Paper>
          <Stack>
            <Toolbar variant="dense">
              <Box sx={{ flexGrow: 1 }}>
                <Button onClick={onClickSave} disabled={!needsSave}>
                  {writeable.saving ? 'Saving...' : 'Save'}
                </Button>
              </Box>
              <Box>
                <Typography variant="caption">
                  last saved{' '}
                  <Time time={writeable.file.fileContent.lastSaveTime} />
                </Typography>
              </Box>
            </Toolbar>
            {writeable.file.fileContent && (
              <CodeMirror
                ref={cmViewRef}
                value={writeable.file.fileContent.content}
                extensions={extensions}
              />
            )}
          </Stack>
        </Paper>
      </Grid>
      <Grid item xs={4}>
        <CodeRunner checker={checker} />
      </Grid>
    </Grid>
  );
}
