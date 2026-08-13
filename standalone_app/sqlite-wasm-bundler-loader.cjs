const replacements = [
  [
    "new URL('sqlite3.wasm', import.meta.url)",
    "'sqlite3.wasm'",
  ],
  [
    "new URL('sqlite3-opfs-async-proxy.js', import.meta.url)",
    "'sqlite3-opfs-async-proxy.js'",
  ],
]

module.exports = function sqliteWasmBundlerLoader(source) {
  this.cacheable()
  let transformed = source
  for (const [from, to] of replacements) {
    transformed = transformed.replaceAll(from, to)
  }
  return transformed
}
