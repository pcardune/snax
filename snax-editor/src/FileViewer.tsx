import React from 'react';
import { EditorView, keymap, ViewUpdate } from '@codemirror/view';
import {
  Grid,
  Paper,
  Typography,
  Toolbar,
  Stack,
  Button,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Icon,
} from '@mui/material';
import { Box } from '@mui/system';
import CodeMirror, { ViewRef } from './CodeMirror';
import { useWriteableFile, useDebounce } from './hooks';
import CodeRunner from './CodeRunner';
import { formatTime } from './util';
import useCodeChecker from './useCodeChecker';
import { TextMarker } from './codemirror/error-marker';
import ASTViewer from './ASTViewer';
import { ASTNode } from '@pcardune/snax/dist/snax/spec-gen';
import { MemoryInspector } from './MemoryInspector';
import { WASI } from '@pcardune/snax/dist/snax/wasi';

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

const errorMarker = new TextMarker('cm-underline', {
  textDecoration: 'underline 3px red',
});

const highlightMarker = new TextMarker('cm-node-highlight', {
  backgroundColor: '#ddf',
});

function useNodeHighlighter(
  marker: TextMarker,
  cmViewRef: React.RefObject<ViewRef>,
  source: string
) {
  return React.useCallback(
    (node: ASTNode | undefined | null) => {
      if (!cmViewRef.current) {
        return;
      }
      if (node && node.location && node.location.source.endsWith(source)) {
        marker.markSection(
          cmViewRef.current,
          node.location.start.offset,
          node.location.end.offset
        );
      } else {
        marker.unmarkAll(cmViewRef.current);
      }
    },
    [cmViewRef, source, marker]
  );
}

const Panel: React.FC<{ title: string }> = (props) => {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <Accordion expanded={expanded} onChange={() => setExpanded(!expanded)}>
      <AccordionSummary expandIcon={<Icon>arrow_drop_down</Icon>}>
        <Typography>{props.title}</Typography>
      </AccordionSummary>
      <AccordionDetails>{expanded && props.children}</AccordionDetails>
    </Accordion>
  );
};

export default function FileViewer(props: { path: string }) {
  const cmViewRef = React.useRef<ViewRef>();
  const { saveFile, cacheFile, ...writeable } = useWriteableFile(props.path);
  const needsSave =
    writeable.file.fileContent.lastSaveTime <
    writeable.file.fileContent.localModified;

  const checker = useCodeChecker();
  const { runChecks, runCode } = checker;

  const onClickSave = React.useCallback(async () => {
    await saveFile(cmViewRef.current!.state.doc.sliceString(0));
  }, [saveFile]);

  const [output, setOutput] = React.useState('');
  const onClickRun = React.useCallback(async () => {
    setOutput('');
    const buffer: string[] = [];
    const wasi = new WASI({
      write: (str: string) => {
        buffer.push(str);
      },
    });
    await runCode(wasi);
    setOutput(buffer.join(''));
  }, [runCode]);

  const debounce = useDebounce();
  const extensions = React.useMemo(() => {
    return [
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          debounce(() => {
            const code = update.state.doc.sliceString(0);
            runChecks(code, props.path);
            cacheFile(code);
          }, 50);
        }
      }),
      EditorView.theme({
        '&': { maxHeight: '80vh' },
      }),
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            onClickSave();
            return true;
          },
        },
        {
          key: 'Mod-Shift-Enter',
          preventDefault: true,
          run: () => {
            onClickRun();
            return true;
          },
        },
      ]),
    ];
  }, [debounce, runChecks, props.path, cacheFile, onClickSave, onClickRun]);

  const setErrorNode = useNodeHighlighter(errorMarker, cmViewRef, props.path);
  const setHoverNode = useNodeHighlighter(
    highlightMarker,
    cmViewRef,
    props.path
  );
  React.useEffect(() => {
    if (!cmViewRef.current) {
      return;
    }
    setErrorNode(checker.error?.node);
  }, [checker.error, setErrorNode]);

  const onHoverASTNode = React.useCallback(
    (node: ASTNode | null) => {
      setHoverNode(node);
    },
    [setHoverNode]
  );

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} sm={12} lg={8}>
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
      <Grid item xs={12} sm={12} lg={4}>
        <Panel title="Code Runner">
          <CodeRunner
            checker={checker}
            onClickRun={onClickRun}
            output={output}
          />
        </Panel>
        <Panel title="Syntax Tree">
          {checker.ast && (
            <ASTViewer ast={checker.ast} onHoverNode={onHoverASTNode} />
          )}
        </Panel>
        <Panel title="Memory Inspector">
          {checker.compiler && checker.instance?.exports.memory && (
            <MemoryInspector
              instance={checker.instance}
              compiler={checker.compiler}
            />
          )}
        </Panel>
      </Grid>
    </Grid>
  );
}
