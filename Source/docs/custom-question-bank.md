# 自编教材题库导入

完成教材 PDF 导入后，在该教材的「练习题库」页面可以看到教材 SHA-256 和「导入题库 JSON」按钮。将页面上的完整 SHA-256 填入下方的 `sourceHash`，再将 UTF-8 编码 JSON 文件导入。

```json
{
  "format": "cpss-lab-question-bank",
  "schemaVersion": 1,
  "sourceHash": "替换为当前教材页面显示的64位SHA-256",
  "title": "第一章练习",
  "version": "1",
  "questions": [
    {
      "id": "chapter1-question1",
      "chapter": 1,
      "chapterTitle": "第一章",
      "topic": "知识点",
      "prompt": "题目内容？",
      "options": [
        {"text": "选项A", "explanation": "A的解析"},
        {"text": "选项B", "explanation": "B的解析"},
        {"text": "选项C", "explanation": "C的解析"},
        {"text": "选项D", "explanation": "D的解析"}
      ],
      "correct": 0,
      "source": {"page": 0, "quote": "与此题相关的教材摘录"}
    }
  ]
}
```

每题 ID 在题库内唯一。每题四个选项，`correct` 使用 0 至 3，依次对应 A 至 D。`source.page` 使用 PDF 文件页序号，从 0 开始。页面范围和教材指纹由程序检查，摘录和答案的准确性需要查看原文核对。

目前每本教材支持导入一份题库。相同内容可以重复导入，修改题库内容时会提示冲突，以保护旧作答的含义。学习资料 JSON 备份包含已导入题库和答题记录。恢复后重新导入完全相同的 PDF，即可继续使用题库。内置 CPSS 题库继续沿用原有教材和题目。

对于 CPSS 和其他教材，可在草稿中核对原文、答案和解析后，使用「审校并发布」追加自编题。CPSS 原有题目保持不变，自编题保存在本地题库。已发布题目暂不支持修改。

恢复学习资料时，相同教材、题库名称与版本的备份可以合并新增题目。如果相同题号对应的题目内容不一致，恢复会取消并保留现有资料。
