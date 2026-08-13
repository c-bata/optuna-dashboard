const replacements = [
  ["new URL('sqlite3.wasm', import.meta.url)", "'sqlite3.wasm'"],
  [
    "new URL('sqlite3-opfs-async-proxy.js', import.meta.url)",
    "'sqlite3-opfs-async-proxy.js'",
  ],
]

module.exports = function sqliteWasmBundlerLoader(source) {
  this.cacheable()
  let transformed = source
  for (const [from, to] of replacements) {
    const occurrences = transformed.split(from).length - 1
    if (occurrences !== 1) {
      throw new Error(
        `Expected exactly one ${JSON.stringify(from)} in sqlite-wasm, found ${occurrences}`
      )
    }
    transformed = transformed.replaceAll(from, to)
  }
  return transformed
}
