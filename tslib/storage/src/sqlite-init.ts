// Import the bundler-friendly initializer directly. The package entrypoint
// also imports the optional Worker API, which is not used by this dashboard
// and would add an unnecessary nested Worker bundle.
// @ts-ignore
import sqlite3InitModule from "../node_modules/@sqlite.org/sqlite-wasm/sqlite-wasm/jswasm/sqlite3-bundler-friendly.mjs"

export default sqlite3InitModule
