# CPSS LAB 0.4.0 — 紧凑阅读、章节练习与错题集

## Windows 下载与启动

1. 登录 GitHub，[点击下载完整 0.4.0](https://github.com/captian-feng/CPSS-LAB-Private/archive/refs/tags/cpss-lab-v0.4.0.zip)。也可在仓库首页点击绿色 **Code → Download ZIP** 获取当前最新版。
2. 将仓库 ZIP **全部解压**。
3. 进入 `Delivery`，双击 **`Merge-Download.cmd`**（不是 `.ps1`）。自动合并 4 个分卷、校验并解压软件。
4. 等待 `SUCCESS`，在自动打开的文件夹里运行 **`CPSS LAB.exe`**。若未打开，手动进入 `Delivery/CPSS-LAB-0.4.0/`。

## 本次修改

- 页码、翻页、比例与笔记等合并到紧凑工具栏，默认顶部两行，正文空间增大。
- 功能导航、目录及学习记录可收起，边缘支持鼠标拖动调宽并保存；分隔条支持方向键微调。题目列表也可拖动调宽。
- **Ctrl＋滚轮**仅缩放 PDF，点击比例可恢复 100%。
- 首批 **62 道 AI 辅助自编单选题**，覆盖全部 **31 章**，分“核心必会”“重点应用”，可按章节、优先级和知识点搜索。
- 每题四选一，提交后显示逐项解析、英文原文摘录与 PDF 跳转。题目非官方真题，学习优先级不是官方考试权重；首批不是全书穷尽题库或完整模拟考试。
- 答错自动进入错题集；重做答对后进入已掌握，历史仍保留。全部离线，无需模型 API 或联网。

## 旧资料与更新

关闭旧版并导出 JSON 备份，再运行完整解压的新版本。appId 和个人资料目录不变，不删除已有笔记与进度。新版本的 JSON 备份包含答题记录，兼容旧备份；请使用 0.4.0 或更新版本备份/恢复题库进度。

教材与题库仅保存于本私有仓库。发行包不含个人学习记录。

## 验证和维护

20 项单元/集成测试、Linux Electron 桌面 E2E 与真实教材 E2E 通过，含 Ctrl＋滚轮、拖动及宽度重启保留、62 条原文引用核验、错题重做与重启、JSON 恢复。Windows 包已交叉构建并校验 ZIP/ASAR，尚未在 Windows 实机执行。

完整开发项目位于 `Source/`。交接见 `Source/docs/handoff.md`，本次范围及题目来源见 `Source/docs/release-0.4.0.md`。

旧版仍可下载：[0.3.0](https://github.com/captian-feng/CPSS-LAB-Private/archive/refs/tags/cpss-lab-v0.3.0.zip)、[0.2.0 完整归档](https://github.com/captian-feng/CPSS-LAB-Private/archive/refs/tags/cpss-lab-full-v0.2.0.zip)。原公开仓库未接收本次更新。
