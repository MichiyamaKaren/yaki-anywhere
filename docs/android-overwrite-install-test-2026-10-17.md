# Android 覆盖安装与项目保留测试记录

测试日期：2026-10-17  
设备：vivo V2217A（ADB 序列号 `10ACA60QAN001M4`）  
应用 ID：`com.yaki.anywhere`

## 执行结果

| 阶段     | 应用版本              | 结果                                                                   |
| -------- | --------------------- | ---------------------------------------------------------------------- |
| 基线安装 | 0.1.1 / versionCode 2 | 安装后导入并保存测试项目                                               |
| 覆盖安装 | 0.1.2 / versionCode 3 | `adb install -r --no-streaming` 后成功升级，包管理器报告 versionCode 3 |

设备首次检查时没有安装该应用，因此先安装现有的 0.1.1 APK 作为基线，再使用 0.1.2 做覆盖安装。vivo 显示“继续安装”系统确认页；确认后系统保留原应用数据并完成升级。两份 APK 的签名证书 SHA-256 相同：

`bf91aed29f74f7d638e9c4bdf4638002812d19038ccec10cbceee13371453f32`

在 0.1.1 中通过应用界面导入 ASS 测试字幕、关联视频并保存。升级到 0.1.2 后重新启动应用，工作台自动打开原项目，界面仍显示项目名 `YakiOverwriteTest`、1 条字幕 `Persistence test subtitle`、视频关联 `YakiOverwriteTest.mp4` 和“已保存到本地”。视频时长显示为 2 秒。

应用私有目录 `no_backup/yaki-projects` 中，ASS 与 MP4 私有副本在升级前后文件名、大小和 SHA-256 一致。`projects.db` 在覆盖安装完成、重新打开应用之前也保持原 SHA-256；重新打开项目后 SQLite 文件被应用再次写入，最终哈希记录如下。重新打开后的界面仍显示完整项目数据。

| 文件                   |     大小 | SHA-256                                                            |
| ---------------------- | -------: | ------------------------------------------------------------------ |
| ASS 私有副本           |    630 B | `a08418c4e54ad45a61c6e1d4cf87fbd57a3baeb2623aeb3995cddb5543098cac` |
| MP4 私有副本           | 53,228 B | `a7e174be99728296bdc00efeb7930705b6d01e9171b5c15c3b72e444f4a3460c` |
| `projects.db` 当前文件 | 28,672 B | `cc92f498474b560689145a3b4d8125bb5c42f6a81a67d09d2def35f30c22c154` |

覆盖安装后、首次重开应用前的数据库 SHA-256 为 `9efcc877b692d973759c9b9e1ce6a8811b5f2cd8fb83b75c5e5acbec93c9ac7c`，与安装前一致。

## 本次测试改动

测试版由 0.1.1 升为 0.1.2，并将 Android `versionCode` 从 2 增为 3。`index.html` 的 `<head>` 中加了一行不影响运行行为的测试标记：

```html
<!-- Overwrite-install persistence test build marker: 2026-10-17 -->
```

APK：`artifacts/android/yaki-0.1.2-debug.apk`  
APK SHA-256：`97176615D0E447C84725B1E4A401C6138CE8330503E350B0AD40A07A32B196B3`

## 回退方法

只回退测试版改动时，逐项恢复下面的值，不要还原整个文件（这些文件在本次测试前已有其他工程修改）：

1. `package.json` 的 `version`：`0.1.2` → `0.1.1`。
2. `package-lock.json` 根对象和 `packages[""]` 的 `version`：`0.1.2` → `0.1.1`。
3. `android/app/build.gradle` 的 `versionCode`：`3` → `2`。
4. 从 `index.html` 删除上述测试标记注释。

如需重新生成基线 APK，再运行 `npm run android:apk`。如需把手机上的 0.1.2 回退到 0.1.1，可使用 `adb install -r -d artifacts/android/yaki-0.1.1-debug.apk`；`-d` 用于允许此调试包降级。

## 测试文件

导入的测试视频和 ASS 字幕位于手机 `Download/YakiOverwriteTest.mp4` 与 `Download/YakiOverwriteTest.ass`。项目私有副本已保存，不依赖这些原始测试文件继续存在。
