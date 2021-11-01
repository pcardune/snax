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
import { SNAXParser } from '@pcardune/snax/dist/snax/snax-parser';
import { compileAST } from '@pcardune/snax/dist/snax/wat-compiler';
import { TypeResolutionError } from '@pcardune/snax/dist/snax/errors';
import type { DirListing, FileInfo } from './local-file-server/serve.js';
import CodeMirror from './CodeMirror';

function useWritableFile(path: string) {
  const [saving, setSaving] = useState(false);
  const saveFile = useCallback(
    async (content: string) => {
      setSaving(true);
      await fetch(`http://localhost:8085${path}`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: content,
      });
      setSaving(false);
    },
    [path]
  );
  return { saving, saveFile };
}

function useFile(path: string) {
  const [loading, setLoading] = useState(true);
  const [fileContent, setFileContent] = useState('');
  useEffect(() => {
    fetch(`http://localhost:8085${path}`).then((res) => {
      res.text().then((data) => {
        setFileContent(data);
      });
    });
    setLoading(false);
  }, [path]);
  return { loading, fileContent: fileContent };
}

function useFileList(path: string) {
  const [loading, setLoading] = useState(true);
  const [fileList, setFileList] = useState<DirListing>({ files: [] });
  useEffect(() => {
    fetch(`http://localhost:8085${path}`).then((res) => {
      res.json().then((data) => {
        setFileList(data);
      });
    });
    setLoading(false);
  }, [path]);
  return { loading, fileList };
}

type OnSelectFile = (path: string) => void;

function DirItem(props: {
  onSelectFile?: OnSelectFile;
  selectedPath: string;
  directory: string;
  name: string;
}) {
  const [expanded, setExpanded] = useState(false);
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

  return (
    <div>
      {loading && <em>Loading...</em>}
      <List dense sx={{ pl: 1 }}>
        {fileList.files.map((item) =>
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

function useCodeChecker() {
  const [parses, setParses] = useState<boolean | undefined>();
  const [typeChecks, setTypechecks] = useState<boolean | undefined>();
  const [compiles, setCompiles] = useState<boolean | undefined>();
  const [validates, setValidates] = useState<boolean | undefined>();
  const [error, setError] = useState('');

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
            const wasmModule = await WebAssembly.compile(
              binaryenModule.emitBinary().buffer
            );
            const modInstance = await WebAssembly.instantiate(wasmModule);
            (window as any).wasm = modInstance.exports;
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

  const checks = [
    { label: 'parses', state: parses },
    { label: 'type checks', state: typeChecks },
    { label: 'compiles', state: compiles },
    { label: 'validates', state: validates },
  ];
  return { checks, error, runChecks };
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

const useDebounce = () => {
  const timeout = useRef<ReturnType<typeof setTimeout>>();
  return (callback: () => void, delay: number) => {
    timeout.current && clearTimeout(timeout.current);
    timeout.current = setTimeout(callback, delay);
  };
};

function FileViewer(props: { path: string }) {
  const { loading, fileContent } = useFile(props.path);
  const [state, setState] = useState<EditorState | undefined>(undefined);
  const [needsSave, setNeedsSave] = useState(false);
  const writable = useWritableFile(props.path);

  const checker = useCodeChecker();

  const onClickSave = useCallback(
    async (state: EditorState) => {
      const newContent = state.doc.sliceString(0);
      await writable.saveFile(newContent);
      setNeedsSave(false);
    },
    [writable.saveFile]
  );

  const debounce = useDebounce();
  const onUpdate = (update: ViewUpdate) => {
    setState(update.state);
    if (update.docChanged) {
      setNeedsSave(true);
      debounce(() => {
        checker.runChecks(update.state.sliceDoc(0));
      }, 250);
    }
  };

  useEffect(() => {
    if (!loading) {
      checker.runChecks(fileContent);
    }
  }, [loading, fileContent]);

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
            {loading && 'loading...'}
            <Toolbar variant="dense">
              <Box sx={{ flexGrow: 1 }}>
                <Button
                  onClick={() => state && onClickSave(state)}
                  disabled={!needsSave}
                >
                  {writable.saving ? 'Saving...' : 'Save'}
                </Button>
              </Box>
            </Toolbar>
            {fileContent && (
              <CodeMirror
                value={fileContent}
                onUpdate={onUpdate}
                extensions={extensions}
              />
            )}
          </Stack>
        </Paper>
      </Grid>
      <Grid item xs={4}>
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
          </Stack>
        </Paper>
      </Grid>
    </Grid>
  );
}

export default function Editor() {
  const [selectedFilePath, setSelectedFilePath] = useState('');
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
                onSelectFile={(path) => setSelectedFilePath(path)}
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
