# CPSS LAB 0.3.0 — 原版 PDF 连续阅读

## 下载和启动（Windows）

1. 登录 GitHub，点击绿色 **Code → Download ZIP**，或[点击直接下载](https://github.com/captian-feng/CPSS-LAB-Private/archive/refs/heads/main.zip)。
2. 将下载的仓库 ZIP **全部解压**。
3. 打开 `Delivery`，双击 **`Merge-Download.cmd`**（不要双击 `.ps1`）。脚本自动合并 4 个分卷、验证 SHA-256、解压软件。
4. 等待 `SUCCESS`，在自动打开的文件夹中双击 **`CPSS LAB.exe`**。

如果没有自动打开文件夹，进入 `Delivery/CPSS-LAB-0.3.0/` 运行 EXE。必须完整保留同目录的 resources 等文件。

## 本次修改

- 阅读默认收起左侧功能导航、目录和右侧记录，把主要空间交给原版 PDF。
- 顶部“功能导航”“目录”“学习记录”可分别展开/收起；展开的功能按钮显示中文名称。
- 移除 HTML 重排和对照阅读，只保留原版 PDF；支持直接向下滚到下一页。
- 修复 PDF.js 同名侧栏样式导致的目录与正文重叠；保留目录、搜索、缩放、原书高亮、笔记与阅读位置。

## 更新与资料

更新前关闭旧版，并在旧版设置中导出 JSON 备份。新版保持原有 appId 和资料目录，不删除笔记、进度或偏好。旧 HTML 引用仍保留并可跳转来源页；无 PDF 坐标的旧高亮只保留在记录中。

包含用户提供的预置教材，仅在本私有仓库保存。个人资料不包含在发行包内。

Windows 包已交叉构建及 ZIP/ASAR 校验，尚未在 Windows 实机运行；Linux Electron 的 16 项单元/集成测试、桌面 E2E 与真实教材 E2E 已通过。

## 开发维护

`Source/` 是可直接维护的完整项目：进入该目录执行 `npm ci`、`npm run check`、`npm run test:e2e`。详细交接见 `Source/docs/handoff.md`。原公开仓库未接收本次更新，后续请维护本私有仓库。

旧版完整交付保留在 [0.2.0 归档](https://github.com/captian-feng/CPSS-LAB-Private/archive/refs/tags/cpss-lab-full-v0.2.0.zip)。
