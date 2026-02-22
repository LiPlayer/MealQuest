# MealQuest 全链路执行手册（单文档版）

适用目标：你只看这一份文档，就能从 0 开始理解系统、完成在线测试与联调、推进试点上线、进入运营与盈利阶段。

文档定位：执行手册，不是概念展示。

---

## 1. 先记住这句话

MealQuest 不是点餐系统。  
它是“餐饮私域支付 + 资产化运营系统”，核心是把一次付款变成长期复购关系。

---

## 2. 系统全景（你在操作什么）

1. `MealQuestServer`：后端核心（账本、支付、策略、权限、审计、风控、多租户）。
2. `MealQuestMerchant`：商户原生 App（老板/店长/店员操作端）。
3. `meal-quest-customer`：顾客微信小程序（支付与资产体验端）。

你要做的事情本质上是：
1. 让三端连通。
2. 让老板链路和顾客链路都跑通。
3. 让结果可量化（指标）。
4. 让流程可复制（上线运营）。

---

## 3. 角色与核心流程

## 3.1 老板（商户端）

标准链路：
1. 手机号登录。
2. 引导页。
3. 开店。
4. 特约申请。
5. 进入经营台。
6. 策略提案 -> 确认 -> 生效。
7. 必要时熔断（Kill Switch）。

你要验证的结果：
1. 老板不需要懂技术也能完成开店与活动操作。
2. 策略执行有记录、有审计、可回溯。

## 3.2 顾客（小程序）

标准链路：
1. 进入门店。
2. 查看首页资产。
3. 发起支付。
4. 查看账户中心（流水/发票）。
5. 注销（可选测试）。

你要验证的结果：
1. 顾客路径连续、可解释、不跳错。
2. 支付后账务变化正确。

## 3.3 平台运营者（你）

标准动作：
1. 启动环境。
2. 跑回归。
3. 跑双角色演练。
4. 看核心指标。
5. 复盘并决定下一步。

---

## 4. 商业化认知（怎么盈利）

## 4.1 收入来源

1. 门店订阅费（SaaS 月费）。
2. 增值能力费（高级策略、联盟、自动化运营）。
3. 运营服务费（代运营、增长方案、复盘服务）。
4. 支付相关收益（后续真实网关阶段）。

## 4.2 成本来源

1. 云资源与系统运维。
2. 研发维护。
3. 商家成功与运营团队。
4. 市场拓展。

## 4.3 盈利关键

1. 提升付费商家比例。
2. 提高续费率。
3. 让单店价值提升可证明（复购、客单、核销、ROI）。
4. 控制服务成本（自动化比例提高）。

---

## 5. 当前阶段地图（你现在在哪）

## 阶段 A：产品可用（MVP）

完成标志：双端主链路能跑通，服务端具备权限、审计、风控基本能力。

## 阶段 B：线下联调（LAN）

完成标志：同一 Wi-Fi 下，真机可跑双端全流程。

## 阶段 C：灰度上线

完成标志：小规模门店试运行，具备回滚与告警机制。

## 阶段 D：规模化运营

完成标志：可复制签约与续费，收入增长持续高于成本增长。

---

## 6. 一次性准备（第一次做）

1. 电脑与手机在同一 Wi-Fi。
2. 电脑安装 Node.js 与 npm。
3. Android 真机调试（如需跑商户端真机）已开启 USB 调试。
4. 微信开发者工具安装完成（顾客端小程序）。
5. 仓库路径：`D:\Projects\MealQuest`。

---

## 7. React Native 基础认知（商户端开发者必读）

如果你是第一次接触 React Native，请理解以下三个核心支柱，这能帮你迅速定位 90% 的启动问题。

### 7.1 "原生壳子" 与 "JS 逻辑"
*   **原生容器 (Native Container)**：`MealQuestMerchant/android` 目录下是真正的 Android 工程。它负责系统的生命周期、权限申请和底层性能。
*   **JS 业务 (JS Bundle)**：你在 `src` 目录下写的代码，最终会被编译成一个巨大的 `index.bundle` 文件。
*   **关系**：原生容器像是一个专用的“浏览器”，而你的 JS 代码是跑在里面的“网页”。

### 7.2 为什么要分两步启动？
运行商户端时，实际上是在运行两个独立的服务：
1.  **Metro Bundler (`npm start`)**：
    *   **作用**：JS 编译服务器。
    *   **特点**：它支持“热更新”。只要它开着，你改代码保存，手机上几乎秒级生效。
2.  **原生编译安装 (`npm run android`)**：
    *   **作用**：调用 Gradle 工具，把原生壳子编译成 `.apk` 并在手机上运行。
    *   **什么时候需要重新跑？**：当你修改了 `android` 目录下的系统配置文件，或者安装了新的原生插件（如支付、扫码插件）时。

### 7.3 关键工具：Metro 控制台
Metro 启动后，控制台会处于待命状态。记住这几个快捷键：
*   输入 `r`：手动刷新界面（Reload）。
*   输入 `d`：打开手机上的开发者菜单（可开启 Debug、查看元素层级）。

### 7.4 编译排错“三板斧”
如果你在执行 `npm run android` 时遇到 `FAILED`（如 `assertMinimalReactNativeVersionTask FAILED`）：
1.  **看版本**：检查 `package.json` 中的 `react-native` 版本与插件是否兼容。
2.  **清缓存**：进入 `android` 目录执行 `.\gradlew clean`。
3.  **重装包**：删除 `node_modules` 并重新执行 `npm install`。

### 7.6 Babel 配置红线（避免 Metro 500 红屏）
1. `preset` 和 `plugin` 不能混用。
2. `nativewind/babel` 在本项目必须放在 `presets`，不能放在 `plugins`。
3. `babel.config.js` 修改后，必须重启 Metro 并加 `--reset-cache`。
4. 一旦出现 `The development server returned response error code: 500`，先看 Metro 终端第一条 `TransformError`，不要先改业务代码。

### 7.5 开发模式 (Dev) vs. 发布模式 (Release)
Release模式下**不需要**两步启动。 上线到应用商店的 APP 是“单兵作战”的。

| 特性 | 开发模式 (Development) | 发布模式 (Release) |
| :--- | :--- | :--- |
| **JS 来源** | 从你电脑的 Metro Server 实时拉取 | 已经静态打包在 APP 内部 (Offline Bundle) |
| **性能** | 包含大量调试工具，较慢 | 经过代码混淆和压缩，极快 |
| **热更新** | 保存代码即刻生效 | 必须通过应用商店更新（除非使用 CodePush） |
| **二步启动** | 必须 (Metro + Native) | **不适用**（用户只下载安装包） |

**结论**：你在开发阶段看到的“两步走”，是为了让你改代码能秒级看到效果。上线时，打包工具会自动把 JS 揉进原生包里。


## 8. 每天固定执行顺序（可复制）

以下命令都在仓库根目录执行。

### 步骤 1：启动局域网服务端

```powershell
# 预先配置：MealQuestServer/.env -> PORT=3030
.\scripts\start-server-lan.ps1
```

你会看到：
1. LAN IP 候选（如 `192.168.31.10`）。
2. 服务监听从 `.env` 读取的对应端口。

### 步骤 2：启动商户端

```powershell
# 预先配置：MealQuestMerchant/.env -> MQ_SERVER_URL=http://<LAN_IP>:3030
.\scripts\start-merchant-app.ps1 -Platform android
```

说明：
1. 采用 `react-native-config` 专业方案，自动从 `.env` 注入环境变量。
2. 脚本自动识别配置，不再强制要求命令行传参。

### 步骤 3：启动顾客端

```powershell
# 预先配置：meal-quest-customer/.env.development -> TARO_APP_SERVER_BASE_URL=...
.\scripts\start-customer-weapp.ps1
```

### 步骤 4：执行老板 + 顾客双角色验证

按第 10 章“标准验收脚本”逐项跑。

### 调试细节（必须掌握）

1. 首次安装商户端到手机：通常需要 USB 数据线（或先完成无线 ADB 配对）。
2. 安装成功后日常联调：可以不插线，走同一 Wi-Fi 即可。
3. 不要在手机端使用 `127.0.0.1`，必须使用电脑 LAN IP。
4. Metro 默认端口是 `8081`，后端端口是 `3030`，两者都要可达。
5. 快速连通性检查：

```powershell
# 电脑端确认手机已连接
adb devices

# 手机浏览器可访问则说明后端连通
http://<LAN_IP>:3030/health
```

### 何时需要端口转发（adb reverse）

1. 你在手机里必须使用 `localhost`/`127.0.0.1` 访问服务时。
2. 你走 USB 调试且不想走局域网 IP 时。

```powershell
adb reverse tcp:3030 tcp:3030
adb reverse tcp:8081 tcp:8081
```

默认 LAN 模式下通常不需要端口转发。

---

用途：联调真实本地后端 API。

关键：`ServerUrl` 必须是电脑 LAN IP，不能是 `127.0.0.1`。

---

## 10. 一键门禁（每天至少一次）

```powershell
node .\scripts\release-local.js
```

通过标准：
1. 服务端测试通过。
2. 服务端 smoke 通过。
3. 商户端测试和类型检查通过。
4. 顾客端测试与构建通过。
5. 报告 `artifacts/release-local-report.json` 中 `allPassed=true`。

---

## 11. 标准验收脚本（老板 + 顾客）

## 11.1 老板验收

1. 打开商户 App。
2. 完成手机号登录。
3. 完成开店（自定义门店）。
4. 完成特约申请。
5. 进入经营台。
6. 创建一个策略提案并确认。
7. 手动触发相关事件，观察策略执行。
8. 打开/关闭熔断，确认策略阻断。

通过条件：
1. 全链路无崩溃。
2. 操作有反馈。
3. 审计/事件可追踪。

## 11.2 顾客验收

1. 进入启动页并进入门店。
2. 首页可见资产区与活动区。
3. 完成一次支付。
4. 进入账户中心查看流水/发票。
5. 测试注销二次确认（可选）。

通过条件：
1. `startup -> index -> account` 路径可达。
2. 支付后账务有变化。
3. 本人数据可读，跨用户/跨商户受限。

---

## 12. 关键指标（每天记录）

至少记录这 8 个：
1. 服务可用性（是否有中断）。
2. API 错误率。
3. 支付成功率。
4. 活动触发率。
5. 活动核销率。
6. 复购率（试点门店）。
7. 商户活跃率（本周活跃门店占比）。
8. 严重故障数（P0/P1）。

---

## 13. 常见问题与排查顺序

## 13.1 手机连不上服务端

先查：
1. 是否用了 `127.0.0.1`（错误）。
2. 是否同一 Wi-Fi。
3. 防火墙是否放行 3030 入站。

## 13.2 小程序请求失败

先查：
1. 微信开发者工具是否允许开发态不校验域名/TLS。
2. `TARO_APP_SERVER_BASE_URL` 是否是电脑 LAN IP。

## 13.3 商户端启动失败

先查：
1. `npm start`（Metro）是否正常。
2. `npm run android` 是否有设备连接。
3. 环境变量是否注入成功（脚本输出会显示）。

进一步定位：
1. 检查设备是否被 ADB 识别：`adb devices`。
2. 检查 SDK 路径是否有效：查看 `MealQuestMerchant/android/local.properties` 中 `sdk.dir`。
3. 若出现 `Use port 8082 instead` 提示：优先保持 `8081`，先单独启动 Metro，再执行 `npm run android -- --no-packager`。
4. 若 NDK 报错：确认 `MealQuestMerchant/android/build.gradle` 中 `ndkVersion` 与本机已安装版本一致。
5. 若依赖兼容报错：先 `npm install`，再 `android/gradlew clean` 后重试。

WiFi 红屏专项（本项目高频）：
1. 若日志出现 `Couldn't connect to ws://localhost:8081`：手机 Dev Server 还在 `localhost`。
2. 在手机开发菜单同时设置两处：
   `Debug server host & port for device` = `<LAN_IP>:8081`
   `Change bundle location` = `http://<LAN_IP>:8081/index.bundle?platform=android&dev=true&minify=false`
3. Metro 必须用 LAN 监听启动：
```powershell
cd .\MealQuestMerchant
npx react-native start --host 0.0.0.0 --port 8081 --reset-cache
```
4. 若仍红屏，先看 Metro 是否返回 500（浏览器打开 bundle URL），再看 Metro 终端的 `TransformError`。

## 13.4 不确定问题在哪

先跑：
```powershell
node .\scripts\release-local.js
```

再根据失败阶段定位：
1. Server 失败 -> 后端问题。
2. Merchant 失败 -> RN 环境/前端问题。
3. Customer 失败 -> 小程序构建/测试问题。

---

## 14. 上线前最小标准（Go / No-Go）

满足全部才 Go：
1. 连续 7 天关键链路稳定（无 P0）。
2. 至少 1 家试点门店跑出正向经营结果。
3. 有发布、回滚、告警、值班责任人。
4. 隐私/权限/审计检查通过。

任一不满足 -> No-Go，只做补齐，不开新范围。

---

## 15. 30 天执行计划（按周推进）

## 第 1 周：打底

目标：双端 LAN 稳定。

日动作：
1. 每天跑双端主链路 1 次。
2. 每天记录问题与修复。

周产出：
1. 门店开通 SOP。
2. 顾客支付 SOP。
3. 双端联调录屏。

## 第 2 周：试点

目标：真实门店跑数据。

日动作：
1. 每天记录支付成功率/核销率/异常数。
2. 当天问题当天闭环。

周产出：
1. 第 2 周试点复盘。
2. 第一份“经营改善证据”。

## 第 3 周：优化

目标：形成续费证据。

日动作：
1. 仅优化 1~2 个高价值策略。
2. 每天看 ROI。

周产出：
1. 门店前后对比报告（客单/复购/核销）。
2. 行业策略推荐清单。

## 第 4 周：上线准备

目标：进入灰度条件。

日动作：
1. 每天跑门禁。
2. 每天核对灰度准备项。

周产出：
1. 灰度门店名单与时间表。
2. 上线 Go/No-Go 评估结论。

---

## 16. 每周复盘模板（直接复制）

```text
【本周目标】
-

【实际结果】
-

【核心指标】
- 支付成功率：
- 活动核销率：
- 复购率：
- 商家活跃率：
- 系统错误率：

【本周最大问题】
- 现象：
- 根因：
- 修复动作：
- 是否复发：

【商家价值证明】
- 本周给商家带来的量化变化：

【下周优先级（最多3项）】
1.
2.
3.
```

---

## 17. 你每天只需要回答这 3 个问题

1. 今天有没有直接提升稳定性或商家经营结果？
2. 今天做的事能不能量化验证？
3. 今天做的事能不能复制到下一家门店？

三个都是“是”，你就在正确方向上。

---

## 18. 附录：关键命令总表

```powershell
# 1) 启动 LAN 服务器 (默认读取 MealQuestServer/.env)
.\scripts\start-server-lan.ps1

# 2) 商户端在线模式 (默认读取 MealQuestMerchant/.env)
.\scripts\start-merchant-app.ps1 -Platform android

# 3) 顾客端在线模式 (默认读取 meal-quest-customer/.env.development)
.\scripts\start-customer-weapp.ps1

# 4) 全量回归门禁
node .\scripts\release-local.js

# 5) 服务端单独测试
cd .\MealQuestServer
npm test

# 6) 商户端 release APK / AAB
.\scripts\build-merchant-android.ps1 -BuildType release -Artifact apk -AndroidSdkPath 'D:\AndroidDev\sdk' -Clean
.\scripts\build-merchant-android.ps1 -BuildType release -Artifact aab -AndroidSdkPath 'D:\AndroidDev\sdk'

# 7) 商户端 release 真机安装与冒烟
.\scripts\verify-merchant-android-release.ps1 -ApkPath '.\MealQuestMerchant\android\app\build\outputs\apk\release\app-release.apk'
```

---

## 19. 你现在立刻该做什么

1. 按第 8 章命令跑起三端。
2. 按第 11 章跑双角色验收。
3. 按第 12 章开始记录指标。
4. 一周后按第 16 章输出复盘。

完成这 4 步，你就不是“在试系统”，而是在“推进可上线业务”。


