# csTimer fork 项目分析

记录时间：2026-07-08

本文档用于记录 fork 初始状态、项目结构、构建方式和后续定制建议。目标是在开始修改前先明确哪些文件适合改、哪些文件容易和上游冲突，以及如何长期同步原仓库更新。

## 当前 Git 状态

当前 remote 配置：

```bash
origin   git@github.com:Kojima648/cstimer.git
upstream git@github.com:cs0x7f/cstimer.git
```

用途：

- `origin` 是自己的 fork，用来推送个人改动。
- `upstream` 是原始仓库，用来拉取上游更新。
- `upstream` 的 push URL 已禁用，避免误推原仓库。

当前分支状态：

```bash
master -> origin/master
origin/master 与 upstream/master 当前一致
基线提交：22a6aed move fto to wca events, update i18n
```

建议不要长期直接在 `master` 上做个人定制。推荐创建个人分支：

```bash
git switch -c kojima/custom
```

## 项目性质

这是一个传统 Web 前端项目，不是现代 npm/Vite/React 项目。

主要技术组成：

- 原生 JavaScript
- jQuery 1.8
- PHP 页面模板和语言包注入
- Makefile 构建
- Google Closure Compiler 压缩和检查
- IndexedDB/localStorage 本地数据存储
- Progressive Web App 相关 manifest、service worker 和 cache manifest

源码目录是 `src`，构建输出目录是 `dist`。

## 顶层目录

```text
.
├── .github/          GitHub Actions，当前用于构建并部署 GitHub Pages
├── dist/             构建输出和发布相关文件
├── experiment/       检查、实验或辅助文件
├── lib/              构建依赖，包括 compiler.jar
├── npm_export/       cstimer_module npm 包导出结构
├── src/              主源码
├── Makefile          主构建脚本
└── README.md         上游项目说明
```

注意：`.gitignore` 忽略 `/dist`，但仓库里仍跟踪了一些 `dist` 基础文件和占位文件。不要手工修改编译产物，除非明确要维护发布文件。

## 主要入口

### 页面入口

`src/index.php`

作用：

- 加载 `lang/langDet.php` 判断语言。
- 注入当前语言的 JS 文案和 `scrdata`。
- 加载 CSS。
- 按固定顺序加载大量源码 JS。
- 输出计时器页面的基础 DOM。

开发态源码加载顺序在 `src/index.php` 中维护；构建态源码加载顺序在 `Makefile` 中维护。新增 JS 文件时通常两个地方都要同步。

### 构建入口

`Makefile`

关键目标：

```bash
make all
make local
make module
make check
```

含义：

- `make all`：生成主站构建产物，包括 `dist/js/cstimer.js`、`dist/js/twisty.js`、CSS、语言文件、manifest、service worker。
- `make local`：生成 `dist/local`，供 GitHub Pages 静态部署使用。
- `make module`：生成 `npm_export/cstimer_module.js`。
- `make check`：运行 Closure Compiler checks-only。

GitHub Actions 当前使用：

```bash
mkdir dist/local dist/local/js dist/local/css && make local
```

## 核心模块

### `src/js/kernel.js`

项目核心框架。

主要职责：

- 属性系统：`regProp`、`getProp`、`setProp`
- 事件系统：`regListener`、`pushSignal`
- UI 窗口和按钮：`addWindow`、`addButton`
- 弹窗、布局、主题、快捷键基础能力
- localStorage 中配置的加载、保存、清理

改动风险高。除非需要调整全局机制，否则个人功能应尽量通过注册接口接入，而不是直接重写核心逻辑。

### `src/js/timer.js`

计时器主逻辑。

主要职责：

- 计时状态机
- inspection 逻辑
- 多阶段计时
- LCD 显示
- 时间格式化显示协作
- 与输入模块、虚拟魔方、蓝牙设备等协作

如果要改计时行为，通常会碰到这里，风险中高。

### `src/js/scramble/scramble.js`

打乱系统入口。

核心对象：

```javascript
scrMgr
```

主要接口：

- `scrMgr.reg(...)` 注册打乱生成器
- `scrMgr.scramblers` 保存打乱类型到生成函数的映射
- `scrMgr.getExtra(...)` 获取过滤器、概率、图片生成器等额外信息
- `scrMgr.formatScramble(...)` 展开复合打乱格式

新增打乱类型通常需要：

1. 在某个 `src/js/scramble/*.js` 中注册生成器。
2. 在 `src/lang/*.js` 的 `scrdata` 菜单中加入入口。
3. 如果需要构建，更新 `Makefile` 中的源码列表。
4. 如果开发态要直接跑源码页面，更新 `src/index.php` 的 script 列表。

### `src/lang/*.js`

语言 JS 文件不只是翻译。

它们还定义：

- UI 文案
- 设置项文案
- 工具名称
- `scrdata` 打乱菜单
- `MODULE_NAMES`

因此修改菜单或新增功能文案时，可能需要同步多个语言文件。个人 fork 中为了减少冲突，可以先只维护 `en-us.js` 和自己实际使用的语言，例如 `zh-cn.js`。

### `src/js/stats/stats.js`

成绩和 session 管理核心。

主要职责：

- 成绩列表
- session 切换、保存、删除、导入
- 平均、统计指标
- 成绩表 UI
- 与 `storage` 模块交互

成绩数据结构大致为：

```javascript
[
  [penalty, phaseN, ..., phase1],
  scramble,
  comment,
  timestamp,
  extension
]
```

改动风险中高，尤其涉及数据兼容时要谨慎。

### `src/js/lib/storage.js`

本地存储层。

主要职责：

- 优先使用 IndexedDB 保存 session 成绩。
- 不可用时退回 localStorage。
- 提供 `set`、`get`、`del`、`exportAll`、`importAll` 等接口。

个人定制一般不应直接修改这里，除非目标是改变数据格式或同步策略。

### `src/js/tools/tools.js`

工具面板管理器。

主要职责：

- 管理工具面板数量和位置。
- 管理工具选择下拉菜单。
- 提供 `tools.regTool(...)` 给其他模块注册工具。

新增个人工具时，优先考虑通过 `tools.regTool` 接入。

### `src/js/hardware/*`

蓝牙魔方、Stackmat、GAN Timer、QiYi Timer 等硬件接入。

这部分依赖浏览器 Web Bluetooth、音频输入或设备协议。改动前要确认目标浏览器和 HTTPS 环境。

### `src/js/twisty/*`

虚拟魔方和可视化相关逻辑。

`Makefile` 会单独构建：

```text
dist/js/twisty.js
```

涉及 3D/可视化时要同时考虑 `twisty` 构建列表。

## 构建和本地环境

仓库自带 Closure Compiler：

```text
lib/compiler.jar
```

当前机器已确认：

- Java 可用，`compiler.jar` 能启动。
- Node/npm 可用。
- `php` 当前不可用。
- `make` 当前不可用。

因此现在可以做源码分析和部分 JS 检查准备，但不能直接完整执行 `make local`。

要完整本地构建，建议补齐：

- Git Bash/MSYS2/WSL 中的 `make`
- PHP CLI
- Java 11 或更高版本

上游 CI 使用 Java 11 和 PHP 8.0。

## 适合个人 fork 的改造策略

优先采用低冲突方式：

1. 新增独立 JS 文件承载个人功能。
2. 使用现有注册机制接入，例如 `kernel.regProp`、`kernel.regListener`、`tools.regTool`、`scrMgr.reg`。
3. 少改 `kernel.js`、`stats.js`、大语言包和构建产物。
4. 如果需要新增文件，同时更新 `src/index.php` 和 `Makefile`。
5. 不手工编辑 `dist/js/cstimer.js`、`dist/js/twisty.js`、`npm_export/cstimer_module.js` 这类生成物。

推荐个人功能放置方式：

```text
src/js/custom/
```

例如：

```text
src/js/custom/kojima.js
```

然后在 `src/index.php` 和 `Makefile` 的 `timerSrc` 中加入它。

这样上游同步时，冲突通常集中在少数接入点。

## 长期同步工作流

推荐个人分支：

```bash
git switch -c kojima/custom
```

日常提交：

```bash
git add .
git commit -m "customize cstimer"
git push -u origin kojima/custom
```

同步上游：

```bash
git fetch upstream
git switch kojima/custom
git rebase upstream/master
git push --force-with-lease origin kojima/custom
```

如果维护 `master` 与上游一致：

```bash
git switch master
git fetch upstream
git merge --ff-only upstream/master
git push origin master
```

然后再把个人分支 rebase 到最新 master 或 upstream/master。

## 高风险文件

以下文件改动时更容易和上游冲突：

- `src/js/kernel.js`
- `src/js/stats/stats.js`
- `src/js/scramble/scramble.js`
- `src/lang/*.js`
- `src/lang/*.php`
- `Makefile`
- `src/index.php`

其中 `Makefile` 和 `src/index.php` 虽然只是接入点，但新增 JS 文件时很可能需要改。建议每次只做最小改动。

## 后续开始修改前的建议

1. 先创建个人分支。
2. 明确第一项定制目标。
3. 优先判断能否通过新增模块实现。
4. 修改后先做源码级检查。
5. 补齐 `make` 和 `php` 后再跑完整构建。
6. 定期同步 `upstream/master`，不要拖太久再 rebase。

