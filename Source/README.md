# CPSS LAB — Sport Science Learning Platform

中文界面的 Windows 离线教材阅读与学习工具。通用版首次选择自己的英文 PDF，应用复制到受管资料目录，后续阅读不需要原始文件或网络。

当前版本：0.4.0，早期试用版。新增单独的教材预置版：包含本次用户上传的压缩 PDF 和预建全文索引，首次启动自动初始化到本机资料目录，直接打开第 1 章，无需选择文件或等待全书转换。源码包与通用版均不含教材。预置版说明与实测范围见 [教材预置说明](docs/textbook-ready.md)。

## 安装与使用

- 安装版：运行 `CPSS-LAB-Windows-Setup.exe`，按向导安装。
- 便携版：完整解压 `CPSS-LAB-Windows-Portable.zip`，双击目录中的 `CPSS LAB.exe`；不要只从压缩包拖出 EXE。
- 教材预置版：完整解压 `CPSS-LAB-Windows-Textbook-Ready.zip`，双击 `CPSS LAB.exe`，首次启动即进入教材第 1 章。预置文件放在 resources/bundled-library，个人笔记写入 userData，不写回发行包。
- 首次启动选择“导入英文教材 PDF”；导入进度按已提交页面显示，支持暂停、重启后继续。
- 进入教材默认收起两侧面板，正文优先。顶部“功能导航”“目录”“学习记录”分别控制三栏；展开的功能导航常驻中文名称。只使用原版 PDF 连续滚动阅读，目录、页码与搜索可跳转。
- 选中 PDF 文字添加四色高亮、下划线、引用笔记、知识卡片；右侧记录菜单可以编辑和删除。
- 顶部紧凑工具栏整合页码与缩放；Ctrl＋滚轮缩放 PDF，侧栏边缘可拖动调宽并保存。
- 练习题库包含覆盖 31 章的首批 62 道自编单选题，按核心/重点分类，提供逐项解析和原文跳转，答错自动收录并支持重做。题目非官方真题，详见 [0.4.0 说明](docs/release-0.4.0.md)。
- 侧栏提供全文搜索、仪表盘、知识卡片、基本学习任务和复习中心。
- 设置中导出 JSON 或 Markdown，或恢复 JSON 学习资料。JSON 默认不包含教材，换电脑后需要再次导入内容完全相同的 PDF。

应用不上传教材，不需要 API Key。Windows 包若未签名，系统可能显示未知发布者提示；请对照交付的 SHA-256 清单确认文件。当前交付签名与实机验证状态见验收记录。

## 数据与保留

Windows 默认资料目录：`%APPDATA%/CPSS LAB/`（实际路径由 Electron `app.getPath('userData')` 决定），可在设置中打开。

便携版同样把资料放在用户目录，解压/更新软件不覆盖学习记录。卸载配置保留资料，但这不能替代独立备份。不要在应用运行时只复制 `library.sqlite` 而漏掉 WAL 文件。使用内置 JSON 导出保存学习记录；需要完整书库备份时，先完全退出应用，再复制整个资料目录。

## 开发与构建

建议 Node 24 LTS 与 npm 11，版本以锁文件和 CI/本地记录为准。

```sh
npm ci
npx install-electron --no
npm run dev
```

Electron 44 的 npm 包使用显式/首次运行下载二进制。代理环境请使用平台提供的代理和信任配置；Node 24 可通过 `NODE_USE_ENV_PROXY=1` 使用代理，不能禁用 TLS/校验。

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run dist:win          # 在 Windows x64 构建
npm run dist:win:cross    # Linux 交叉构建；不能替代 Windows 实机验收
npm run package:source
```

本地准备和构建教材预置版（PDF 不进入 Git）：

```sh
npm run build
node out/main/prepareBook.js "path/to/your-textbook.pdf" .local/textbook-ready
npm run test:textbook
npm run dist:win:textbook
```

只对自己明确选择的教材制作预置发行包。生成的种子库必须不含个人记录；准备脚本与启动校验都会检查。初始化按教材摘要合并内容，已有笔记、进度和偏好保留。Windows 实机启动验收仍未执行。

`predev` / `prebuild` 自动准备本地 PDF 字体、CMaps 和 WASM。最终用户无需 Node、Python 或在线下载运行依赖。

Windows 测试默认使用真实窗口；无显示服务器的 Linux 测试使用 Chromium headless。不要在面向用户的 Windows 启动脚本中添加测试用的 `--no-sandbox`。

## 已知边界

- 自动 PDF 结构化是启发式转换，不能保证任意教材的读序、图表区域和标题层级都正确。导入完成不等于人工核验。
- 已导入本次压缩版的实际 1,058 页，提取 7 Part/31 Chapter/195 目录节点；这不等于全书所有排版和图片已经逐页人工核对。未获取未压缩原件，不能验证压缩前后的视觉质量是否一致。
- 扫描页未提供 OCR；保留原书查看。复杂表格与公式主要以局部原书图像显示，尚未实现通用语义表格/公式重建。
- 英文批注保留版本和文本锚点；跨转换器修订的自动迁移尚未实现，不应删除已导入数据强制重转。
- 题库、答题记录和双语关系已有独立数据结构；题库导入/考试界面、中文导入和双语切换尚未实现。
- 当前学习计划和复习中心是手动任务/重点/日期管理，没有声称实现间隔重复算法。

请以 [验收记录](docs/acceptance-matrix.md) 中的已测范围为准。
