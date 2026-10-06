# Concept Taxonomy

共 13 个分类，290 个概念。任一分类占比均不超过 30%（最大为 RAG 与 REL，各 30 个，占比 10.3%）。

## Engineering Foundations（FOUND，概念 1–24，共 24 个）

Python / FastAPI / Linux / Docker / Git 在 AI 应用中的工程化用法，以及模型调用基础。零依赖的图根基，其它所有分类都直接或间接依赖它。

## Model Access Transition（MACC，概念 25–42，共 18 个）

LangChain 中级到高级的过渡：链式编排、记忆组件、文档切分、Embedding 选型、向量库操作、工具绑定与代理循环。衔接“能调模型”与“能建系统”。

## Retrieval Knowledge Bases（RAG，概念 43–72，共 30 个）

RagFlow 流水线、混合检索、查询改写、上下文压缩、评测集与失败归因、知识库运营。课程的优先深度模块之一。

## GraphRAG Hybrid Retrieval（GRAPH，概念 73–96，共 24 个）

Neo4j 图谱建模、实体关系抽取、社区发现、图谱与向量融合、多跳推理。依赖 RAG 的技术概念（43–62）。

## MCP Tool Delivery（MCP，概念 97–118，共 22 个）

MCP 纵向工具观、FastMCP 服务搭建、工具 Schema / 鉴权 / 版本 / 熔断 / 评测。Agent 用工具的交付层。

## Multi Agent Collaboration（MCO，概念 119–144 中除 138 外，共 25 个）

AutoGen 编排、角色分工、任务交接、结果汇总、群聊管理、反思循环、人机协同（含 Herd 多智能体协作思路）。依赖 MCP 工具层。

## Cross Agent Protocols（XAP，概念 145–164，共 20 个）

XAP 横向互联观、能力发现、任务委托、状态同步、跨框架消息、OpenAI Agent SDK。依赖多智能体编排。

## Backend Integration（BACK，概念 165–180，共 16 个）

Supabase 建模、行级安全、会话持久化、pgvector、实时订阅、边缘函数。AI 应用落库层。

## Runtime Reliability（REL，概念 181–210，共 30 个）

Mem0 记忆层、Daytona（优先）/ E2B 沙箱、LangFuse（优先）/ LangSmith 可观测、DeepEval（优先）/ RAGAS 评测、自进化前沿。课程的优先深度模块之一。

## Data Engineering（DATA，概念 211–232，共 22 个）

Temporal（优先）编排持久化、Dagster 资产管理、Polaris + Iceberg 数据湖、Trino 分布式查询与自然语言分析。

## Multimodal Applications（MULTI，概念 233–256，共 24 个）

Realtime 语音、Seedance2.5 / Minimax H3 生成、RunningHub 云任务、ffmpeg 合成链、短剧 / 电商 / 自媒体场景。

## Inference Deployment（DEP，概念 257–272，共 16 个）

vLLM 推理部署、显存估算、LiteLLM 网关路由、故障转移、压测与容量规划。依赖工程基础与可靠性层。

## Workflows Career（WORK，概念 273–290 及 138，共 19 个）

Agentic 编码（含 ORCA 开发范式、Superpowers / Mattpocock / Ponytail / Ecc）、Skill 机制、飞书与 Office CLI 提效、综合项目验收、面试宝典。terminal 收敛层，依赖各实战支柱。
