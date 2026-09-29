import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { githubBrokerEnvironment } from "./github-launcher.js";
import { prepareGitHubOperationLaunchers } from "./execution-target.js";

const exec = promisify(execFile);
const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** The real git.exe found on the host PATH, never a launcher or a .cmd shim. */
function hostGit(): string | null {
  for (const entry of (process.env.PATH ?? "").split(path.win32.delimiter)) {
    const candidate = path.join(entry, "git.exe");
    if (entry && existsSync(candidate)) return candidate;
  }
  return null;
}

const git = process.platform === "win32" ? hostGit() : null;
// Git for Windows layout: <root>/cmd/git.exe or <root>/bin/git.exe, with <root>/bin/bash.exe.
const gitBash = git ? path.join(path.dirname(path.dirname(git)), "bin", "bash.exe") : null;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "paperclip-launcher-win-"));
  roots.push(root);
  // Spaces and a second drive letter must survive both PATH forms. Z: need not
  // exist; it only has to round-trip through the native and Git Bash PATHs.
  const tools = path.join(root, "Tools With Space", "bin");
  await mkdir(tools, { recursive: true });
  // gh.exe fixture: a hard link to node.exe (not the real GitHub CLI). The
  // decoys prove the launcher selects gh.exe, never a shell shim or an
  // extensionless file that Windows cannot execute.
  const gh = path.join(tools, "gh.exe");
  await link(process.execPath, gh).catch(() => copyFile(process.execPath, gh));
  await writeFile(path.join(tools, "gh.cmd"), "@echo cmd decoy\r\n");
  await writeFile(path.join(tools, "gh"), "extensionless decoy\n");
  const home = path.join(root, "home");
  await mkdir(home);
  // Host Git credentials that the managed launcher must never load.
  await writeFile(path.join(home, ".gitconfig"), "[credential]\n\thelper = store\n[user]\n\tname = Host User\n");
  const nativePath = [tools, path.dirname(git!), path.dirname(process.execPath),
    "Z:\\Other Drive\\bin", path.join(process.env.SystemRoot ?? "C:\\Windows", "System32")].join(";");
  const base = {
    SystemRoot: process.env.SystemRoot ?? "C:\\Windows",
    PATHEXT: ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC",
    TEMP: root, TMP: root, HOME: home, USERPROFILE: home,
    // A stale duplicate, as produced by spreading Windows process.env.
    Path: "C:\\stale-duplicate",
    PATH: nativePath,
    GH_TOKEN: "host-secret-fixture",
  };
  return { root, tools, home, nativePath, base };
}

async function launchers(base: Record<string, string>, broker = { url: "", token: "" }) {
  return prepareGitHubOperationLaunchers({
    runId: `win-${Math.random().toString(36).slice(2)}`, target: null, cwd: os.tmpdir(),
    env: githubBrokerEnvironment(base, broker),
  });
}

async function run(command: string, args: string[], env: Record<string, string>) {
  try {
    const result = await exec(command, args, { env, timeout: 30_000 });
    return { code: 0, ...result };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

describe.runIf(process.platform === "win32" && git)("managed GitHub launchers on Windows", () => {
  it("keeps the native `;` PATH free of launchers, with a single PATH key", async () => {
    const { base, nativePath } = await fixture();
    const env = await launchers(base);
    expect(Object.keys(env).filter((key) => /^path$/i.test(key))).toEqual(["PATH"]);
    expect(env.PATH).toBe(nativePath);
    expect(env.PATH).not.toContain(env.PAPERCLIP_GITHUB_LAUNCHER_DIR);
  });

  it("runs the real git.exe through `node <launcher>/git` without host credentials", async () => {
    const { base } = await fixture();
    const env = await launchers(base);
    const launcher = path.join(env.PAPERCLIP_GITHUB_LAUNCHER_DIR, "git");
    const version = await run(process.execPath, [launcher, "--version"], env);
    expect(version.code, version.stderr).toBe(0);
    expect(version.stdout).toMatch(/^git version /);

    const helper = await run(process.execPath, [launcher, "config", "--get-all", "credential.helper"], env);
    const name = await run(process.execPath, [launcher, "config", "user.name"], env);
    for (const output of [helper, name]) {
      expect(`${output.stdout}${output.stderr}`).not.toMatch(/store|Host User|host-secret-fixture/);
    }
  });

  it("selects the gh.exe fixture, not gh.cmd or an extensionless file", async () => {
    const { base } = await fixture();
    const env = await launchers(base);
    const result = await run(process.execPath, [path.join(env.PAPERCLIP_GITHUB_LAUNCHER_DIR, "gh"), "--version"], env);
    expect(result.code, result.stderr).toBe(0);
    // The fixture gh.exe is node.exe, so it reports a Node version.
    expect(result.stdout.trim()).toBe(process.version);
  });

  it("forwards a fixture broker identity to git.exe (fixture broker, not real GitHub auth)", async () => {
    const { base } = await fixture();
    const server = createServer((req, res) => {
      req.resume();
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: "available",
        env: { GIT_AUTHOR_NAME: "Fixture Broker", GIT_AUTHOR_EMAIL: "fixture@example.test" } }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const env = await launchers(base, { url: `http://127.0.0.1:${address.port}`, token: "fixture-capability" });
    const result = await run(process.execPath,
      [path.join(env.PAPERCLIP_GITHUB_LAUNCHER_DIR, "git"), "var", "GIT_AUTHOR_IDENT"], env);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^Fixture Broker <fixture@example\.test> /);
    expect(`${result.stdout}${result.stderr}`).not.toContain("fixture-capability");
  });

  it.each([
    ["node spawn", "git", ["--version"]],
    ["cmd", "cmd.exe", ["/d", "/c", "git --version"]],
    ["PowerShell", "powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "git --version"]],
  ])("keeps %s callers on the real git.exe (native callers are not routed through the launchers)", async (_name, command, args) => {
    const { base } = await fixture();
    const managed = await launchers(base);
    const env = { ...managed,
      PATH: `${managed.PATH};${path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0")}` };
    const result = await run(command, args as string[], env);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^git version /);
  });

  it.runIf(gitBash && existsSync(gitBash))("puts the launchers first in Git Bash with a POSIX PATH", async () => {
    const { base } = await fixture();
    const env = await launchers(base);
    const profile = await readFile(path.join(env.PAPERCLIP_GITHUB_LAUNCHER_DIR, ".bashrc"), "utf8");
    // The native `;` PATH never enters the profile; Git Bash already converted it.
    expect(profile).not.toContain(env.PATH);
    expect(profile).not.toContain("Tools With Space");
    // BASH_ENV sources the staged .bashrc in this non-interactive shell.
    const script = 'command -v git; command -v gh; command -v node; git --version; gh --version; printf "%s" "$PATH"';
    const result = await run(gitBash!, ["--noprofile", "--norc", "-c", script], env);
    expect(result.code, result.stderr).toBe(0);
    const [gitPath, ghPath, nodePath, gitVersion, ghVersion, shellPath] = result.stdout.split(/\r?\n/);
    const launcherDir = (await run(gitBash!, ["--noprofile", "--norc", "-c",
      `/usr/bin/cygpath -u '${env.PAPERCLIP_GITHUB_LAUNCHER_DIR}'`], env)).stdout.trim();
    expect(gitPath).toBe(`${launcherDir}/git`);
    expect(ghPath).toBe(`${launcherDir}/gh`);
    // `#!/usr/bin/env node` resolves once PATH is a valid POSIX list.
    expect(nodePath).toMatch(/\/node$/);
    expect(gitVersion).toMatch(/^git version /);
    expect(ghVersion).toBe(process.version);
    const entries = shellPath!.split(":");
    expect(entries[0]).toBe(launcherDir);
    expect(entries).toContain("/z/Other Drive/bin");
    expect(entries.some((entry) => entry.endsWith("/Tools With Space/bin"))).toBe(true);
    expect(entries).toContain("/usr/bin");
    expect(shellPath).not.toMatch(/[;\\]/);
  });
});
