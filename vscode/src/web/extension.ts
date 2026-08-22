import * as vscode from "vscode"

const VIEW_TYPE = "optuna-dashboard.storageEditor"

type Fingerprint = { mtime: number; size: number }

type DocumentChangeMessage = {
  type: "documentChanged"
  content: unknown
}

class OptunaStorageDocument implements vscode.CustomDocument {
  public currentBytes: Uint8Array
  public fingerprint: Fingerprint
  public editDisabledReason: string | undefined

  constructor(
    public readonly uri: vscode.Uri,
    bytes: Uint8Array,
    fingerprint: Fingerprint,
    editDisabledReason?: string
  ) {
    this.currentBytes = Uint8Array.from(bytes)
    this.fingerprint = fingerprint
    this.editDisabledReason = editDisabledReason
  }

  public dispose(): void {}
}

class OptunaStorageEditorProvider
  implements vscode.CustomEditorProvider<OptunaStorageDocument>
{
  private readonly changeEmitter = new vscode.EventEmitter<
    vscode.CustomDocumentContentChangeEvent<OptunaStorageDocument>
  >()
  public readonly onDidChangeCustomDocument = this.changeEmitter.event

  private readonly webviews = new Map<OptunaStorageDocument, vscode.Webview>()

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext
  ): Promise<OptunaStorageDocument> {
    const source =
      openContext.backupId === undefined
        ? uri
        : vscode.Uri.parse(openContext.backupId)
    const [bytes, fingerprint] = await Promise.all([
      vscode.workspace.fs.readFile(source),
      fingerprintFor(uri),
    ])
    return new OptunaStorageDocument(
      uri,
      bytes,
      fingerprint,
      await editDisabledReasonFor(uri, bytes)
    )
  }

  public async resolveCustomEditor(
    document: OptunaStorageDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    panel.webview.options = { enableScripts: true }
    this.webviews.set(document, panel.webview)

    const asset = (name: string) =>
      panel.webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, "assets", name)
      )

    const messageDisposable = panel.webview.onDidReceiveMessage(
      async (message: { type?: string }) => {
        if (message.type === "webviewDidLoad") {
          await this.postStorage(document, panel.webview)
          return
        }
        if (message.type === "documentChanged") {
          await this.acceptDocumentChange(
            document,
            panel.webview,
            message as DocumentChangeMessage
          )
        }
      }
    )
    panel.onDidDispose(() => {
      messageDisposable.dispose()
      this.webviews.delete(document)
    })
    panel.webview.html = getWebviewContent(
      asset("bundle.js"),
      panel.webview.cspSource
    )
  }

  public async saveCustomDocument(
    document: OptunaStorageDocument,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    if (cancellation.isCancellationRequested) {
      return
    }
    const currentFingerprint = await fingerprintFor(document.uri)
    if (!sameFingerprint(currentFingerprint, document.fingerprint)) {
      throw new Error(
        "The storage changed outside Optuna Dashboard. Revert it or use Save As."
      )
    }
    await assertSafeDestination(document.uri, document.currentBytes)
    await atomicWrite(document.uri, document.currentBytes)
    document.fingerprint = await fingerprintFor(document.uri)
  }

  public async saveCustomDocumentAs(
    document: OptunaStorageDocument,
    destination: vscode.Uri,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    if (cancellation.isCancellationRequested) {
      return
    }
    await assertSafeDestination(destination, document.currentBytes)
    await atomicWrite(destination, document.currentBytes)
  }

  public async revertCustomDocument(
    document: OptunaStorageDocument,
    cancellation: vscode.CancellationToken
  ): Promise<void> {
    if (cancellation.isCancellationRequested) {
      return
    }
    const bytes = await vscode.workspace.fs.readFile(document.uri)
    document.currentBytes = Uint8Array.from(bytes)
    document.fingerprint = await fingerprintFor(document.uri)
    document.editDisabledReason = await editDisabledReasonFor(
      document.uri,
      bytes
    )
    await this.postReload(document)
  }

  public async backupCustomDocument(
    document: OptunaStorageDocument,
    context: vscode.CustomDocumentBackupContext,
    cancellation: vscode.CancellationToken
  ): Promise<vscode.CustomDocumentBackup> {
    if (cancellation.isCancellationRequested) {
      throw new vscode.CancellationError()
    }
    await vscode.workspace.fs.writeFile(
      context.destination,
      document.currentBytes
    )
    return {
      id: context.destination.toString(),
      delete: async () => {
        try {
          await vscode.workspace.fs.delete(context.destination)
        } catch (error) {
          if (!isFileNotFound(error)) {
            throw error
          }
        }
      },
    }
  }

  private async acceptDocumentChange(
    document: OptunaStorageDocument,
    webview: vscode.Webview,
    message: DocumentChangeMessage
  ): Promise<void> {
    try {
      document.currentBytes = new Uint8Array(
        toArrayBuffer(message.content)
      ).slice()
      this.changeEmitter.fire({ document })
      await webview.postMessage({ type: "documentChangeAccepted" })
    } catch (error) {
      await webview.postMessage({
        type: "documentChangeRejected",
        message:
          error instanceof Error ? error.message : "Document update failed",
      })
      await this.postReload(document)
    }
  }

  private async postStorage(
    document: OptunaStorageDocument,
    webview: vscode.Webview
  ): Promise<void> {
    const asset = (name: string) =>
      webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, "assets", name)
      )
    await webview.postMessage({
      type: "optunaStorage",
      content: toArrayBuffer(document.currentBytes),
      name: document.uri.path.split("/").pop(),
      editDisabledReason: document.editDisabledReason,
      workerUri: asset("storage-worker.js").toString(),
      sqliteWasmUri: asset("sqlite3.wasm").toString(),
    })
  }

  private async postReload(document: OptunaStorageDocument): Promise<void> {
    const webview = this.webviews.get(document)
    if (webview === undefined) {
      return
    }
    await webview.postMessage({
      type: "reloadStorage",
      content: toArrayBuffer(document.currentBytes),
      editDisabledReason: document.editDisabledReason,
    })
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new OptunaStorageEditorProvider(context)
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(VIEW_TYPE, provider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand(
      "optuna-dashboard.openOptunaDashboard",
      async (fileUri: vscode.Uri) => {
        await vscode.commands.executeCommand(
          "vscode.openWith",
          fileUri,
          VIEW_TYPE
        )
      }
    )
  )
}

const fingerprintFor = async (uri: vscode.Uri): Promise<Fingerprint> => {
  const stat = await vscode.workspace.fs.stat(uri)
  return { mtime: stat.mtime, size: stat.size }
}

const sameFingerprint = (left: Fingerprint, right: Fingerprint): boolean => {
  return left.mtime === right.mtime && left.size === right.size
}

const isSQLite = (bytes: Uint8Array): boolean => {
  if (bytes.byteLength < 20) {
    return false
  }
  return (
    new TextDecoder().decode(bytes.subarray(0, 16)) === "SQLite format 3\u0000"
  )
}

const sibling = (uri: vscode.Uri, suffix: string): vscode.Uri =>
  uri.with({ path: `${uri.path}${suffix}` })

const exists = async (uri: vscode.Uri): Promise<boolean> => {
  try {
    await vscode.workspace.fs.stat(uri)
    return true
  } catch (error) {
    if (isFileNotFound(error)) {
      return false
    }
    throw error
  }
}

const isFileNotFound = (error: unknown): boolean => {
  return (
    error instanceof vscode.FileSystemError && error.code === "FileNotFound"
  )
}

const editDisabledReasonFor = async (
  uri: vscode.Uri,
  bytes: Uint8Array
): Promise<string | undefined> => {
  if (isSQLite(bytes)) {
    if (bytes[18] === 2 || bytes[19] === 2) {
      return "WAL-mode SQLite databases can be viewed but not edited safely"
    }
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      if (await exists(sibling(uri, suffix))) {
        return `SQLite sidecar ${suffix} exists; stop other writers and checkpoint the database before editing`
      }
    }
    return undefined
  }
  if (await exists(sibling(uri, ".lock"))) {
    return "The Journal lock file exists; stop other writers before editing"
  }
  return undefined
}

const assertSafeDestination = async (
  uri: vscode.Uri,
  bytes: Uint8Array
): Promise<void> => {
  const reason = await editDisabledReasonFor(uri, bytes)
  if (reason !== undefined) {
    throw new Error(reason)
  }
}

const atomicWrite = async (
  destination: vscode.Uri,
  bytes: Uint8Array
): Promise<void> => {
  const temporary = destination.with({
    path: `${destination.path}.optuna-dashboard-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.tmp`,
  })
  try {
    await vscode.workspace.fs.writeFile(temporary, bytes)
    await vscode.workspace.fs.rename(temporary, destination, {
      overwrite: true,
    })
  } catch (error) {
    try {
      await vscode.workspace.fs.delete(temporary)
    } catch {
      // The temporary file may not have been created or may already be gone.
    }
    throw error
  }
}

function toArrayBuffer(content: Uint8Array | unknown): ArrayBuffer {
  if (content instanceof ArrayBuffer) {
    return content
  }
  if (ArrayBuffer.isView(content)) {
    const buffer = content.buffer as ArrayBuffer
    if (content.byteOffset === 0 && content.byteLength === buffer.byteLength) {
      return buffer
    }
    return buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength
    )
  }
  throw new TypeError("Storage content is not an ArrayBuffer")
}

function getWebviewContent(indexJsUri: vscode.Uri, cspSource: string): string {
  const csp = [
    "default-src 'none'",
    `script-src ${cspSource} 'wasm-unsafe-eval'`,
    "worker-src blob:",
    `connect-src ${cspSource}`,
    `img-src ${cspSource} data: blob:`,
    `font-src ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
  ].join("; ")
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp};">
  <title>Optuna Dashboard (Wasm ver.)</title>
  <script type="module" crossorigin src="${indexJsUri}"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>
`
}

export function deactivate(): void {}
