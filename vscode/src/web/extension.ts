import * as vscode from "vscode"
import { getStorage } from "@optuna/tslib"

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "optuna-dashboard" is now active in the web extension host!'
  )

  let disposable = vscode.commands.registerCommand(
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

      const appPath = panel.webview.asWebviewUri(indexJsUri)

      panel.webview.html = getWebviewContent(appPath)
      panel.webview.onDidReceiveMessage(async (message: any) => {
        switch (message.type) {
          case "webviewDidLoad":
            console.log("[host] Receive a webviewDidLoad event.")
            const uint8Array = await vscode.workspace.fs.readFile(fileUri)
            const storage = getStorage(uint8Array)
            const summaries = await storage.getStudies()
            panel.webview.postMessage({
              type: "studySummaries",
              content: summaries,
            })
            break
        }
      })
    }
  )

  context.subscriptions.push(disposable)
}

function getWebviewContent(indexJsUri: vscode.Uri): string {
  // https://code.visualstudio.com/api/extension-guides/webview#passing-messages-from-a-webview-to-an-extension
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Optuna Dashboard (Wasm ver.)</title>
  <script type="module" crossorigin src="${indexJsUri}"></script>
  <script>
    (function() {
      const vscodeApi = acquireVsCodeApi();
      window.addEventListener('DOMContentLoaded', (event) => {
        vscodeApi.postMessage({ type: 'webviewDidLoad' })
        console.log("[webview] Post a webviewDidLoad event.")
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

export function deactivate() {}
