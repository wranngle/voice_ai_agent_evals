import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const packageRoot = join(import.meta.dir, "..", "..", "lib", "agent_evals");
const srcRoot = packageRoot;

const expectedLayers = [
  "types",
  "config",
  "repo",
  "providers",
  "service",
  "runtime",
  "ui",
] as const;

describe("package structure", () => {
  test("every expected layer exists as a directory", () => {
    for (const layer of expectedLayers) {
      const path = join(srcRoot, layer);
      expect(existsSync(path)).toBe(true);
      expect(statSync(path).isDirectory()).toBe(true);
    }
  });

  test("every layer except runtime has an index.ts that re-exports", () => {
    // runtime is the entry point — it has cli.ts, not a public surface.
    const layersWithIndex = expectedLayers.filter((l) => l !== "runtime");
    for (const layer of layersWithIndex) {
      const indexPath = join(srcRoot, layer, "index.ts");
      expect(existsSync(indexPath)).toBe(true);
      const content = readFileSync(indexPath, "utf-8");
      expect(content.length).toBeGreaterThan(0);
      expect(/\bexport\b/.test(content)).toBe(true);
    }
  });

  test("runtime exposes a cli.ts entry point", () => {
    const cliPath = join(srcRoot, "runtime", "cli.ts");
    expect(existsSync(cliPath)).toBe(true);
  });

  test("no layer directory contains a stray file at its root that bypasses the index", () => {
    // Each layer dir should contain only .ts files; subdirectories are allowed
    // for further organization. Non-.ts files at the root are flagged so the
    // package shape stays predictable.
    for (const layer of expectedLayers) {
      const dir = join(srcRoot, layer);
      const entries = readdirSync(dir, { withFileTypes: true });
      const stray = entries.filter(
        (e) => e.isFile() && !e.name.endsWith(".ts"),
      );
      expect(stray.map((e) => e.name)).toEqual([]);
    }
  });

  test("no source file imports node:* APIs from non-runtime, non-repo layers", () => {
    // Provider layers wrap node APIs intentionally; repo touches the filesystem.
    // Other layers must stay pure so they remain testable without IO.
    const ioForbiddenLayers = ["types", "config", "service", "ui"] as const;
    const offenders: string[] = [];
    for (const layer of ioForbiddenLayers) {
      const dir = join(srcRoot, layer);
      walk(dir, (file) => {
        if (!file.endsWith(".ts")) return;
        const text = readFileSync(file, "utf-8");
        if (/from\s+["']node:/.test(text)) {
          offenders.push(file.replace(packageRoot, ""));
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string, visit: (file: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, visit);
    } else if (entry.isFile()) {
      visit(path);
    }
  }
}
