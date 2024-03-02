const path = require('path');

const mode = process.env.WASM_INLINE === 'production' ? 'production' : 'development';
const isDev = mode === 'development';

const typeScriptLoader = {
    test: /\.ts$/,
    exclude: [/node_modules/],
    loader: 'ts-loader',
    options: {
        configFile: __dirname + '/tsconfig.json',
        transpileOnly: isDev,
        happyPackMode: true
    }
}

var config = {
    mode,
    devtool: "source-map",
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename],
        }
    },
    experiments: {
        syncWebAssembly: true,
        asyncWebAssembly: true,
    },
    entry: __dirname + '/src/index.ts',
    output: {
        path: path.resolve(__dirname, 'pkg/'),
        filename: 'index.js',
        publicPath: '/'
    },
    module: {
        rules: [
            { oneOf: [typeScriptLoader] },
            {
                test: /\.wasm$/,
                type: "asset/inline",
            },
        ]
    },
    resolve: {
        extensions: ['.ts', '.js']
    }
};

if (!isDev) {
    const CompressionPlugin = require("compression-webpack-plugin");
    config.plugins.push(new CompressionPlugin())
}

module.exports = config;
