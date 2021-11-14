import {
  Icon,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItem,
  Paper,
  Button,
} from '@mui/material';
import { Box } from '@mui/system';
import * as AST from '@pcardune/snax/dist/snax/spec-gen';
import { isASTNode } from '@pcardune/snax/dist/snax/spec-util';
import React from 'react';

function ListField({ field }: { field: AST.ASTNode[] }) {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <>
      <Button onClick={() => setExpanded(!expanded)}>
        {expanded ? 'hide' : 'show'} {field.length} items...
      </Button>
      {expanded &&
        field.map((node, i) => (
          <div key={i}>
            <ASTNodeViewer node={node as unknown as AST.ASTNode} />
          </div>
        ))}
    </>
  );
}

function NodeField({ field }: { field: AST.ASTNode }) {
  return <ASTNodeViewer node={field} />;
}

function ValueField({ field }: { field: unknown }) {
  return <span>{JSON.stringify(field)}</span>;
}

function ASTNodeFields({ node }: { node: AST.ASTNode }) {
  const childEls = Object.entries(node.fields).map(([fieldName, field]) => {
    let valueEl;
    if (field instanceof Array && field.length > 0 && isASTNode(field[0])) {
      valueEl = <ListField key={fieldName} field={field as AST.ASTNode[]} />;
    } else if (isASTNode(field)) {
      valueEl = <NodeField field={field} />;
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
  });
  return <div>{childEls}</div>;
}

function ASTNodeViewer({ node }: { node: AST.ASTNode }) {
  const [expanded, setExpanded] = React.useState(false);
  const icon = expanded ? (
    <Icon>arrow_drop_down</Icon>
  ) : (
    <Icon>arrow_right</Icon>
  );
  return (
    <ListItem disablePadding sx={{ fontFamily: 'monospace' }}>
      <div>
        <ListItemButton sx={{ p: 0 }} onClick={() => setExpanded(!expanded)}>
          <ListItemIcon sx={{ minWidth: 0 }}>{icon}</ListItemIcon>
          <ListItemText disableTypography primary={node.name} />
        </ListItemButton>
        {expanded && (
          <Box sx={{ ml: 2 }} style={{ borderLeft: '2px solid #ccc' }}>
            <ASTNodeFields node={node} />
          </Box>
        )}
      </div>
    </ListItem>
  );
}

export default function ASTViewer({ ast }: { ast: AST.ASTNode }) {
  return <ASTNodeViewer node={ast} />;
}
