# 参考资料：多智能体协作编排

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[AutoGen 稳定版文档](https://microsoft.github.io/autogen/stable/)** — 微软开源的多 Agent 框架官方文档。本章讲的 GroupChat、GroupChatManager、终止条件与团队抽象都在这里。
- **[AutoGen AgentChat 用户指南](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/index.html)** — `AssistantAgent`、`UserProxyAgent` 与消息传递的用法。本章"群聊管理器必须独立成一个角色"那段讨论，对应文档里终止条件与选说话者的机制。
- **[A2A 协议](https://a2a-protocol.org/)** — Agent 之间的横向互联协议。本章虽以 AutoGen 为主线，但多 Agent 产物要对外暴露时走的是这条协议，第八章会展开。

## 规范与论文

- ★ **[AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation](https://arxiv.org/abs/2308.08155)** — 本章主线的原始论文，把"可对话的多 Agent"这件事形式化，并给出代码执行与工具调用两条路径的分工。
- ★ **[Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366)** — 用语言反馈替代梯度更新的自我改进循环。本章"反思修正循环"那种编排模式，机制上就是它。
- **[ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)** — 单 Agent 内的推理与行动交替范式，是本章讨论"多 Agent 到底该不该上"的对照基线。
- **[MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework](https://arxiv.org/abs/2308.00352)** — 用标准作业流程（SOP）约束多 Agent 协作。本章"角色分工设计与任务交接协议"里那些纪律，它的组织方式是同一思路。
- **[ChatDev: Communicative Agents for Software Development](https://arxiv.org/abs/2307.07924)** — 把软件开发虚拟成一条对话链的实验系统，本章代码评审与研报写作两个实战可以对照它的分工方式。

## 工具仓库

- ★ **[microsoft/autogen](https://github.com/microsoft/autogen)** — 框架本体。本章提到"AutoGen 0.2 的 GroupChat 与 0.4 的 team 是等价写法、版本差异以官方文档为准"，这个差异在仓库的 examples 目录里能直接看到。