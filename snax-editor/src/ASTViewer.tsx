import {
  Icon,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItem,
  Button,
} from '@mui/material';
import { Box } from '@mui/system';
import { atString } from '@pcardune/snax/dist/snax/errors';
import * as AST from '@pcardune/snax/dist/snax/spec-gen';
import { isASTNode } from '@pcardune/snax/dist/snax/spec-util';
import React from 'react';

function ListField(props: { field: AST.ASTNode[] }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <>
      <Button onClick={() => setExpanded(!expanded)}>
        {expanded ? 'hide' : 'show'} {props.field.length} items...
      </Button>
      {expanded &&
        props.field.map((node, i) => (
          <div key={i}>
            <ASTNodeViewer node={node as unknown as AST.ASTNode} />
          </div>
        ))}
    </>
  );
}

function ValueField({ field }: { field: unknown }) {
  return <span>{JSON.stringify(field)}</span>;
}

function ASTNodeFields(props: { node: AST.ASTNode }) {
  const childEls = Object.entries(props.node.fields).map(
    ([fieldName, field]) => {
      let valueEl;
      if (field instanceof Array && field.length > 0 && isASTNode(field[0])) {
        valueEl = <ListField key={fieldName} field={field as AST.ASTNode[]} />;
      } else if (isASTNode(field)) {
        valueEl = <ASTNodeViewer node={field} />;
      } else {
        valueEl = <ValueField field={field} />;
      }
      return (
        <Box sx={{ pl: 1 }} key={fieldName}>
          <Box
            sx={{
              display: 'inline',
              color: 'primary.main',
              fontFamily: 'monospace',
            }}
          >
            {fieldName}
          </Box>
          : {valueEl}
        </Box>
      );
    }
  );
  return <div>{childEls}</div>;
}

function getLocationString(location?: AST.Location) {
  if (!location) {
    return '';
  }
  const parts = location.source.split('/');
  const source = parts[parts.length - 1];
  return atString({ ...location, source });
}

function ASTNodeViewer(props: { node: AST.ASTNode }) {
  const [expanded, setExpanded] = React.useState(false);
  const icon = expanded ? (
    <Icon>arrow_drop_down</Icon>
  ) : (
    <Icon>arrow_right</Icon>
  );
  const { onHoverNode } = React.useContext(ASTViewerContext);

  const location = getLocationString(props.node.location);

  return (
    <ListItem disablePadding sx={{ fontFamily: 'monospace' }}>
      <div>
        <ListItemButton
          sx={{ p: 0 }}
          onClick={() => setExpanded(!expanded)}
          onMouseEnter={() => onHoverNode && onHoverNode(props.node)}
          onMouseLeave={() => onHoverNode && onHoverNode(null)}
        >
          <ListItemIcon sx={{ minWidth: 0 }}>{icon}</ListItemIcon>
          <ListItemText
            disableTypography
            primary={props.node.name}
            secondary={
              <Box sx={{ ml: 1, display: 'inline', color: 'text.secondary' }}>
                {location}
              </Box>
            }
          />
        </ListItemButton>
        {expanded && (
          <Box sx={{ ml: 2 }} style={{ borderLeft: '2px solid #ccc' }}>
            <ASTNodeFields node={props.node} />
          </Box>
        )}
      </div>
    </ListItem>
  );
}

type OnHoverNode = (node: AST.ASTNode | null) => void;

type Props = {
  ast: AST.ASTNode;
  onHoverNode?: OnHoverNode;
};

const ASTViewerContext = React.createContext<{ onHoverNode?: OnHoverNode }>({});

export default function ASTViewer({ ast, onHoverNode }: Props) {
  const context = React.useMemo(() => ({ onHoverNode }), [onHoverNode]);
  return (
    <ASTViewerContext.Provider value={context}>
      <ASTNodeViewer node={ast} />
    </ASTViewerContext.Provider>
  );
}
