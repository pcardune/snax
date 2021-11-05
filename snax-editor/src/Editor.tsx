import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { keymap, ViewUpdate } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import Icon from '@mui/material/Icon';
import {
  Collapse,
  Grid,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Typography,
  AppBar,
  Toolbar,
  Stack,
  Button,
  Chip,
} from '@mui/material';
import { Box } from '@mui/system';
import type { FileInfo } from './local-file-server/serve.js';
import CodeMirror from './CodeMirror';
import { useFileList, useWriteableFile, useDebounce } from './hooks';
import { formatTime } from './util';
import CodeRunner from './CodeRunner';

type OnSelectFile = (path: string) => void;

function DirItem(props: {
  onSelectFile?: OnSelectFile;
  selectedPath: string;
  directory: string;
  name: string;
}) {
  const path = `${props.directory}/${props.name}`;

  const [expanded, setExpanded] = useState(props.selectedPath.startsWith(path));
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };
  return (
    <>
      <ListItemButton onClick={toggleExpanded} key="button">
        <ListItemText primary={props.name + '/'} />
        {expanded ? <Icon>arrow_drop_down</Icon> : <Icon>arrow_right</Icon>}
      </ListItemButton>
      <Collapse in={expanded} timeout="auto" unmountOnExit key="sublist">
        <FileList
          selectedPath={props.selectedPath}
          path={props.directory + '/' + props.name}
          onSelectFile={props.onSelectFile}
        />
      </Collapse>
    </>
  );
}

function FileList(props: {
  selectedPath: string;
  path?: string;
  onSelectFile?: OnSelectFile;
}) {
  const directory = props.path ?? '/';
  const { loading, fileList } = useFileList(directory);

  const selectFile = (item: FileInfo) => {
    props.onSelectFile && props.onSelectFile(directory + '/' + item.name);
  };

  const files = fileList.files.filter((item) => {
    return (
      !item.name.startsWith('.') &&
      (item.isDirectory || item.name.endsWith('.snx'))
    );
  });

  return (
    <div>
      {loading && <em>Loading...</em>}
      <List dense sx={{ pl: 1 }}>
        {files.map((item) =>
          item.isDirectory ? (
            <DirItem
              key={item.name}
              name={item.name}
              directory={directory}
              selectedPath={props.selectedPath}
              onSelectFile={props.onSelectFile}
            />
          ) : (
            <ListItemButton
              key={item.name}
              onClick={() => selectFile(item)}
              selected={props.selectedPath === directory + '/' + item.name}
            >
              <ListItemText primary={item.name} />
            </ListItemButton>
          )
        )}
      </List>
    </div>
  );
}

function Time(props: { time: number }) {
  const [label, setLabel] = useState(formatTime(props.time));
  useEffect(() => {
    const interval = setInterval(() => {
      setLabel(formatTime(props.time));
    }, 1000);
    return () => clearInterval(interval);
  }, [props.time]);
  return <>{label}</>;
}

function FileViewer(props: { path: string }) {
  const [state, setState] = useState<EditorState | undefined>(undefined);
  const writeable = useWriteableFile(props.path);
  const needsSave =
    writeable.file.fileContent.serverModified <
    writeable.file.fileContent.localModified;

  const onClickSave = useCallback(
    async (state: EditorState) => {
      const newContent = state.doc.sliceString(0);
      await writeable.saveFile(newContent);
    },
    [writeable.saveFile]
  );

  const debounce = useDebounce();
  const onUpdate = (update: ViewUpdate) => {
    setState(update.state);
    if (update.docChanged) {
      debounce(() => {
        const code = update.state.doc.sliceString(0);
        writeable.cacheFile(code);
      }, 250);
    }
  };

  const extensions = useMemo(
    () => [
      keymap.of([
        {
          key: 'Mod-s',
          run: (view) => {
            onClickSave(view.state);
            return true;
          },
        },
      ]),
    ],
    [onClickSave]
  );
  return (
    <Grid container spacing={2}>
      <Grid item xs={8}>
        <Paper>
          <Stack>
            <Toolbar variant="dense">
              <Box sx={{ flexGrow: 1 }}>
                <Button
                  onClick={() => state && onClickSave(state)}
                  disabled={!needsSave}
                >
                  {writeable.saving ? 'Saving...' : 'Save'}
                </Button>
              </Box>
              <Box>
                <Typography variant="caption">
                  last saved{' '}
                  <Time time={writeable.file.fileContent.serverModified} />
                </Typography>
              </Box>
            </Toolbar>
            {writeable.file.fileContent && (
              <CodeMirror
                value={writeable.file.fileContent.content}
                onUpdate={onUpdate}
                extensions={extensions}
              />
            )}
          </Stack>
        </Paper>
      </Grid>
      <Grid item xs={4}>
        <CodeRunner code={writeable.file.fileContent.content} />
      </Grid>
    </Grid>
  );
}

export default function Editor() {
  const [selectedFilePath, setSelectedFilePath] = useState(
    localStorage.getItem('selectedFilePath') || ''
  );
  const onSelectFile = (path: string) => {
    localStorage.setItem('selectedFilePath', path);
    setSelectedFilePath(path);
  };
  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <AppBar position="static">
          <Toolbar variant="dense">
            <Typography variant="h6" color="inherit" component="div">
              Snax
            </Typography>
          </Toolbar>
        </AppBar>
      </Grid>
      <Grid item xs={12}>
        <Grid container spacing={2}>
          <Grid item xs={2}>
            <Paper>
              <FileList
                selectedPath={selectedFilePath}
                onSelectFile={onSelectFile}
              />
            </Paper>
          </Grid>
          <Grid item xs={10}>
            {selectedFilePath && <FileViewer path={selectedFilePath} />}
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
}
