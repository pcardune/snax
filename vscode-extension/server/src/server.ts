/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
} from 'vscode-languageserver/node';
import * as fs from 'fs/promises';

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  SNAXParser,
  SyntaxError,
} from '@pcardune/snax/dist/snax/snax-parser.js';
import type { Location } from '@pcardune/snax/dist/snax/spec-gen.js';
import { FileCompiler } from '@pcardune/snax/dist/snax/ast-compiler.js';
import { NodeError } from '@pcardune/snax/dist/snax/errors.js';

function locationToRange(location: Location) {
  return {
    start: {
      line: location.start.line - 1,
      character: location.start.column - 1,
    },
    end: {
      line: location.end.line - 1,
      character: location.end.column - 1,
    },
  };
}

const responseCache = new Map<string, string>();
async function fetchStdlib(url: string): Promise<string | null> {
  if (!responseCache.has(url)) {
    if (url.startsWith('https://')) {
      const resp = await fetch(url);
      if (resp.ok) {
        responseCache.set(url, await resp.text());
      } else {
        return null;
      }
    } else if (url.startsWith('/')) {
      const stat = await fs.stat(url);
      if (!stat.isFile()) {
        throw new Error(`Cannot load module from ${url}. It is not a file`);
      }
      const content = await fs.readFile(url, { encoding: 'utf-8' });
      responseCache.set(url, content);
    } else {
      throw new Error(`Can't load module from ${url}. Invalid format.`);
    }
  }
  return responseCache.get(url)!;
}

const astCache = new Map<
  string,
  { version: number; ast: ReturnType<(typeof SNAXParser)['parseStr']> }
>();

function getDocumentAST(doc: TextDocument) {
  const existing = astCache.get(doc.uri);
  if (existing && existing.version == doc.version) {
    return existing.ast;
  }
  const result = SNAXParser.parseStr(doc.getText(), 'start', {
    grammarSource: doc.uri,
  });
  astCache.set(doc.uri, { version: doc.version, ast: result });
  return result;
}
const compilerCache = new Map<
  string,
  { version: number; compiler: FileCompiler }
>();
function getDocumentCompiler(doc: TextDocument) {
  const existing = compilerCache.get(doc.uri);
  if (existing && existing.version == doc.version) {
    return existing.compiler;
  }
  const result = getDocumentAST(doc);
  if (!result.isOk()) {
    return null;
  }
  if (result.value.rootNode.name !== 'File') {
    return null;
  }
  const compiler = new FileCompiler(result.value.rootNode, {
    includeRuntime: true,
    importResolver: async (sourcePath, fromCanonicalUrl) => {
      if (!sourcePath.startsWith('snax/')) {
        throw new Error(
          "Importing non standard library modules isn't supported yet."
        );
      }
      const url = globalSettings.stdlibLocation + sourcePath;
      const content = await fetchStdlib(url);
      if (!content) {
        throw new Error('Failed to load module: ' + sourcePath);
      }
      const result = SNAXParser.parseStr(content, 'start', {
        grammarSource: url,
      });
      if (!result.isOk()) {
        throw new Error('Failed to parse module: ' + sourcePath);
      }
      if (result.value.rootNode.name !== 'File') {
        throw new Error('Failed to parse module: ' + sourcePath);
      }
      return { ast: result.value.rootNode, canonicalUrl: url };
    },
  });
  compilerCache.set(doc.uri, { version: doc.version, compiler });
  return compiler;
}

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
let hasHoverCapability = false;

connection.onInitialize((params: InitializeParams) => {
  const capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );
  hasDiagnosticRelatedInformationCapability = !!(
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation
  );

  hasHoverCapability = !!(
    capabilities.textDocument && !!capabilities.textDocument.hover
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
      hoverProvider: true,
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log('Workspace folder change event received.');
    });
  }
});

connection.onHover(async (params, token, workDoneProgress, resultProgress) => {
  const doc = documents.get(params.textDocument.uri);
  if (doc == null) {
    return { contents: { kind: 'plaintext', value: 'No document found' } };
  }
  const astResult = getDocumentAST(doc);
  if (astResult == null) {
    return { contents: { kind: 'plaintext', value: 'No AST found' } };
  }
  if (!astResult.isOk()) {
    return {
      contents: { kind: 'plaintext', value: 'Cannot parse file' },
    };
  }

  const node = astResult.value.getNodeAtOffset(doc.offsetAt(params.position), {
    source: doc.uri,
  });
  if (node == null)
    return { contents: { kind: 'plaintext', value: 'No node found' } };

  const compiler = getDocumentCompiler(doc);
  if (compiler != null && compiler.typeCache == null) {
    compiler.compile();
  }
  const typeInfo = compiler?.typeCache?.get(node);
  return {
    contents: {
      kind: 'markdown',
      value: `**AST Node:** ${node.name}\n\n**Type:** ${
        typeInfo?.toString() ?? 'unknown'
      }`,
    },
    range: node.location
      ? locationToRange(node.location)
      : { start: params.position, end: params.position },
  };
});

// The example settings
interface ExampleSettings {
  maxNumberOfProblems: number;
  stdlibLocation: string;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = {
  maxNumberOfProblems: 1000,
  stdlibLocation:
    'https://raw.githubusercontent.com/pcardune/snax/main/snax/stdlib/',
};
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <ExampleSettings>(
      (change.settings.snaxLanguageServer || defaultSettings)
    );
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: 'snaxLanguageServer',
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
  validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  // In this simple example we get the settings for every validate run.
  const settings = await getDocumentSettings(textDocument.uri);

  // The validator creates diagnostics for all uppercase words length 2 and more
  const diagnostics: Diagnostic[] = [];
  const result = getDocumentAST(textDocument);
  if (!result.isOk()) {
    if (result.error instanceof SyntaxError) {
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        range: locationToRange(result.error.location),
        message: `Parse Error: ` + result.error.message,
        source: 'snax parser',
      };
      diagnostics.push(diagnostic);
    } else {
      diagnostics.push({
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10000 },
        },
        message: String(result.error),
      });
    }
  } else if (result.value.rootNode.name === 'File') {
    const compiler = new FileCompiler(result.value.rootNode, {
      includeRuntime: true,
      importResolver: async (sourcePath, fromCanonicalUrl) => {
        if (!sourcePath.startsWith('snax/')) {
          throw new Error(
            "Importing non standard library modules isn't supported yet."
          );
        }
        const url = settings.stdlibLocation + sourcePath;
        const content = await fetchStdlib(url);
        if (!content) {
          diagnostics.push({
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10000 },
            },
            message: `Module ${sourcePath} not found at ${settings.stdlibLocation}`,
          });
          throw new Error('Failed to load module: ' + sourcePath);
        }
        const result = SNAXParser.parseStr(content, 'start', {
          grammarSource: url,
        });
        if (!result.isOk()) {
          diagnostics.push({
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10000 },
            },
            message:
              'Failed to parse module: ' + sourcePath + ' ' + result.error,
          });
          throw new Error('Failed to parse module: ' + sourcePath);
        }
        if (result.value.rootNode.name !== 'File') {
          diagnostics.push({
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 10000 },
            },
            message: 'Failed to parse module: ' + sourcePath,
          });
          throw new Error('Failed to parse module: ' + sourcePath);
        }
        return { ast: result.value.rootNode, canonicalUrl: url };
      },
    });
    compilerCache.set(textDocument.uri, {
      version: textDocument.version,
      compiler,
    });

    try {
      await compiler.compile();
    } catch (e) {
      diagnostics.push({
        range:
          e instanceof NodeError && e.node.location
            ? locationToRange(e.node.location)
            : {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 10000 },
              },
        message: String(e),
      });
    }
  }

  // Send the computed diagnostics to VSCode.
  connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    return [
      {
        label: 'TypeScript',
        kind: CompletionItemKind.Text,
        data: 1,
      },
      {
        label: 'JavaScript',
        kind: CompletionItemKind.Text,
        data: 2,
      },
    ];
  }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  if (item.data === 1) {
    item.detail = 'TypeScript details';
    item.documentation = 'TypeScript documentation';
  } else if (item.data === 2) {
    item.detail = 'JavaScript details';
    item.documentation = 'JavaScript documentation';
  }
  return item;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
