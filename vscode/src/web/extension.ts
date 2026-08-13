import * as vscode from "vscode"

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "optuna-dashboard" is now active in the web extension host!'
  )

  const disposable = vscode.commands.registerCommand(
    "optuna-dashboard.openOptunaDashboard",
    async (fileUri: vscode.Uri) => {
      // In VS Code, the path separator of fileUri is always '/'
      // even when using Windows.
      const title = fileUri.path.split("/").pop() || "Optuna Dashboard"
      const panel = vscode.window.createWebviewPanel(
        "optunaDashboard",
        title,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      )

      const indexJsUri = vscode.Uri.joinPath(
        context.extensionUri,
        "assets",
        "bundle.js"
      )
      const storageWorkerJsUri = vscode.Uri.joinPath(
        context.extensionUri,
        "assets",
        "storage-worker.js"
      )
      const sqliteWasmUri = vscode.Uri.joinPath(
        context.extensionUri,
        "assets",
        "sqlite3.wasm"
      )

      const appPath = panel.webview.asWebviewUri(indexJsUri)

      const handleMessage = async (message: { type: string }) => {
        switch (message.type) {
          case "webviewDidLoad": {
            try {
              await panel.webview.postMessage({
                type: "optunaStorage",
                content: toArrayBuffer(await readFile(fileUri)),
                workerUri: panel.webview
                  .asWebviewUri(storageWorkerJsUri)
                  .toString(),
                // The storage Worker loads the wasm from this URI. The bytes are
                // not sent along: the Worker only needs them when the opened file
                // is a SQLite database, and reading them here would cost a MB of
                // IPC for every panel, Journal files included.
                sqliteWasmUri: panel.webview
                  .asWebviewUri(sqliteWasmUri)
                  .toString(),
              })
            } catch (error: unknown) {
              console.error("Failed to load Optuna storage", error)
            }
            break
          }
        }
      }
      const messageDisposable = panel.webview.onDidReceiveMessage(handleMessage)
      panel.onDidDispose(() => messageDisposable.dispose())
      panel.webview.html = getWebviewContent(appPath, panel.webview.cspSource)
    }
  )

  context.subscriptions.push(disposable)
}

async function readFile(uri: vscode.Uri): Promise<Uint8Array> {
  return vscode.workspace.fs.readFile(uri)
}

function toArrayBuffer(content: Uint8Array): ArrayBuffer {
  if (
    content.buffer instanceof ArrayBuffer &&
    content.byteOffset === 0 &&
    content.byteLength === content.buffer.byteLength
  ) {
    return content.buffer
  }
  return content.slice().buffer as ArrayBuffer
}

function getWebviewContent(indexJsUri: vscode.Uri, cspSource: string): string {
  const nonce = getNonce()
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Optuna Dashboard (Wasm ver.)</title>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource} 'nonce-${nonce}' 'wasm-unsafe-eval'; worker-src blob:; connect-src ${cspSource}; style-src ${cspSource} 'unsafe-inline';">
  <script type="module" crossorigin src="${indexJsUri}"></script>
  <script nonce="${nonce}">
    (function() {
      const vscodeApi = acquireVsCodeApi();
      window.addEventListener('DOMContentLoaded', (event) => {
        vscodeApi.postMessage({ type: 'webviewDidLoad' })
      })
    }())
  </script>
</head>
<body>
  <div id="root"></div>
</body>
</html>
`
}

function getNonce(): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let nonce = ""
  for (let index = 0; index < 32; index++) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return nonce
}

export function deactivate() {}
