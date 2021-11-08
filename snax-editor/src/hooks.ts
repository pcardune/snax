import React from 'react';
import { useFileServer } from './file-server-client';
import type { DirListing } from './local-file-server/serve.js';

export const useDebounce = () => {
  const timeout = React.useRef<ReturnType<typeof setTimeout>>();
  return React.useCallback(
    (callback: () => void, delay: number) => {
      timeout.current && clearTimeout(timeout.current);
      timeout.current = setTimeout(callback, delay);
      return () => timeout.current && clearTimeout(timeout.current);
    },
    [timeout]
  );
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
  const client = useFileServer();
  const refresh = React.useCallback(async () => {
    const cached = getCachedFile(path);
    if (cached) {
      setFileContent(cached);
    }

    setLoading(true);
    const res = await client.readFile(path);
    if (!cached || res.serverModified > cached.localModified) {
      const file: FileContent = {
        ...res,
        localModified: res.serverModified,
      };
      setFileContent(file);
      setCachedFile(path, file);
    }
    setLoading(false);
  }, [client, path]);
  const cacheFile = React.useCallback(
    (content: string) => {
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
    },
    [path]
  );
  React.useEffect(() => {
    refresh();
  }, [refresh]);
  return { loading, fileContent, cacheFile, refresh };
}

export function useSaveFile() {
  const [saving, setSaving] = React.useState(false);
  const client = useFileServer();
  const saveFile = React.useCallback(
    async (path: string, content: string) => {
      setSaving(true);
      await client.writeFile(path, content);
      setSaving(false);
    },
    [client]
  );
  return { saving, saveFile };
}

export function useWriteableFile(path: string) {
  const file = useFile(path);

  const { saving, saveFile: saveFileByPath } = useSaveFile();

  const saveFile = React.useCallback(
    async (content: string) => {
      await saveFileByPath(path, content);
    },
    [path, saveFileByPath]
  );

  return { saving, file, saveFile, cacheFile: file.cacheFile };
}

export function useFileList(path: string) {
  const [loading, setLoading] = React.useState(true);
  const [fileList, setFileList] = React.useState<DirListing>({ files: [] });

  const refresh = React.useCallback(async () => {
    const res = await fetch(`http://localhost:8085${path}`);
    const data = await res.json();
    setFileList(data);
    setLoading(false);
  }, [path]);
  React.useEffect(() => {
    refresh();
  }, [refresh]);
  return { loading, fileList, refresh };
}
