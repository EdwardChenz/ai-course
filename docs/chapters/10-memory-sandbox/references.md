# 参考资料：记忆层与执行沙箱

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[Mem0 文档](https://docs.mem0.ai/)** — 记忆层产品的官方文档。本章"写入与检索两个方法、元数据过滤决定隔离边界"这套说法以它为准。
- **[Mem0 Python 快速上手](https://docs.mem0.ai/open-source/python-quickstart)** — `add` 与 `search` 的参数、过滤条件写法，本章那两段 `remember` / `recall` 的对照。
- ★ **[Daytona 文档](https://www.daytona.io/docs/)** — AI 代码执行沙箱的官方文档，快照创建、资源配额、网络白名单与生命周期控制。本章"创建 → 执行 → 落审计 → 销毁"四步的每个参数都在这里。
- ★ **[E2B 文档](https://docs.e2b.dev/)** — 本章的对照方案。基于 Firecracker 微型虚拟机的隔离与会话控制，本章那张 Daytona / E2B 对照表的技术差异出自它。

## 规范与论文

- ★ **[MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560)** — 把上下文窗口当虚拟内存、按需换页的架构。本章"短期记忆与长期记忆分层"的思路，以及"窗口管理要自己做、记忆层不替你做"这个边界，都源自它。
- **[Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442)** — 记忆流、检索与反思三段机制的代表性工作。本章记忆检索打分与遗忘机制的设计可以对照它。
- **[LangChain 短期记忆](https://docs.langchain.com/oss/python/langchain/short-term-memory)** — 消息裁剪与摘要窗口化的框架实现，本章"短期记忆设计"一节的对照实现。

## 工具仓库

- **[mem0ai/mem0](https://github.com/mem0ai/mem0)** — 记忆层本体，开源版与托管版两套实现；本章说"版本差异以官方文档为准"，差异就在这个仓库里。
- **[e2b-dev/E2B](https://github.com/e2b-dev/E2B)** — E2B 的 SDK 与运行时；沙箱 API 的实际行为（返回字段、同步还是异步）看这里最准。