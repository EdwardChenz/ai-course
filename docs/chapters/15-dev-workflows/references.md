# 参考资料：AI 辅助开发工作流

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[Claude Code 文档](https://docs.anthropic.com/en/docs/claude-code/overview)** — Agentic 编码代理的官方文档。本章"补全 2 条、代理 3 条、重构 1 条"三种形态的边界，以及代理在什么场合该停下问人，从这里确认。
- **[Claude Code（code.claude.com 文档站）](https://code.claude.com/docs/en/overview)** — 同一产品的另一文档入口；本章讲的 `SKILL.md` 入口文件与渐进式披露结构，细节在这一版文档里更新得更快。
- **[GitHub Actions 快速上手](https://docs.github.com/en/actions/quickstart)** — CI 工作流的基础配置。本章"会红会失败的约定就进工程约束"那条判断，落点就是这里的 workflow 与 required check。
- **[pre-commit 官网](https://pre-commit.com/)** — 提交前钩子框架。本章"约定的强度决定产出稳定性"的工程化实现方式，以及钩子的运行模型与性能取舍。

## 规范与论文

- ★ **[Evaluating Large Language Models Trained on Code（HumanEval）](https://arxiv.org/abs/2107.03374)** — 首个被广泛采用的代码生成评测基准。本章"完成判据机器化"这套思路的起点：机器判据必须可自动跑，而这篇给的就是这类判据的范式。
- **[ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)** — 代理循环的原始范式。本章"代理 3 条"形态的工作方式，就是推理与工具行动交替执行。
- **[Agentless](https://arxiv.org/abs/2407.01489)** — 反例参照：一种刻意不写代理、只用定位—修复两阶段的软件工程方案。本章"别为了形态选错损失审查时间"的判断，用这篇做对照最有力。

## 工具仓库

- **[anthropics/claude-code](https://github.com/anthropics/claude-code)** — 代理本体。本章"`SKILL.md` + frontmatter + `references/`"这套 Skill 目录结构，就是这个仓库的组织方式。
- **[pre-commit/pre-commit](https://github.com/pre-commit/pre-commit)** — 钩子框架源码；想自定义本章讲的"硬约束"写法，这里是实现入口。