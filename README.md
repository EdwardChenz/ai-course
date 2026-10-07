# 高级AI大模型应用开发

> 一本面向工程实践的智能教材：从"能调模型"到"能交付可靠 Agent 系统"。

[![build](https://img.shields.io/badge/build-mkdocs--strict-blue)](mkdocs.yml)
[![license](https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-lightgrey)](docs/license.md)
[![chapters](https://img.shields.io/badge/chapters-16-informational)](docs/chapters/index.md)
[![microsims](https://img.shields.io/badge/MicroSims-35-success)](docs/sims/index.md)

## 这本书讲什么

大模型应用开发的重心已经从"单次调用"转向"可靠系统"：检索要混合、工具要规范、Agent 要协作、
运行要可观测、评测要闭环、数据要可编排。本书以可落地的 Agent 系统为主线，把 **RAG/GraphRAG、
MCP、多 Agent 协作、运行时可观测与评测、多模态与企业数据工程**串成一条业务链，
并以"每章小实战 + 两个中大型集成项目"收敛到可交付的作品集。

## 规模

数字取自 `docs/learning-graph/book-metrics.json`（由 Book Metrics v0.09 于 2026-10-07 生成），
可用 `bk-generate-book-metrics` 重新生成核对。

| 指标 | 数值 |
|---|---|
| 概念 | **290**（学习图 DAG，零环） |
| 章节 | **16** |
| 正文 | **81,857 字**（约 353 等效页） |
| 交互式 MicroSim | **35 个**（全部可点击、可作答、可判分） |
| 术语库 | **290 条**（ISO 11179） |
| 章后测验 | **160 题**（16 章 × 10 题，Bloom 分层） |
| 全书 FAQ | **36 题** |
| 参考文献 | **16 份**（含 168 个外链） |
| 公式 | **59 处** |
| 学习吉祥物 | 墨墨（章鱼），7 个姿态 |

## 章节一览

概念数取自每章的"本章覆盖概念"表，MicroSim 数取自该章正文的 iframe 引用。

| # | 章节 | 概念 | MicroSim |
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
| | **合计** | **290** | **35** |

## 本地预览

⚠️ 本机的 `python` 与 `python3` 指向 Microsoft Store 的 WindowsApps 桩，
没有安装 mkdocs。请用 Python 3.11 的绝对路径：

```bash
"C:\Users\Chen\AppData\Local\Programs\Python\Python311\python.exe" -m pip install -r requirements.txt
"C:\Users\Chen\AppData\Local\Programs\Python\Python311\python.exe" -m mkdocs serve
```

然后打开 **http://127.0.0.1:8000/ai-course/** —— `/ai-course/` 这一段来自 `mkdocs.yml`
的 `site_url`，不是笔误。

编辑 `docs/` 下的文件会自动重建并刷新浏览器。若提示 8000 端口被占用，
说明已经有一个 `mkdocs serve` 在跑，直接用那个窗口，或换一个端口：

```bash
"C:\Users\Chen\AppData\Local\Programs\Python\Python311\python.exe" -m mkdocs serve -a 127.0.0.1:8080
```

## 项目结构

```
ai-course/
├── mkdocs.yml                 站点配置与导航（单一事实源）
├── requirements.txt           站点构建依赖
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

`site/` 是构建产物，已在 `.gitignore` 中，不会提交。

### 两处约定

- **机器契约标记保留英文。** `#### Diagram:`（图表标题前缀）与 `??? question`（折叠题型）
  是脚本按前缀匹配的标记，翻译会导致指标统计归零。章节内容里的章节锚点、判据、反馈等
  标签已全部中文化。
- **学习图报告有中英两版。** `*-cn.md` 是发布到网站的中文版；同目录下的英文原稿由
  `bk-generate-book-metrics` 等脚本生成，保留作对照与再生成依据，已在
  `mkdocs.yml` 的 `exclude_docs` 中排除，不发布。

## 构建产物校验

```bash
# 必须退出 0
"C:\Users\Chen\AppData\Local\Programs\Python\Python311\python.exe" -m mkdocs build --strict

# 吉祥物规则校验（BK_HOME 指向 ibook-skills 仓库）
python "$BK_HOME/skills/book-installer/scripts/validate-chapter-mascots.py" docs/chapters/01-dev-foundations/index.md
```

## 已定夺的内容矛盾

开发过程中发现并已修完的 8 处数据矛盾，正文、章后测验与 MicroSim 三处已同步：

| 位置 | 矛盾 | 定夺结果 |
|---|---|---|
| 第 3、6、14 章 | HyDE 召回增益两个口径 | 统一为 76% → 96%，12.7 → 16.0 |
| 第 14、16 章 | 自建/API 盈亏平衡调用量 | 统一为日均 27,313 次 |
| 第 12 章 | 批处理第 4 题批处理量倒挂 | 统一为 2.56 QPS，并修正该题概念错误 |
| 第 7 章 | 任务状态时间线重复扣费 | 统一为 4.5 分（3 次 × 1.5 分） |
| 第 11 章 | "34 道错题里 29 道"与分项求和 15+11 不符 | 改写为 15+11+3=29，三层归因自洽 |

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
| AP 风格新闻稿 | `docs/social/press-release.md` | **需作者填写 6 处 `[TK]` 占位并核定引语** |

两份物料的数字均取自 `docs/learning-graph/book-metrics.json`，未做四舍五入或夸大；
不含销量、学员数、媒体转载或读者好评等未经证实的数据。

## 待作者处理

1. **联系页占位**：`docs/contact.md` 有 3 处 `[TK]` —— 作者邮箱、LinkedIn 主页、GitHub 主页。
2. **新闻稿占位**：`docs/social/press-release.md` 有 6 处 `[TK]` —— 数据行城市、
   媒体邮箱与电话、两处 `[DRAFT QUOTE]` 引语核定。
3. **MicroSim 状态**：`docs/sims/*/index.md` 的 frontmatter `status` 现为 `built`，
   作者逐个操作验证后可改为 `approved`（导航栏圆点会变绿）。
