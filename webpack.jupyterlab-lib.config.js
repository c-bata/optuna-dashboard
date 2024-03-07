const webpack = require("webpack")
const path = require("path")
const CompressionPlugin = require("compression-webpack-plugin")

var config = {
  mode: "production",
  devtool: "source-map",
  entry: [path.resolve(__dirname, "optuna_dashboard/ts/lib.ts")],
  output: {
    path: path.resolve(__dirname, "jupyterlab"),
    filename: "optuna-dashboard-lib.js",
    publicPath: "/public/",
  },
  module: {
    rules: [
      {
        oneOf: [{
          test: /\.tsx?$/,
          exclude: [/node_modules/],
          loader: "ts-loader",
          options: {
            configFile: path.resolve(__dirname, "tsconfig.json"),
            transpileOnly: false,
            happyPackMode: true,
          },
        }]
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  plugins: [
    new webpack.DefinePlugin({
      APP_BAR_TITLE: JSON.stringify(
        process.env.APP_BAR_TITLE || "Optuna Dashboard"
      ),
      API_ENDPOINT: JSON.stringify(process.env.API_ENDPOINT),
      URL_PREFIX: JSON.stringify(process.env.URL_PREFIX || "/dashboard"),
    }),
    new CompressionPlugin(),
  ],
}

module.exports = config
