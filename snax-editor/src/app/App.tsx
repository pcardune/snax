import { Link, Grid, AppBar, Toolbar, Typography } from '@mui/material';
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';

const App: React.FC = (props) => {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <AppBar position="static">
          <Toolbar variant="dense">
            <Link to="/" component={RouterLink as any}>
              <Typography
                variant="h6"
                color="primary.contrastText"
                component="div"
              >
                Snax
              </Typography>
            </Link>
          </Toolbar>
        </AppBar>
      </Grid>
      <Grid item xs={12}>
        {props.children}
      </Grid>
    </Grid>
  );
};

export default App;
