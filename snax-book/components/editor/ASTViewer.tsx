import * as AST from '@pcardune/snax/dist/snax/spec-gen';
import { isASTNode } from '@pcardune/snax/dist/snax/spec-util';
import {
  SNAXParser,
  SyntaxError,
} from '@pcardune/snax/dist/snax/snax-parser.js';
import React from 'react';
import { getLocationString } from './util';
import styled from 'styled-components';

function ListField(props: { field: AST.ASTNode[] }) {
  return (
    <>
      {props.field.map((node, i) => (
        <div key={i}>
          <ASTNodeViewer node={node as unknown as AST.ASTNode} />
        </div>
      ))}
    </>
  );
}

function ValueField({ field }: { field: unknown }) {
  return <span style={{ color: 'red' }}>{JSON.stringify(field)}</span>;
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
        return null;
      }
      return (
        <div style={{ paddingLeft: 8 }} key={fieldName}>
          {/* {valueEl} */}
          <span
            style={{
              display: 'inline',
              color: 'green',
              fontFamily: 'monospace',
            }}
          >
            {fieldName}
          </span>
          : {valueEl}
        </div>
      );
    }
  );
  return <div>{childEls}</div>;
}

function ASTNodeViewer(props: { node: AST.ASTNode }) {
  const [expanded, setExpanded] = React.useState(true);
  const { onHoverNode } = React.useContext(ASTViewerContext);

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 14 }}>
      <span
        onMouseEnter={() => onHoverNode && onHoverNode(props.node)}
        onMouseLeave={() => onHoverNode && onHoverNode(null)}
      >
        <span
          style={{ cursor: 'pointer' }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <>&#x25BE;</> : <>&#x25B8;</>}
        </span>
        {props.node.name}
        {getLocationString(props.node.location)}
      </span>
      {expanded && (
        <div style={{ marginLeft: 16, borderLeft: '2px solid #ccc' }}>
          <ASTNodeFields node={props.node} />
        </div>
      )}
    </div>
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

export function ParsingExample({ children }: { children: string }) {
  const [text, setText] = React.useState(() => children.trim());
  const result = SNAXParser.parseStr(text);
  return (
    <ExampleContainer>
      <textarea
        style={{ width: '100%', height: 200, flexBasis: '50%', flexShrink: 0 }}
        onChange={(e) => setText(e.target.value)}
        value={text}
      />
      {result.isOk() ? (
        <ASTViewer ast={result.value} />
      ) : (
        <ErrorContainer>
          {result.error instanceof SyntaxError
            ? result.error.format([{ source: '', text }])
            : result.error.toString()}
        </ErrorContainer>
      )}
    </ExampleContainer>
  );
}

const ExampleContainer = styled.div`
  display: flex;
  flex-direction: row;
  gap: 8px;
`;

const ErrorContainer = styled.pre`
  font-size: 12px;
  background-color: #e5797a;
  color: #fffde9;
  padding: 8px;
  margin: 0px;
  flex-grow: 1;
`;
