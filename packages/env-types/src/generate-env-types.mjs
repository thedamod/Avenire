import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), "../../.env.example");
const outPath = resolve(process.cwd(), "./index.d.ts");

const content = readFileSync(envPath, "utf8");
const keys = content
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => line.split("=")[0]);

const uniqueKeys = [...new Set(keys)].sort();

const body = `declare namespace NodeJS {
  interface ProcessEnv {
${uniqueKeys.map((key) => `    ${key}?: string;`).join("\n")}
  }
  interface Process {
    env: ProcessEnv;
  }
}

declare const process: NodeJS.Process;
`;

writeFileSync(outPath, body, "utf8");
console.log(`Generated ${outPath} with ${uniqueKeys.length} env keys.`);
