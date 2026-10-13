# Yaki Anywhere

移动端优先的字幕文本编辑与校对工作台，Web / Android 应用共用一套界面与字幕处理源码，Android 使用 Capacitor 打包。

## 目录结构

```text
yaki-anywhere/
├── index.html                 # 页面入口
├── package.json               # 项目配置与运行命令
├── capacitor.config.json      # 原生应用配置
├── android/                   # Capacitor Android 工程
├── src/                       # 应用源码
│   ├── app.js                 # 页面交互与项目状态
│   ├── lib/
│   │   ├── subtitles.js       # ASS 解析、导出及时间轴计算
│   │   └── native-files.js    # 网页下载与 Android 原生保存
│   └── styles/
│       └── app.css            # 界面与响应式样式
├── assets/
│   └── icons/                 # 应用图标
├── public/                    # 按原文件名提供的公共资源
│   ├── manifest.webmanifest   # PWA 安装清单
│   └── sw.js                  # 离线缓存
├── scripts/
│   ├── dev-server.mjs         # 本地预览服务
│   ├── build-web.mjs          # 打包应用资源
│   ├── build-android.mjs      # 生成调试 APK
│   ├── setup-android-sdk.ps1  # 项目内 Android SDK 安装
│   └── android-assets.ps1     # 完整生成 Android res 资源
└── tests/
    └── subtitles.test.mjs     # 字幕模块测试
```

本地服务将 `public/` 映射到网站根路径，例如 `public/sw.js` 通过 `/sw.js` 访问；源码和图标分别通过 `/src/`、`/assets/` 访问。测试、脚本与文档不作为网页资源提供。

## 本地运行

需要 Node.js 22+。首次检出运行 `npm ci` 安装锁定版本的依赖，再运行 `npm run dev`，打开 http://localhost:5174 。运行 `npm test` 执行 ASS 解析和导出测试。

手机与电脑在同一网络时可访问电脑的局域网 IP 和端口 5174。正式安装 PWA 和离线缓存需要 HTTPS（localhost 除外）；普通局域网 HTTP 仅供网页预览。此开发服务器不用于公网部署。

## 功能

- 本地视频文件播放、倍速、拖动进度、全屏。
- ASS 导入：UTF-8，解码异常时尝试 GB18030；保留样式、标签、Comment 与其他非编辑事件。
- 连续播放、播放单条后暂停、单句循环；自动跟随只滚动字幕列表内部，页面位置与焦点保持不变。自动批准开启后，播放结束的字幕自动标为已校对。
- 编辑完整字幕文本、起止时间，确认后进入下一条；搜索与校对状态筛选。
- “当前字幕”内置时间轴：只显示所选字幕，拖动字幕块移动时间、拖动两端调整时长；缩放滑块以当前字幕时长为基础调整比例，放大后可在时间轴内部横向滚动。字幕文本框固定两行高度。
- 播放设置、当前字幕、字幕列表均支持独立折叠，原生键盘操作可用。
- 浏览器本地保存当前字幕项目；导出 UTF-8 BOM ASS。
- 响应式布局、安卓添加到主屏幕、离线应用外壳。

## 当前边界

- Android 使用 Capacitor 原生工程；QQ 小程序尚未实现。调试 APK 用于本地安装体验，商店发布需要正式签名。
- 视频不上传、不持久化，刷新后需重新选择。仅支持所在浏览器可解码的视频格式。
- 当前版本只编辑字幕文本，不拆分原文和译文；每个 Dialogue 的全部文本（包括多行）完整保留。双语功能留待后续开发。旧版本本地草稿自动合并为完整文本。
- 预览显示纯文本，不渲染 ASS 动画、字体与定位特效；导出保留这些标签和样式定义。
- 自动保存仅保留一个项目。导入新项目会提示先导出；清理浏览器数据会删除本地保存。
- 首次打开为空白工作区；导入字幕后显示项目内容。视频区域使用抽象山景占位画面，不包含示例字幕或视频素材。尚未用用户真实视频做设备兼容性验证。

## 验证

`npm test` 覆盖样式/Comment 保留、逗号和标签、多行文本保留、旧草稿迁移、字幕时间轴范围、时间进位、错误输入、BOM/CRLF 和字段顺序。
浏览器已检查桌面与 390px 手机布局，编辑、校对确认、筛选、面板折叠、时间轴切换与拖动调时操作。

## Android 打包

应用名称为 Yaki Anywhere，包名为 `com.yaki.anywhere`，版本为 0.1.0。使用 Capacitor 8.5.3，最低 Android 7（API 24），编译目标为 Android SDK 36。

### 首次配置（Windows）

目前资源生成和 SDK 安装脚本面向 Windows，需要 Node.js 22+、JDK 21（设置 `JAVA_HOME` 并加入 `PATH`）、Windows PowerShell 和 `tar.exe`。Windows 10/11 通常自带后两项。Android Studio 为可选工具，构建使用工程自带的 Gradle Wrapper，无需另外安装 Gradle。

```powershell
npm ci
npm run dev
```

先在 http://localhost:5174 确认网页效果，结束预览后再执行打包步骤。

SDK 有两种配置方式，任选一种：

- 使用 Android Studio 的 SDK：安装 Android SDK Platform 36、Build Tools 35.0.0 和 Platform Tools，并设置 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 为 SDK 的绝对路径。
- 使用项目内 SDK：阅读并接受 [Android SDK 许可](https://developer.android.com/studio#terms-and-conditions) 后执行下列命令。安装脚本下载 Google 命令行工具并安装上述 SDK 组件。

```powershell
./scripts/setup-android-sdk.ps1 -AcceptLicense
```

构建脚本优先使用 `ANDROID_HOME`，其次使用 `ANDROID_SDK_ROOT`，最后使用 `.tools/android/sdk/`；自动写入本机的 `android/local.properties`。

### 日常同步与打包

```powershell
# 生成 Web 和 Android 资源，并同步原生工程；不生成 APK
npm run android:sync

# 同步资源后打开 Android Studio（需已安装）
npm run android:open

# 网页效果确认后，生成调试 APK
npm run android:apk
```

`android:apk` 按以下顺序执行：

1. `build-web.mjs` 将网页源码、图标和 Capacitor JavaScript 运行时复制到 `dist/`。
2. `android-assets.ps1` 从 Capacitor 模板和项目源文件完整生成 `android/app/src/main/res/`。
3. `cap sync android` 复制 Web 资源，生成 Capacitor 配置、插件信息及插件相关 Gradle 文件。
4. `build-android.mjs` 调用 `android/gradlew.bat assembleDebug`，将 Gradle 下载和依赖缓存放入 `.tools/gradle/`。
5. 将 `android/app/build/outputs/apk/debug/app-debug.apk` 复制到 `artifacts/android/yaki-<package.json版本>-debug.apk`。当前版本为 `yaki-0.1.0-debug.apk`。

首次运行 Wrapper 时会按 `android/gradle/wrapper/gradle-wrapper.properties` 下载 Gradle 8.14.3；首次构建还会下载 Android Gradle Plugin 等依赖，需要联网。后续复用缓存。

### Android 资源的来源

`android/app/src/main/res/` 整个目录已加入 `.gitignore`，可在缺失时重建。单独生成资源使用 `npm run android:resources`；准备运行原生应用时使用 `npm run android:sync`，它还会补齐 Capacitor 生成的文件。

| 输入 | 生成内容 |
| --- | --- |
| `node_modules/@capacitor/cli/assets/android-template.tar.gz` | 默认布局、主题、文件路径 XML、适配图标 XML 和各尺寸 PNG 模板；版本由 `package-lock.json` 锁定 |
| `assets/icons/icon-512.png` | 不同密度的应用图标、前景图标，以及横屏/竖屏启动图 |
| `capacitor.config.json` 的 `appName`、`appId` | `values/strings.xml` 中的应用名称、包名和 URL scheme |
| `scripts/android-assets.ps1` 中的主题和绘制规则 | 紫色主题、图标背景色及启动图布局 |
| `cap sync android` | `res/xml/config.xml` 等 Capacitor 生成配置 |

资源生成先在 `.tools/android/` 下的独立临时目录完成，再替换 `res/`，不依赖已有资源。修改名称、图标和主题时应修改上表对应输入；不要直接修改生成目录，下次同步会覆盖它。新增定制资源也应纳入生成脚本。

工程最初由 `npx cap add android` 创建。现有原生源码和构建配置需要保留在 Git 中，正常检出和日常打包不需要再次执行该命令。

### Gradle 与下载文件的提交规则

| 路径 | 是否提交 | 来源和作用 |
| --- | --- | --- |
| `android/gradlew`、`android/gradlew.bat` | **提交** | Capacitor 模板附带的 Wrapper 启动脚本，供各平台启动固定版本的 Gradle |
| `android/gradle/wrapper/gradle-wrapper.jar` | **提交** | 模板附带的小型 Wrapper 程序，负责下载并启动 Gradle；不是完整 Gradle 安装包 |
| `android/gradle/wrapper/gradle-wrapper.properties` | **提交** | 定义 Gradle 版本、下载地址和缓存位置 |
| `android/build.gradle`、`android/app/build.gradle`、`settings.gradle`、`variables.gradle`、`gradle.properties` | **提交** | 原生工程构建配置，包含 SDK 版本、应用版本和模块配置 |
| `android/capacitor.settings.gradle`、`android/app/capacitor.build.gradle`、`android/capacitor-cordova-android-plugins/` | 忽略 | `cap sync android` 根据已安装插件生成 |
| `.tools/gradle/wrapper/dists/` | 忽略 | Wrapper 下载、解压的 Gradle 8.14.3 完整发行包（当前为 `-all`，包含运行时、源码和文档） |
| `.tools/gradle/caches/`、`daemon/`、`native/` 等 | 忽略 | 构建时下载的依赖、运行缓存和本机状态 |
| `.tools/android/` | 忽略 | SDK 安装脚本下载的 `commandlinetools.zip`、SDK 组件、许可文件及资源生成临时文件 |
| `android/.gradle/`、各模块 `build/`、`android/local.properties` | 忽略 | 本机缓存、构建产物及 SDK 路径 |
| `node_modules/`、`dist/`、`artifacts/` | 忽略 | npm 下载依赖、Web 构建结果及 APK 交付副本 |

历史执行记录确认：2026-10-13 15:38（北京时间）运行 `npx cap add android` 创建了工程和 Wrapper；15:44 运行 SDK 安装脚本下载 Android 工具；15:46 设置 `GRADLE_USER_HOME` 为 `.tools/gradle/` 并执行 `gradlew.bat --version`，触发 Gradle 下载。后续 `build-android.mjs` 使用同一缓存目录。因此 `android/gradle/` 应保留，`.tools/gradle/` 应忽略，不能按名称把两者一起忽略。

Gradle 官方要求将四个 Wrapper 文件（包括 JAR）提交到版本控制，参见 [Gradle Wrapper 文档](https://docs.gradle.org/current/userguide/gradle_wrapper.html)。

Android 的导出按钮通过系统“保存文件”对话框写入 UTF-8 ASS；用户自行选择保存位置，无需申请整个设备的文件访问权限。浏览器版本使用普通文件下载。原生端使用随 APK 打包的资源，不注册 PWA 离线缓存。

Android 设备上的视频编码、文件选择、导出与全屏仍需实机检查。
