# Android 打包与发布

只新增 fastlane 这一套发布工具，继续使用已有 npm、Capacitor、Gradle 和 Android SDK。fastlane 内的 `versioning_android` 插件负责读写 Android 构建号；语义版本升级交给 npm。依赖由 `Gemfile.lock` 锁定，不额外引入 Trapeze、release-it 或自制版本号算法。

## 首次配置

1. 安装 Node.js 22+、JDK 21+、Android SDK（详见 README）及 Ruby 3.3+。Windows 使用 [RubyInstaller](https://rubyinstaller.org/downloads/) 的 **Ruby+Devkit** 版本，启用 Ruby 的 PATH，并完成其 `ridk install` 默认组件安装；部分 fastlane 依赖需要 DevKit 编译原生扩展。Ruby 自带 Bundler；若没有，执行 `gem install bundler`。
2. 执行 `npm ci` 和 `npm run android:setup`。后者运行标准的 `bundle install`，安装锁定的 fastlane 依赖。npm 入口优先使用 PATH 中的 Ruby；Windows 下会自动查找 RubyInstaller 默认安装目录，最后回退到 `.tools/ruby/bin/`。也可用 `RUBY_EXECUTABLE` 指定 Ruby 路径。gems 保存在 `.tools/gems/`。
3. 从备份恢复 `.tools/android/yaki-anywhere-debug.keystore`。这是已安装调试 APK 的原始密钥，不能随意重新生成或替换。

直接使用 fastlane 时可先执行 `bundle config set --local path .tools/gems`，然后 `bundle install`、`bundle exec fastlane android apk`；这些与 npm 入口使用同一个 Fastfile。

## 常用命令

| 命令                                                      | 行为                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------- |
| `npm run android:apk`                                     | 同步网页和原生资源，用固定开发密钥生成 debug APK                 |
| `npm run android:version`                                 | patch 升级，例如 0.1.1 → 0.1.2，同时递增 versionCode             |
| `npm run android:version -- type:minor`                   | minor 升级，例如 0.1.1 → 0.2.0，同时递增 versionCode             |
| `npm run android:version -- type:major`                   | major 升级，同时递增 versionCode                                 |
| `npm run android:release`                                 | 使用本地正式密钥生成 release APK                                 |
| `npm run android:aab`                                     | 使用正式上传密钥生成 Google Play release AAB                     |
| `npm run android:play`                                    | 生成 AAB 并上传 Google Play，默认进入 internal 轨道的 draft 草稿 |
| `npm run android:play -- track:internal status:completed` | 明确指定发布状态，将构建发布到内部测试轨道                       |
| `npm run android:info`                                    | 查看包名、版本、构建号，以及 Gradle 的签名报告                   |

正常发版顺序是先执行 `android:version`，检查并提交版本变更，再打包。升版命令使用 npm 的 `--no-git-tag-version`，不会自动提交、打标签或推送。只修改应用内容后反复调试时，直接 `android:apk`，不会自动消耗版本号。构建产物复制到 `artifacts/android/`。

## 配置位置

| 设置                                         | 维护位置                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| 应用版本名                                   | `package.json` 的 `version`；npm 同时更新 package-lock.json，Gradle 直接读取         |
| Android 构建号                               | `android/app/build.gradle` 的数字 `versionCode`；通过 fastlane 的版本命令递增        |
| 包名、显示名称、Web 输出目录                 | `capacitor.config.json`；Gradle 的 applicationId 读取 appId，资源生成读取名称        |
| minSdk、targetSdk、compileSdk、AndroidX 版本 | `android/variables.gradle`                                                           |
| Android Gradle Plugin / Gradle 版本          | `android/build.gradle` / `android/gradle/wrapper/gradle-wrapper.properties`          |
| 权限、Activity 和 Provider                   | `android/app/src/main/AndroidManifest.xml`                                           |
| 图标、启动画面                               | `assets/icons/icon-512.png` 和 `scripts/android-assets.ps1`                          |
| Android SDK 所在目录                         | ANDROID_HOME 或 ANDROID_SDK_ROOT，未设置时用 `.tools/android/sdk/`                   |
| 开发签名                                     | `.tools/android/yaki-anywhere-debug.keystore`；Gradle 显式配置，缺少时不生成替代密钥 |
| 正式签名 / Play 认证                         | 本地 `fastlane/.env`，参考 `.env.example`                                            |
| 打包、版本和上传步骤                         | `fastlane/Fastfile`                                                                  |

包名与签名共同决定能否覆盖安装；已有调试安装继续使用原包名和开发密钥升级。不要为解决安装冲突而卸载或改用其他密钥。

## 正式签名与可选 Google Play 上传

1. 用 Android Studio 的 **Build → Generate Signed Bundle / APK** 创建正式上传密钥，或使用已有上传密钥。不要把开发调试密钥当作 Google Play 正式上传密钥。
2. 把 `fastlane/.env.example` 复制为 `fastlane/.env`，填写 ANDROID_KEYSTORE_FILE、ANDROID_KEYSTORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD。文件路径相对项目根目录，也支持绝对路径。
3. 本地 `android:release`、`android:aab` 不需要 Google 账号。签名参数由 fastlane 通过 Gradle 官方参数传入，打印构建命令时隐藏密码。
4. 需要上传时，在 Play Console 创建应用、完成首次上传和 Play App Signing 配置，再给 Google Play Developer API 的服务账号授予该应用相应的上传权限。将服务账号 JSON 放到 `.tools/android/`，在 `.env` 配置 GOOGLE_PLAY_JSON_KEY。
5. 执行 `npm run android:play` 上传内部测试草稿；确认 Play Console 中的内容后再发布。首次创建应用、商店资料、隐私与合规表单仍需在 Play Console 完成。

现有开发安装与正式签名不同，正式 APK / Play 安装不能直接替换开发安装。发布渠道转换需要先安排项目数据迁移；日常开发升级继续走固定开发密钥。Play App Signing 使用的应用签名密钥与上传密钥也可能不同。

`.env`、`.keystore`、`.jks`、`.tools/` 和 gems 缓存均不提交到 Git。请另外保存密钥备份；fastlane 不会替你备份或托管 Android 密钥。

## 官方依据

- [fastlane Android 安装与 Bundler](https://docs.fastlane.tools/getting-started/android/setup/)
- [fastlane Gradle：APK / AAB、版本参数与签名参数](https://docs.fastlane.tools/actions/gradle/)
- [fastlane .env 配置](https://docs.fastlane.tools/advanced/other/)
- [fastlane Android 版本插件](https://github.com/beplus/fastlane-plugin-versioning_android)
- [npm version](https://docs.npmjs.com/cli/v11/commands/npm-version/)
- [fastlane Google Play 上传](https://docs.fastlane.tools/actions/upload_to_play_store/)
- [Android 签名与 Play App Signing](https://developer.android.com/studio/publish/app-signing)
