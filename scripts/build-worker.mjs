// Bundles the background worker and CLI into self-contained ESM files in dist/.
// The production image runs them with plain `node`, without node_modules.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: {
    worker: path.join(root, "src/worker/main.ts"),
    cli: path.join(root, "src/worker/cli.ts"),
  },
  outdir: path.join(root, "dist"),
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  legalComments: "linked",
  alias: {
    "@": path.join(root, "src"),
    "server-only": path.join(root, "scripts/empty-module.mjs"),
  },
  // Optional native bindings that pg/nodemailer probe for at runtime.
  external: ["pg-native", "cloudflare:sockets"],
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
