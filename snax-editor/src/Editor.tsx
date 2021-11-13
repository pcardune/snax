import React, { useState } from 'react';
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
  ListItem,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  ListItemIcon,
} from '@mui/material';
import type { DirListing, FileInfo } from './local-file-server/serve.js';
import { useFileList, useSaveFile } from './hooks';
import FileViewer from './FileViewer';

type OnSelectFile = (path: string) => void;

function NewFileNameInput(props: {
  value: string;
  onChange: (newValue: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <TextField
      size="small"
      label="File Name"
      variant="standard"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      onKeyDown={(event) => {
        switch (event.key) {
          case 'Escape':
            return props.onCancel();
          case 'Enter':
            return props.onSave();
        }
      }}
      InputProps={{
        autoFocus: true,
        endAdornment: (
          <InputAdornment position="end">
            <IconButton onClick={() => props.onCancel()}>
              <Icon>cancel</Icon>
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}

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
  const [newFileName, setNewFileName] = useState<string | null>(null);
  const saveFile = useSaveFile();
  const fileList = useFileList(path);
  const saveNewFile = async () => {
    const path = `${props.directory}/${props.name}/${newFileName}`;
    console.log('Saving', path);
    await saveFile.saveFile(path, '// starting writing the file...');
    fileList.refresh();
    setNewFileName(null);
    props.onSelectFile && props.onSelectFile(path);
  };

  const onClickCreateFile = () => {
    setExpanded(true);
    setNewFileName('');
  };
  const icon = expanded ? (
    <Icon>arrow_drop_down</Icon>
  ) : (
    <Icon>arrow_right</Icon>
  );
  return (
    <>
      <ListItem
        disablePadding
        secondaryAction={
          <Tooltip title="Create File">
            <IconButton size="small" onClick={onClickCreateFile}>
              <Icon>create</Icon>
            </IconButton>
          </Tooltip>
        }
      >
        <ListItemButton onClick={toggleExpanded} key="button" dense>
          <ListItemIcon sx={{ minWidth: 0 }}>{icon}</ListItemIcon>
          <ListItemText primary={props.name + '/'} />
        </ListItemButton>
      </ListItem>
      <Collapse in={expanded} timeout="auto" unmountOnExit key="sublist">
        {newFileName !== null && (
          <ListItem sx={{ pl: 6 }}>
            <NewFileNameInput
              value={newFileName}
              onChange={(newName) => setNewFileName(newName)}
              onCancel={() => setNewFileName(null)}
              onSave={saveNewFile}
            />
          </ListItem>
        )}
        <FileList
          dirListing={fileList.fileList}
          selectedPath={props.selectedPath}
          path={props.directory + '/' + props.name}
          onSelectFile={props.onSelectFile}
        />
      </Collapse>
    </>
  );
}

function FileList(props: {
  dirListing: DirListing;
  selectedPath: string;
  path?: string;
  onSelectFile?: OnSelectFile;
}) {
  const directory = props.path ?? '';
  const selectFile = (item: FileInfo) => {
    props.onSelectFile && props.onSelectFile(directory + '/' + item.name);
  };

  const files = props.dirListing.files.filter((item) => {
    return (
      !item.name.startsWith('.') &&
      (item.isDirectory || item.name.endsWith('.snx'))
    );
  });

  return (
    <div>
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
            <ListItem disablePadding key={item.name}>
              <ListItemButton
                onClick={() => selectFile(item)}
                selected={props.selectedPath === directory + '/' + item.name}
              >
                <ListItemText sx={{ pl: 3 }} primary={item.name} />
              </ListItemButton>
            </ListItem>
          )
        )}
      </List>
    </div>
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
  const fileList = useFileList('/');
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
                dirListing={fileList.fileList}
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
