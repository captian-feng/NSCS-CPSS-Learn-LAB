# CPSS LAB 0.5.0 — 桌面批注与 CPSS 2026 题库

## 当前源码进展

`Source/` 包含多教材导入、题库导入、中文检索、手动章节及资料管理的开发中更新。自动出题和 OCR 等功能仍在开发。以下 Delivery 下载包仍为 0.5.0，不包含这些源码更新。源码构建方法见 `Source/README.md`。

## Windows 下载和启动

1. 登录GitHub，[下载完整0.5.0](https://github.com/captian-feng/CPSS-LAB-Private/archive/refs/tags/cpss-lab-v0.5.0.zip)。也可点击绿色 Code → Download ZIP 获取仓库最新版。
2. **先全部解压**到普通文件夹，不要在压缩包内运行脚本。
3. 进入 Delivery，双击 **Merge-Download.cmd**（不是.ps1）。脚本自动合并4个分卷、校验并解压。
4. 看到SUCCESS后，在自动打开的文件夹运行 **CPSS LAB.exe**。或手动打开 Delivery/CPSS-LAB-0.5.0/。

不需要旧版文件。请完整保留程序同目录的resources等文件。升级前关闭旧版并导出JSON备份；个人资料目录和appId不变。

## 阅读交互

参考Zotero的三栏阅读逻辑：教材标签页、左侧目录/批注切换、批注按颜色与页码筛选排序、点击批注定位原页高亮区域、右侧直接编辑并保存笔记。保留紧凑工具栏、Ctrl＋滚轮缩放、连续滚动、可收起/拖动调宽的面板。

Ctrl＋F搜索原文；Ctrl＋Shift＋A打开批注。切换教材时不会把异步保存结果显示到另一教材。

## 题库和覆盖

**215道自编题，31章，24项新版大纲任务映射**。包括44基础、25计算、116案例、30研究判断条目；其中9组共享案例包含27个子题（6组运动员案例、3组研究评读）。每章至少6题。

根据2026-07-01生效的[NSCA官方CPSS大纲](https://www.nsca.com/globalassets/certification/cpss/nsca-cpss-dco-2026.pdf)整理，参考CSCS公开说明中的基础/应用题组织方式，未复制官方或商业题库内容。案例数据为教学构造。

支持章节、领域、任务、题型及重要程度筛选；可查看任务覆盖表及作答进度。每题有逐项解析、英文教材依据和页码跳转；错题自动收录，重做和历史记录保留。

本库为离线自编练习，非官方真题。任务有映射不等于穷尽全部考点或经过独立专家审定；各任务覆盖深度不同，在大纲覆盖表和 Source/docs/coverage-0.5.0.md 中明确列出。不是按官方比例组装的完整模拟卷。

## 数据和维护

原0.4的62题ID、正确答案和选项含义保持兼容，旧笔记、练习历史及错题继续保留。JSON备份仍可恢复旧记录。教材仅保存于本私有仓库，发行包不含个人学习数据。

Source/是完整开发工程。交接见Source/docs/handoff.md；本次说明见Source/docs/release-0.5.0.md；题库审计见Source/docs/question-audit-0.5.json。

22项单元/集成测试、2项桌面E2E及真实教材E2E通过；215条原文引用自动校验；Windows ZIP及打包代码一致性已核对。Windows包为交叉构建，实机运行仍需用户本机验证。

旧版下载：[0.4.0](https://github.com/captian-feng/CPSS-LAB-Private/archive/refs/tags/cpss-lab-v0.4.0.zip)、[0.3.0](https://github.com/captian-feng/CPSS-LAB-Private/archive/refs/tags/cpss-lab-v0.3.0.zip)。原公开仓库未接收本次更新。
