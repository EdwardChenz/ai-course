# 参考资料：跨 Agent 协议互联

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[A2A 协议（Agent2Agent）](https://a2a-protocol.org/latest/)** — Agent 之间横向互联的协议官方站点。本章"把 Agent 当成有身份证、有能力清单、接受结构化委托的远端服务"这个定位，原文在这里。
- ★ **[A2A 规范](https://a2a-protocol.org/latest/specification/)** — 任务对象的状态机、能力卡片字段、委托请求与状态同步的规范原文。本章那套"202 返回 task_id、随后轮询状态"的交互，以这份规范为准。
- **[Model Context Protocol](https://modelcontextprotocol.io/)** — 本章反复拿来对照的纵向协议。MCP 向下管工具、A2A 向右管同侪，两者不是竞争关系，方向搞错后面全部白做。
- **[OpenAI Agents SDK](https://openai.github.io/openai-agents-python/)** — 编排器侧的执行框架，工具循环与 `handoffs` 交接机制。本章"把一个 SDK 内的 Agent 包装成 A2A 端点"的骨架，起点在这里。
- **[LangChain 多 Agent](https://docs.langchain.com/oss/python/langchain/multi-agent)** — LCEL 链与 agent 包装成对外服务时的适配思路，本章跨框架互联的适配层设计参考它。

## 规范与论文

- ★ **[AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation](https://arxiv.org/abs/2308.08155)** — 多 Agent 作为独立主体互相协作的框架论文，本章"MCP 与 A2A 信任模型不同：纵向是下属、横向是同侪"这个判断的对照来源。
- **[ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)** — 单体 Agent 的推理-行动范式。判断"这个需求该不该上 A2A"时，它代表协议开销为零的那种极端情形。

## 工具仓库

- **[a2aproject/A2A](https://github.com/a2aproject/A2A)** — A2A 协议本体仓库与示例；本章能力卡片字段、状态机取值和任务委托示例都能在这里对上。
- **[openai/openai-agents-python](https://github.com/openai/openai-agents-python)** — Agents SDK 源码；本章强调"`handoffs` 与 A2A 委托不要混用"，看它交接的实现最直接。
- **[google/adk-python](https://github.com/google/adk-python)** — 另一套多 Agent 开发框架，本章"同一个需求在不同框架里落到不同路由"的讨论可以拿它做对照。