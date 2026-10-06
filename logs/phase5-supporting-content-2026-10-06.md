# Session Log — Phase 5 辅助内容（quiz / references / FAQ） — 2026-10-06

**Skills:** quiz-generator v0.5、faq-generator、reference-generator
**Mode:** 3 个 agent 并行（每个负责一类内容，写入互不重叠的文件），主会话统一复核。

## 交付

| 内容 | 规模 | 位置 |
|---|---|---|
| 章后测验 | 16 章 × 10 题 = **160 题** | `docs/chapters/NN-xxx/quiz.md` |
| 参考文献 | 16 份，**153 个唯一 URL / 39 个域名** | `docs/chapters/NN-xxx/references.md` |
| 全书 FAQ | **36 题**（6 组 × 6） | `docs/faq.md` |

## 主会话独立复核（未采信 agent 自报）

### 测验（脚本逐章校验）
- 16 章全部：题数 10、`upper-alpha` div 10、`??? question` 10、选项 40
- 答案分布：每章 A/B/C/D 各 2-3 题，无字母超 4 次
- 160 个 `Concept Tested` 概念名**逐字命中**该章 Concepts Covered 表，0 例不匹配
- 160 个 `**See:**` 链接**全部指向存在的文件**，0 例死链
- 问题章节数：**0**

### 参考文献（重点验证 URL 真实性）
agent 声称"153 个 URL 逐条 curl 校验 200"，我先修正自己的提取正则（首版因 `-` 开头行被行首锚点干扰，
只提取到 8 个），重测确认：**总 168 处链接 / 153 个唯一 URL / 39 个域名**，
全部为权威技术站点（arxiv 38、github 36、docs.langchain.com 9、platform.openai.com 8、
neo4j 7、supabase 7、docs.vllm.ai 4 等）。
**亲自抽查 7 个 URL，7/7 返回 200**：arxiv.org/abs/1706.03762、docs.python.org/3/library/asyncio.html、
fastapi.tiangolo.com/advanced/stream-data/、modelcontextprotocol.io、a2a-protocol.org、
docs.vllm.ai、github.com/langfuse/langfuse。

agent 主动删掉了 10 余条无法确证的条目（OpenAI chat API 403 页、Silero VAD 论文、
docs.confident-ai.com、docs.dagster.io 分页、A2A 镜像、RunningHub/Seedance/Minimax 官方文档等），
宁可少列不给错链接——这个取舍是对的。

### FAQ
- 36 题，14,040 字，2 处墨墨 admonition
- 70 个内链**全部有效**（脚本核对文件系统）
- 英文整句残留 0（首版脚本误报了 2 行，实为吉祥物图片语法）

## nav 改造（按 mkdocs-nav-editing 规范）

章节 nav 重写为嵌套结构，主页面 label 用 `Content`，子页 `Quiz` / `Annotated References`：

```yaml
- 开发基础与工程规范:
    - Content: chapters/01-dev-foundations/index.md
    - Quiz: chapters/01-dev-foundations/quiz.md
    - Annotated References: chapters/01-dev-foundations/references.md
```

- 章节 label 去掉 `01.` 数字前缀（规范：侧边栏窄，只写数字或标题）
- 新增 `FAQ: faq.md`（License 前）
- **全站页面 100% 进入 nav**（构建的 "not included" 清单已清零）

## 踩到的坑（已修）

1. **exclude_docs 的行内注释无效**：`exclude_docs: |` 是 YAML 块标量，`#` 会被当字面文本，
   导致 `BUILDING-SIMS.md   # 注释` 匹配不到任何文件。注释必须单独占一行放在块首。
2. exclude 路径是相对 `docs/` 的（与之前 character-sheet 同一个坑，第二次踩）。

## 视觉验证

Playwright 实测：
- 测验页：10 个 `h4` 题目、A/B/C/D 大写选项、绿色可折叠 "Show Answer" 块、
  解析含"为什么其他选项错"、侧边栏 Quiz/References 正常展开
- FAQ 页：36 题、墨墨 admonition 正常加载

## book-metrics 更新

| 指标 | 变化 |
|---|---|
| Chapter Quizzes | 0/16 → **16/16（160 题）** |
| Chapter References | 0/16 → **16/16** |
| FAQs | 0 → **36** |
| Glossary Terms | 0 → **290**（上一轮） |
| Total Words | 53,775 → **81,291** |

注：Chapter References 一栏显示 "0 references total"，是 book-metrics 脚本只识别特定
reference 格式所致；实际每份 references.md 有 8-12 条、共 153 个已验证 URL。

## 需要作者裁决的正文矛盾（子 agent 发现，尚未改数据）

1. **第 11 章**："这 34 道里的 29 道（检索与重排问题）"——但 15+11=26，29 实为 34−5（含压缩层）。
2. **第 14 章 vs 第 16 章**：盈亏平衡调用量一处写"日均 27,313 次"，一处写"27,300 次"。

## Phase 5 已全部完成

glossary（290 条）、FAQ（36 题）、quiz（160 题）、references（16 份）齐备。
