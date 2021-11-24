import React from 'react';
import { useParams } from 'react-router-dom';
import Editor from '../Editor';
import { FileServerContext, GithubClient } from '../file-server-client';

const GistEditor: React.FC = () => {
  const { gistId } = useParams();
  if (!gistId) {
    return <>no gist id provided</>;
  }
  return (
    <FileServerContext.Provider value={new GithubClient(gistId)}>
      <Editor />
    </FileServerContext.Provider>
  );
};

export default GistEditor;
