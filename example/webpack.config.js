import path from 'path';
import WorkerUrlPlugin from 'worker-url/plugin.js';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default {
  mode: 'development',
  // devtool: 'source-map',
  entry: {
    index: './src/index.js',
  },
  experiments: {
    outputModule: true,
  },
  output: {
    publicPath: '/js/',
    path: path.resolve(__dirname, 'public/js'),
    filename: '[name].js',
    library: {
      type: 'module'
    },
  },
  plugins: [
    new WorkerUrlPlugin()
  ],
  stats: {
    modules: false,
    children: false,
    entrypoints: false,
  },
};