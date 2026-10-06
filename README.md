# 高级AI大模型应用开发

> 一本面向工程实践的智能教材：从"能调模型"到"能交付可靠 Agent 系统"。

[![build](https://img.shields.io/badge/build-mkdocs--strict-blue)](mkdocs.yml)
[![license](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-lightgrey)](docs/license.md)

## 这本书讲什么

大模型应用开发的重心已经从"单次调用"转向"可靠系统"：检索要混合、工具要规范、Agent 要协作、
运行要可观测、评测要闭环、数据要可编排。本书以可落地的 Agent 系统为主线，把 **RAG/GraphRAG、
MCP、多 Agent 协作、运行时可观测与评测、多模态与企业数据工程**串成一条业务链，
并以"每章小实战 + 两个中大型集成项目"收敛到可交付的作品集。

## 规模

| 指标 | 数值 |
|---|---|
| 概念 | **290**（学习图 DAG，零环） |
| 章节 | **16** |
| 正文 | **约 8.1 万字**（约 351 等效页） |
| 交互式 MicroSim | **35 个**（全部可点击、可作答、可判分） |
| 术语库 | **290 条**（ISO 11179，平均 98.5/100） |
| 章后测验 | **160 题**（16 章 × 10 题，Bloom 分层） |
| 全书 FAQ | **36 题** |
| 参考文献 | **16 份 / 153 个已验证链接** |
| 公式 | 59 处 |
| 学习吉祥物 | 墨墨（章鱼），7 个姿态 |

## 章节一览

| # | 章节 | 概念 | 交互元素 |
|---|---|---|---|
| 1 | 开发基础与工程规范 | 24 | 2 |
| 2 | 模型接入与进阶过渡 | 18 | 1 |
| 3 | RAG 基础：检索与知识库搭建 | 15 | 3 |
| 4 | RAG 进阶：评测运营与上线 | 15 | 3 |
| 5 | GraphRAG 与混合检索架构 | 24 | 2 |
| 6 | MCP 工具交付 | 22 | 2 |
| 7 | 多智能体协作编排 | 25 | 2 |
| 8 | 跨 Agent 协议互联 | 20 | 2 |
| 9 | AI 应用后端集成 | 16 | 3 |
| 10 | 记忆层与执行沙箱 | 11 | 3 |
| 11 | 可观测性与评测优化 | 19 | 3 |
| 12 | 企业数据工程 | 22 | 3 |
| 13 | 多模态应用开发 | 24 | 2 |
| 14 | 推理服务与部署交付 | 16 | 2 |
| 15 | AI 辅助开发工作流 | 9 | 1 |
| 16 | 综合项目与求职准备 | 10 | 1 |

## 本地预览

```bash
pip install -r requirements.lock
mkdocs serve
# 浏览 http://127.0.0.1:8000/ai-course/
```

## 项目结构

```
ai-course/
├── mkdocs.yml                 站点配置与导航（单一事实源）
├── AGENTS.md / CLAUDE.md      AI agent 规则（CLAUDE.md 仅含 @AGENTS.md）
├── CONTENT-GENERATION-GUIDE.md 内容生成规范（字数预算、反填充、MicroSim、吉祥物）
├── opencode.json              opencode 的 skills 加载配置
├── docs/
│   ├── chapters/              16 章：index.md（正文）+ quiz.md + references.md
│   ├── learning-graph/        概念清单、依赖 DAG、taxonomy、质量与指标报告
│   ├── sims/                  35 个 MicroSim（每个含 main.html + 源码 + metadata.json）
│   ├── glossary.md            290 条术语
│   ├── faq.md                 36 题 FAQ
│   ├── img/mascot/            吉祥物形象与姿态
│   └── css/                   站点样式与吉祥物 admonition 样式
├── logs/                      各阶段 session 日志
└── plugins/social_override.py og:/twitter: 社交卡片钩子
```

## 构建产物校验

```bash
mkdocs build --strict          # 必须退出 0
python "$BK_HOME/skills/book-installer/scripts/validate-chapter-mascots.py" docs/chapters/01-dev-foundations/index.md
```

## 已知的待裁决项

- 第 11 章"34 道错题里 29 道属检索与重排"与分项求和（15+11=26）不符
- 盈亏平衡调用量在第 14 章为 27,300 次、第 16 章为 27,313 次
- 6 处 MicroSim 规格块内部数据矛盾（已在 sim 界面按公式口径实现并标注）

## 致谢与许可

本书的智能教材结构（学习图 → 章节结构 → 内容生成 → 交互式 MicroSim → 评测闭环）
由 [ibook-skills](https://github.com/dmccreary/ibook-skills) 技能链生成。

内容采用 [CC BY-NC-SA 4.0](docs/license.md) 许可，非商业用途免费使用。
文中出现的商标归各自所有者所有；示例中的价格、延迟、吞吐等数值均为教学示意值，
不代表任何厂商的真实指标。

## 宣传物料

| 物料 | 位置 | 状态 |
|---|---|---|
| GitHub README | 本文件 | ✅ 已完成 |
| LinkedIn 发布帖 | `docs/social/linkedin-post.md` | 需补 UTM 与配图 |
| AP 风格新闻稿 | `docs/social/press-release.md` | **需作者填写 `[TK]` 占位并核定引语** |

两份物料的数字均取自 `docs/learning-graph/book-metrics.json`，未做四舍五入或夸大；
不含销量、学员数、媒体转载或读者好评等未经证实的数据。

## 待作者处理

1. **封面图**：`docs/img/cover.png` 仍是脚手架自带的通用占位封面，需用
   `docs/img/cover-image-prompt.md` 的提示词生成正式封面替换。
2. **新闻稿占位符**：数据行城市、媒体邮箱与电话、两处 `[DRAFT QUOTE]` 引语核定。
3. **MicroSim 规格备注**：`sandbox-quota-cost-ledger` 与 `task-handoff-state-timeline`
   各有一条备注说明规格曾存在算术歧义、已按公式口径定夺，发布前可考虑删除。
