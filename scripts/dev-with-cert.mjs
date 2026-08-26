import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const certPath = resolve(".certs", "avast-webmail-shield-root.pem");
const nextBin = join("node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
const childEnv = { ...process.env };

if (existsSync(certPath) && !childEnv.NODE_EXTRA_CA_CERTS) {
  childEnv.NODE_EXTRA_CA_CERTS = certPath;
}

const child = spawn(nextBin, ["dev", ...process.argv.slice(2)], {
  env: childEnv,
  shell: false,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
