// OOOF this a huge hack.
// the langguage server outputs commonjs module, which replaces
// all import statements with requires() even if you use
// import() functions, which technically work in commonjs.
// This is a hacky wrapper around the language server to
// pass in the import to avoid typescript converting the
// import to require. Can't use require, because snax is
// an esmodule.

async function getModules() {
  const modules = await import('@pcardune/snax/dist/snax/snax-parser.js');
  const compiler = await import('@pcardune/snax/dist/snax/ast-compiler.js');
  const errors = await import('@pcardune/snax/dist/snax/errors.js');
  return {
    SNAXParser: modules.SNAXParser,
    SyntaxError: modules.SyntaxError,
    FileCompiler: compiler.FileCompiler,
    NodeError: errors.NodeError,
  };
}

require('./out/server.js').runServer(getModules());
