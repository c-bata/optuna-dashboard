declare const IS_VSCODE: boolean

declare module "*.css"

declare module "*.wasm?url" {
  const url: string
  export default url
}
