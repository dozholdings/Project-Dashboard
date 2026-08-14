import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".js": "jsx" },
  external: ["./index.css"],
  outfile: "dist/app.js",
});
console.log("bundled dist/app.js");
