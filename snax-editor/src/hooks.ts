import React from 'react';
import type { DirListing } from './local-file-server/serve.js';

export const useDebounce = () => {
  const timeout = React.useRef<ReturnType<typeof setTimeout>>();
  return (callback: () => void, delay: number) => {
    timeout.current && clearTimeout(timeout.current);
    timeout.current = setTimeout(callback, delay);
  };
};

type FileContent = {
  content: string;
  serverModified: number;
  localModified: number;
};

const getCachedFile = (path: string) => {
  const cached = localStorage.getItem(path);
  if (cached) {
    return JSON.parse(cached) as FileContent;
  }
};
const setCachedFile = (path: string, fileContent: FileContent) => {
  localStorage.setItem(path, JSON.stringify(fileContent));
};

export function useFile(path: string) {
  const [loading, setLoading] = React.useState(true);
  const [fileContent, setFileContent] = React.useState<FileContent>(
    getCachedFile(path) || { content: '', serverModified: 0, localModified: 0 }
  );

  const refresh = async () => {
    const cached = getCachedFile(path);
    if (cached) {
      setFileContent(cached);
    }

    setLoading(true);
    const res = await fetch(`http://localhost:8085${path}`);
    const lastModifiedHeader = res.headers.get('Last-Modified');
    const lastModified = lastModifiedHeader
      ? new Date(lastModifiedHeader).getTime()
      : 0;
    if (!cached || lastModified > cached.localModified) {
      const file: FileContent = {
        content: await res.text(),
        serverModified: lastModified,
        localModified: lastModified,
      };
      console.log('Loaded server content');
      setFileContent(file);
      setCachedFile(path, file);
    }
    setLoading(false);
  };
  const cacheFile = (content: string) => {
    const cached = getCachedFile(path);
    if (cached && cached.content === content) {
      return;
    }
    const newFileContent = {
      serverModified: cached ? cached.serverModified : 0,
      content: content,
      localModified: new Date().getTime(),
    };
    setCachedFile(path, newFileContent);
    setFileContent(newFileContent);
  };
  React.useEffect(() => {
    refresh();
  }, [path]);
  return { loading, fileContent, cacheFile, refresh };
}

export function useWriteableFile(path: string) {
  const file = useFile(path);
  const [saving, setSaving] = React.useState(false);
  const saveFile = React.useCallback(
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
      file.refresh();
    },
    [path]
  );
  return { saving, file, saveFile, cacheFile: file.cacheFile };
}

export function useFileList(path: string) {
  const [loading, setLoading] = React.useState(true);
  const [fileList, setFileList] = React.useState<DirListing>({ files: [] });
  React.useEffect(() => {
    fetch(`http://localhost:8085${path}`).then((res) => {
      res.json().then((data) => {
        setFileList(data);
      });
    });
    setLoading(false);
  }, [path]);
  return { loading, fileList };
}
