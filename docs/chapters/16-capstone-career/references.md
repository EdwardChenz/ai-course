# 参考资料：综合项目与求职准备

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[GitHub 仓库与 README 指南](https://docs.github.com/en/repositories)** — 仓库结构、README 写法与项目描述的最佳实践。本章"可运行的仓库、可读的说明"那两条交付要求，官方的规范以这里为准。
- **[GitHub Actions 快速上手](https://docs.github.com/en/actions/quickstart)** — 把"测试全绿、类型检查无新增错误、lint 无新增告警"变成机器判据的标准做法。本章验收自检清单里的 CI 项，落地在这一页。
- **[开源项目起步指南](https://opensource.guide/starting-a-project/)** — 项目骨架、README、贡献指南与许可证的组成。本章小实战交付清单的条目基本都能在这里找到出处。
- **[Keep a Changelog](https://keepachangelog.com/en/1.0.0/)** — 变更日志的格式约定。本章"可复现的复盘"与"指标对比一栏必须填真实数字"那条规范，用一个统一的变更日志格式就能长期坚持。
- **[Claude Code 文档](https://docs.anthropic.com/en/docs/claude-code/overview)** — 本章两个集成项目都会用到的 Agent 工具面；设计项目 README 与演示脚本时按它的能力写，别承诺做不到的事。
- **[OpenAI 结构化输出](https://platform.openai.com/docs/guides/structured-outputs)** — 项目一里"结构化落库"这条验收项的实现基础；先让它稳定吐合法 JSON，业务校验才有意义。

## 规范与论文

- ★ **[Evaluating Large Language Models Trained on Code（HumanEval）](https://arxiv.org/abs/2107.03374)** — 代码任务的机器判据范式。本章"验收标准要先写、再动手写"，以及面试里被追问指标口径时的答法，都可以拿这篇当"判据可自动化"的依据。

## 工具仓库

- **[donnemartin/system-design-primer](https://github.com/donnemartin/system-design-primer)** — 从缓存策略到负载均衡的系统设计知识点地图。本章"系统设计答题框架（七步）"的延伸阅读首选，面试前拿它自查有没有漏掉容量、缓存与一致性这三块。