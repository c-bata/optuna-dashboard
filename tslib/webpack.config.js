const path = require('path');

const mode = process.env.WASM_INLINE === 'production' ? 'production' : 'development';
const isDev = mode === 'development';

const typeScriptLoader = process.env.TYPESCRIPT_LOADER === "esbuild-loader" ? {
    test: /\.tsx?$/,
    exclude: [/node_modules/],
    loader: 'esbuild-loader',
    options: {
        loader: 'tsx',
        tsconfigRaw: require('./tsconfig.json')
    }
} : {
    test: /\.tsx?$/,
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
        extensions: ['.ts', '.tsx', '.js']
    }
};

if (isDev) {
    config.devtool = 'source-map';
    config.cache = {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename],
        }
    }
    console.log('= = = = = = = = = = = = = = = = = = =');
    console.log('DEVELOPMENT BUILD');
    console.log(process.env.TYPESCRIPT_LOADER === 'esbuild-loader' ? 'esbuild-loader' : 'ts-loader');
    console.log('= = = = = = = = = = = = = = = = = = =');
} else {
    const CompressionPlugin = require("compression-webpack-plugin");
    config.plugins.push(new CompressionPlugin())
}

module.exports = config;
