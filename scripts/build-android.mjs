import { spawn } from "node:child_process";
import {
  existsSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sdkRoot =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  path.join(root, ".tools/android/sdk");
if (!existsSync(path.join(sdkRoot, "platforms/android-36/android.jar"))) {
  console.error(
    "Android SDK 36 is missing. Install it with Android Studio or scripts/setup-android-sdk.ps1, then run android:apk again.",
  );
  process.exit(1);
}
writeFileSync(
  path.join(root, "android/local.properties"),
  "sdk.dir=" + sdkRoot.replaceAll("\\", "/") + "\n",
);
const isWindows = process.platform === "win32";
const result = spawn(
  isWindows ? "gradlew.bat" : "./gradlew",
  ["assembleDebug", "--no-daemon", "--console=plain"],
  {
    cwd: path.join(root, "android"),
    env: {
      ...process.env,
      ANDROID_HOME: sdkRoot,
      ANDROID_SDK_ROOT: sdkRoot,
      GRADLE_USER_HOME: path.join(root, ".tools/gradle"),
    },
    stdio: "inherit",
    shell: isWindows,
  },
);
result.on("error", (error) => {
  console.error(`Could not start Android Gradle build: ${error.message}`);
  process.exitCode = 1;
});
result.on("exit", (code) => {
  process.exitCode = code ?? 1;
  if (code === 0) {
    const version = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ).version.replace(/[^a-zA-Z0-9.-]/g, "_");
    const folder = path.join(root, "artifacts/android");
    mkdirSync(folder, { recursive: true });
    const filename = "yaki-" + version + "-debug.apk";
    copyFileSync(
      path.join(root, "android/app/build/outputs/apk/debug/app-debug.apk"),
      path.join(folder, filename),
    );
    console.log("APK: artifacts/android/" + filename);
  }
});
