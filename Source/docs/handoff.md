# 0.3.0 阅读界面更新

- 阅读时默认收起左右面板，顶部可独立展开功能导航、目录和学习记录；展开的左侧功能常驻中文标签；应用目录栏改用独立 library-sidebar 类名，消除 PDF.js 同名 sidebar 样式污染。
- 移除 HTML 重排和对照阅读入口、组件及仅用于重排的设置。保留本地提取索引用于全文搜索，以及旧笔记/引用数据；不删数据库或修改 appId/userData。
- 原版 PDF 连续滚动；一次读取页面尺寸元数据以稳定跳转位置，IntersectionObserver 仅挂载邻近页画布。滚动同步页码、目录和阅读位置；目录/页码/搜索/笔记仍可跳转。
- 原 PDF 选字批注正常。历史 HTML 引用记录保留并可跳转到原页；无 PDF 矩形坐标的旧高亮不虚构覆盖位置。
- Windows 更新：关闭旧程序，使用新版完整解压后的 EXE；升级前从设置导出 JSON。资料目录保持不变。
- 16 项原有单元/集成测试；桌面 E2E 已改为 PDF 批注、跨页滚动、1024/1280/1600 布局、备份恢复与重启。真实教材 E2E 检查 1058 页占位、邻近页渲染、末页跳转、缩放和位置保留。
- Windows 实机验证仍需用户本机执行；云端 Electron 测试不等于 Windows 实测。

以下保留旧版历史交接，用于理解实现背景，阅读模式以 0.3.0 为准。

# 下一模型交接

## 最新状态：0.2.0 教材预置版

本节替代下文 0.1.0 时的外部阻塞描述。用户随后上传了 13,131,026 字节的压缩 PDF，已成功读取，实际 1,058 页、7 Part、31 Chapter、195 目录节点。用户明确要求整合为开箱即用；已制作单独的教材预置发行包，源码与通用版仍不含教材。

见 `docs/textbook-ready.md`。私有种子位于 `.local/textbook-ready`，不可加入 Git 或源码归档。初始化只合并教材，保留用户笔记和偏好。源码新增只读种子校验、事务合并与专用构建配置；JPEG2000、本页裁剪误识别和单栏混合字体丢字问题已修复。

最新验证：16 项单元/集成测试、通用桌面 E2E、真实教材预置 E2E 通过。31 个章首自动比对通过；全文数量覆盖与非页脚图片区域覆盖已统计，不能代替逐页人工核对。Windows 实机运行仍未验收，未压缩原件未获取，无法比较压缩前后视觉质量。

复现：`npm run build` → `node out/main/prepareBook.js <用户PDF> .local/textbook-ready` → `npm run test:textbook` → `npm run dist:win:textbook`。源码归档显式排除教材、用户数据库、种子与发行产物。后续重点应是 Windows 实机验证及复杂图表逐页质量审查。

## 以下是 0.1.0 历史交接

当前版本是可运行的早期桌面试用版，非全书转换验收完成的正式产品。仓库仍在用户当前 `work` 分支，未提交/推送，不创建 worktree。

请先读取 README、architecture.md、data-model.md、ipc-contracts.md、acceptance-matrix.md 与原始计划 implementation-plan.md。原始计划中的“未开始开发”只是制定计划时的历史状态，以本交接为准。

## 已实现

实际 Electron 桌面工程、本地 SQLite/FTS5、后台导入和检查点、受管 PDF 副本、目录层级、三模式阅读、原书文字层、矢量图区域、四色高亮、下划线、笔记/书签 CRUD、阅读恢复、章节状态、真实搜索、JSON/Markdown 导出、备份校验与原子恢复、基本知识卡片、学习任务和重点/到期复习视图、浅深主题、字号/行距/宽度和沉浸模式。题库与双语是扩展数据表，界面未实现。

## 外部阻塞

用户已上传 `NSCA's Essentials of Sport Science.pdf`，但 download_file 明确拒绝：文件超过 executor transfer limit 32 MiB。这不是 PDF 解析失败，也不是没有收到上传信息。不要未经新状态变化重复下载同一文件。

可请用户使用 7-Zip 将原 PDF 压缩为每卷不超过 30 MiB 的分卷包，并上传全部分卷；本地重组得到完整原文件后验证 SHA-256 再进行原书测试。不要仅拆章节后伪称完整原 PDF 目录已通过，因为拆页可能丢失书签和页标签。

当前没有 Windows 系统，Windows 运行验收需要用户本机或经授权 runner。没有推送仓库、上传教材或触发 CI。

## 技术注意

- Electron utilityProcess 不适合当前 PDF.js Node 识别，已经通过实测改为 worker_threads，不要无证据改回。
- SQLite 使用 Electron Node 自带 node:sqlite，避免引入不必要的 better-sqlite3 ABI 问题。
- Electron 44 二进制可能需显式 `npx install-electron --no`。代理环境用 Node 的环境代理支持并保留 TLS/校验。
- 构建缓存写到 workspace/XDG_CACHE_HOME，避免只读 HOME。Windows 交叉构建单独安装 win32 的 @napi-rs/canvas 可选二进制。
- 不要清除用户资料来“修复”测试。测试各自使用临时目录；`.local/` 和 `release/` 是生成物。
- 无显示服务器时，Electron 测试使用 `--headless --ozone-platform=headless`；测试所需 `--no-sandbox` 不用于最终用户运行。

## 优先后续工作

1. 获得可传输的完整教材，先做代表页质量审查，修复真实暴露的布局、字体和图表问题。
2. 核对 7 Part/31 Chapter/Section，区分 PDF 索引、界面页码和印刷页标签；不要发明章节页码。
3. 增加低置信度内容的人工校正工具、跨页段落整合、稳定修订迁移、表格语义化；这些没有因通用样例通过而完成。
4. 在 Windows 10/11 实机验证实际发行文件，完成安装、重启、断网、升级/卸载保留和完整备份的检查。
5. 继续更新覆盖报告，保留已测与未测边界；未解决这两个外部阻塞前不能宣称完成最终验收。
