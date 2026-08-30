import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["vitest", "run", "src/conversation-v2-eval.test.ts", "--reporter", "verbose"], {
  stdio: "inherit",
  shell: false,
});

process.exit(result.status ?? 1);
