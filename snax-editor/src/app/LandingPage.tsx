import {
  Button,
  ButtonUnstyled,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Box } from '@mui/system';
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '../hooks';

const GistOpener = () => {
  const navigate = useNavigate();
  const [url, setUrl] = React.useState('');

  const parts = url.split('gist.github.com/');
  let path = '';
  if (parts.length === 2) {
    path = '/gists/' + parts[1];
  }
  return (
    <Stack direction="row" spacing={2}>
      <TextField
        label="Gist URL"
        variant="outlined"
        sx={{ width: '60ex' }}
        onChange={(e) => setUrl(e.target.value)}
        value={url}
        placeholder="https://gist.github.com/pcardune/36443a27af8b3fbab885ef591ac5518c"
      />
      <Button
        disabled={!path}
        variant="contained"
        onClick={() => navigate(path)}
      >
        Open
      </Button>
    </Stack>
  );
};

const LocalOpener = () => {
  const navigate = useNavigate();
  const [url, setUrl] = React.useState('http://localhost:8085');
  const [isValid, setIsValid] = React.useState(false);
  const [error, setError] = React.useState('');
  const debounce = useDebounce();

  const check = React.useCallback(async () => {
    if (!url) {
      setIsValid(false);
      setError('');
      return;
    }
    try {
      const response = await fetch(url);
      setIsValid(response.ok);
      if (response.ok) {
        setError('');
      } else {
        setError(response.statusText);
      }
    } catch (e) {
      setIsValid(false);
      setError('' + e);
    }
  }, [url]);

  useEffect(() => {
    debounce(check, 500);
  }, [check, debounce]);

  return (
    <Stack direction="row" spacing={2}>
      <TextField
        error={!!url && !isValid}
        helperText={
          error && (
            <>
              {error} <ButtonUnstyled onClick={check}>retry</ButtonUnstyled>
            </>
          )
        }
        label="Local Server URL"
        variant="outlined"
        sx={{ width: '60ex' }}
        onChange={(e) => setUrl(e.target.value)}
        value={url}
        placeholder="http://localhost:8085"
      />
      <Button
        disabled={!isValid}
        variant="contained"
        onClick={() => navigate('/local')}
      >
        Open
      </Button>
    </Stack>
  );
};

const LandingPage = () => {
  const navigate = useNavigate();
  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Paper sx={{ mx: 'auto', p: 1, m: 1 }}>
            <Typography gutterBottom variant="h6">
              Open a Gist
            </Typography>
            <GistOpener />
          </Paper>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Paper sx={{ mx: 'auto', p: 1, m: 1 }}>
            <Typography gutterBottom variant="h6">
              Open a Local Directory
            </Typography>
            <LocalOpener />
          </Paper>
        </Box>
      </Grid>
    </Grid>
  );
};

export default LandingPage;
