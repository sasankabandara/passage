import ts from 'typescript';

// Use TypeScript's in-process transpiler. This also supports environments where
// spawning esbuild's native service or probing Windows network drives is disabled.
export default {
  base: './',
  resolve: { preserveSymlinks: true },
  esbuild: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [{
    name: 'typescript-in-process',
    transform(code, id) {
      if (!id.endsWith('.ts')) return;
      return { code: ts.transpileModule(code, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
        sourceMap: true, inlineSources: true,
      }, fileName: id }).outputText, map: null };
    },
  }],
  build: { target: 'esnext', minify: false, cssMinify: false, sourcemap: true },
};
