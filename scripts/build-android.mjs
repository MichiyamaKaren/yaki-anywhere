import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [lane = "apk", ...options] = process.argv.slice(2);
const rubyBin = path.join(root, ".tools/ruby/bin");
const localRuby = path.join(
  rubyBin,
  process.platform === "win32" ? "ruby.exe" : "ruby",
);
const configuredRuby = process.env.RUBY_EXECUTABLE || "ruby";
const systemRubyAvailable =
  spawnSync(configuredRuby, ["--version"], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true,
  }).status === 0;
let installedRuby;
if (process.platform === "win32" && !systemRubyAvailable) {
  try {
    installedRuby = readdirSync("C:\\", { withFileTypes: true })
      .filter((entry) => /^Ruby\d+-x64$/i.test(entry.name))
      .map((entry) => path.join("C:\\", entry.name, "bin", "ruby.exe"))
      .find(existsSync);
  } catch {
    // Fall back to the project-local Ruby when the drive root is not readable.
  }
}
const ruby = systemRubyAvailable
  ? configuredRuby
  : installedRuby || (existsSync(localRuby) ? localRuby : "ruby");
const bundleArgs =
  lane === "setup"
    ? ["install", ...options]
    : ["exec", "fastlane", "android", lane, ...options];
const result = spawn(ruby, ["-S", "bundle", ...bundleArgs], {
  cwd: root,
  env: {
    ...process.env,
    PATH: path.dirname(ruby) + path.delimiter + (process.env.PATH || ""),
    BUNDLE_GEMFILE: path.join(root, "Gemfile"),
    BUNDLE_PATH: process.env.BUNDLE_PATH || path.join(root, ".tools/gems"),
    BUNDLE_USER_HOME:
      process.env.BUNDLE_USER_HOME || path.join(root, ".tools/bundler"),
    GRADLE_USER_HOME: path.join(root, ".tools/gradle"),
    FASTLANE_SKIP_UPDATE_CHECK: "1",
    FASTLANE_OPT_OUT_USAGE: "1",
  },
  stdio: "inherit",
});
result.on("error", (error) => {
  console.error(
    `Could not start fastlane: ${error.message}. Install Ruby 3.3+ and run npm run android:setup.`,
  );
  process.exitCode = 1;
});
result.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
