const webpack = require('webpack');
const path = require('path');
const CompressionPlugin = require("compression-webpack-plugin");

module.exports = {
    mode: "production",
    devtool: 'source-map',
    experiments: {
        syncWebAssembly: true,
        asyncWebAssembly: true,
    },
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename],
        }
    },
    entry: {
        bundle: __dirname + '/src/vscode_entry.tsx',
        'storage-worker': path.resolve(__dirname, '../tslib/storage/src/storage_worker.ts'),
    },
    output: {
        path: path.resolve(__dirname, '../vscode/assets/'),
        filename: '[name].js',
        publicPath: '/',
        clean: true,
    },
    optimization: {
        splitChunks: false,
        runtimeChunk: false,
    },
    module: {
        rules: [
            { oneOf: [{
                test: /\.tsx?$/,
                exclude: [/node_modules/],
                loader: 'esbuild-loader',
                options: {
                    loader: 'tsx',
                    tsconfigRaw: require('./tsconfig.json')
                }
            }] },
            {
                resourceQuery: /url/,
                test: /\.wasm$/,
                type: "asset/resource",
                generator: {
                    filename: "sqlite3.wasm",
                },
            },
            {
                test: /\.wasm$/,
                resourceQuery: { not: [/url/] },
                type: "asset/inline",
            },
            {
                test: /\.m?js/,
                resolve: {
                    fullySpecified: false
                }
            },
            {
                test: /sqlite3-bundler-friendly\.mjs$/,
                use: path.resolve(__dirname, 'sqlite-wasm-bundler-loader.cjs'),
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js'],
        extensionAlias: {
            '.js': ['.ts', '.js'],
        },
    },
    plugins: [
        new webpack.DefinePlugin({ 'IS_VSCODE': JSON.stringify(true) }),
        new CompressionPlugin()
    ]
};
