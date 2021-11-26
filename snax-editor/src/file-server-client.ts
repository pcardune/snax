import React from 'react';

export const FileServerContext = React.createContext<
  IFileServerClient | undefined
>(undefined);

export function useFileServer() {
  const client = React.useContext(FileServerContext);
  if (!client) {
    throw new Error(`FileServerContext is required`);
  }
  return client;
}

export type ServerFile = {
  content: string;
  url: string;
  lastSaveTime: number;
};

interface IFileServerClient {
  getStdlibFile(path: string): Promise<ServerFile>;
  readDir(path: string): Promise<DirListing>;
  readFile(path: string): Promise<ServerFile>;
  writeFile(path: string, content: string): Promise<void>;
  urlForPath(path: string): string;
}

import { Octokit } from '@octokit/rest';
import { DirListing } from './local-file-server/serve.js';
export class GithubClient implements IFileServerClient {
  private octokit = new Octokit();

  private urlsForPaths = new Map<string, string>();
  readonly gistId: string;

  constructor(gistId: string) {
    this.gistId = gistId;
  }

  private async getGist() {
    return await this.octokit.rest.gists.get({
      gist_id: this.gistId,
    });
  }

  async getStdlibFile(path: string): Promise<ServerFile> {
    const response = await this.octokit.rest.repos.getContent({
      owner: 'pcardune',
      repo: 'snax',
      path: `snax/stdlib/${path}`,
      ref: 'editor',
    });
    let content: string;
    if (typeof response.data === 'string') {
      content = response.data;
    } else if (Array.isArray(response.data)) {
      throw new Error(
        `Expected to get a file, but got a directory for path ${path}`
      );
    } else if ('content' in response.data) {
      content = response.data.content;
      if (response.data.encoding === 'base64') {
        content = atob(content);
      } else {
        throw new Error(`Don't know how to decode ${response.data.encoding}`);
      }
    } else {
      throw new Error('Not sure who to deal with this response');
    }
    const lastSaveTime = new Date(
      response.headers['last-modified'] ?? 0
    ).getTime();
    return {
      content,
      url: response.url,
      lastSaveTime,
    };
  }

  async readDir(path: string): Promise<DirListing> {
    const response = await this.getGist();
    const files = [];
    for (const file of Object.values(response.data.files ?? [])) {
      if (!file || !file.filename || !file.raw_url) {
        continue;
      }
      files.push({
        name: file.filename ?? '',
        size: file.size ?? 0,
        isDirectory: false,
        mtime: new Date(response.headers['last-modified'] ?? 0).getTime(),
      });
      this.urlsForPaths.set(file.filename, file.raw_url);
    }
    return { files };
  }

  async readFile(path: string): Promise<ServerFile> {
    const response = await this.getGist();
    if (response.data.files) {
      const file = response.data.files[path.slice(1)];
      if (file && file.content && file.raw_url) {
        return {
          content: file.content,
          url: file.raw_url,
          lastSaveTime: new Date(
            response.headers['last-modified'] ?? 0
          ).getTime(),
        };
      }
    }
    throw new Error(`File not found: ${path}`);
  }

  urlForPath(path: string): string {
    return path;
  }

  writeFile(path: string, content: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
}

export class FileServerClient implements IFileServerClient {
  private readonly serverUrl: string;
  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  private fetch(path: string, init?: RequestInit) {
    return fetch(this.urlForPath(path), init);
  }

  urlForPath(path: string) {
    return `${this.serverUrl}${path}`;
  }

  async getStdlibFile(path: string): Promise<ServerFile> {
    return this.readFile(`/snax/stdlib/${path}`);
  }

  async readDir(path: string): Promise<DirListing> {
    const res = await this.fetch(path);
    const data = await res.json();
    return data;
  }

  async readFile(path: string): Promise<ServerFile> {
    const res = await this.fetch(path);
    const lastModifiedHeader = res.headers.get('Last-Modified');
    const lastModified = lastModifiedHeader
      ? new Date(lastModifiedHeader).getTime()
      : 0;
    return {
      content: await res.text(),
      url: this.urlForPath(path),
      lastSaveTime: lastModified,
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
