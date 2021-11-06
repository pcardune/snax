import React from 'react';

export const FileServerContext = React.createContext<
  FileServerClient | undefined
>(undefined);

export function useFileServer() {
  const client = React.useContext(FileServerContext);
  if (!client) {
    throw new Error(`FileServerContext is required`);
  }
  return client;
}

export class FileServerClient {
  readonly serverUrl: string;
  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  fetch(path: string, init?: RequestInit) {
    return fetch(this.urlForPath(path), init);
  }

  urlForPath(path: string) {
    return `${this.serverUrl}${path}`;
  }

  async readFile(path: string) {
    const res = await this.fetch(path);
    const lastModifiedHeader = res.headers.get('Last-Modified');
    const lastModified = lastModifiedHeader
      ? new Date(lastModifiedHeader).getTime()
      : 0;
    return {
      content: await res.text(),
      url: this.urlForPath(path),
      serverModified: lastModified,
    };
  }

  async writeFile(path: string, content: string) {
    await this.fetch(path, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: content,
    });
  }
}
