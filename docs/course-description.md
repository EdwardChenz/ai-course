---
title: 高级AI大模型应用开发 · 课程描述
description: 高级AI大模型应用开发课程的完整课程描述，包含概览、覆盖主题，以及按 2001 版 Bloom 分类法组织的学习目标
quality_score: 97
---

> **章节对照**：本页小节名已中文化，对应 `course-description-analyzer` 模板的规范英文契约名——课程标题 Title、目标读者 Audience、先修要求 Prerequisites、覆盖主题 Topics / Main Topics Covered、明确不覆盖的主题 Topics Not Covered、课程概览 Course Overview、学习目标 Learning Outcomes。

# 课程描述

## 课程标题

高级AI大模型应用开发（课程大纲 v261002）

## 目标读者

面向具备 Python 后端基础、已完成 LangChain 系列中级课程的开发者与求职者，包括成人继续教育与职业转型学员。读者应能独立写 Python3、调用大模型 API、完成基础的 RAG Demo，本书带读者从“能调模型”走到“能交付可靠 Agent 系统”。

基础/中级部分（Python3+、FastAPI、Linux Shell、Docker、Git、模型接入与 LangChain 中级用法）由线下教学加固与前期教学视频覆盖，本书聚焦高级应用开发与业务集成，不重复讲解零基础语法。

## 先修要求

- Python3+ 开发能力：虚拟环境、包管理、异步编程基础
- FastAPI 基础：路由、请求校验、服务端部署概念
- Linux（Shell）常用命令与日志排查
- Docker 容器基础：构建、运行、环境变量与卷挂载
- Git 基础：分支、提交、协作流程
- 模型接入与 LangChain 系列中级课程：Prompt、Chain、基础 RAG 流程
- 向量检索与数据库基础概念：Embedding、TopK、SQL 基础

## 覆盖主题

本书共 8 大模块，对应课程大纲 v261002 的全部主干：

1. 开发基础与模型接入衔接：Python3+、FastAPI、Linux、Docker、Git 在 AI 应用中的工程化用法，以及从 LangChain 中级到高级的过渡。

2. Agent 应用开发与业务集成：知识库与检索增强（含 RagFlow 技术栈、GraphRAG 与 Neo4j + 向量库混合架构）、MCP（Model Context Protocol，基于 FastMCP 的工具能力交付）、多 Agent 协作编排（角色分工、任务交接与结果汇总，以 AutoGen 多智能体框架为主）、跨 Agent 协议互联（能力发现、任务状态与跨框架通信，覆盖 AutoGen / OpenAI Agent SDK / LangChain）、AI 应用后端集成（以 Supabase 集成 DB 实现快速落地）。关键认知：MCP 负责 Agent 用工具（纵向），A2A 负责 Agent 连 Agent（横向），二者互补。

3. Agent 运行时与可靠性工程：模型 Context 与记忆层（Mem0）、容器运行集成沙箱（Daytona 为优先讲解，E2B 为对照）、可观测性（LangFuse 为优先讲解，LangSmith 为对照）、Agent 评测与反馈优化（评测以 DeepEval 为优先讲解，RAGAS 为对照），以及 LLM 自进化理论前沿选讲（self-evolving / self-improving、RSI 与 recursive self-improvement）。

4. 企业数据分析 Agent 与数据工程：AI 调度编排（含编排持久化，以 Temporal 为优先讲解；编排资产管理 Dagster）、AI 数据湖（Polaris，基于 Iceberg）、AI 分布式查询（Trino）。

5. 多模态应用开发：实时语音技术（OpenAI Realtime API / SDK）、生成技术（Seedance2.5、Minimax H3）、视频（RunningHub 云服务）、合成技术（ffmpeg）、以及短剧 / 电商带货 / 自媒体等落地场景。

6. 模型推理、网关与部署：推理服务（vLLM）、网关（LiteLLM）、部署交付全链路。

7. AI 辅助开发与研发工作流：Agentic 开发辅助（含 ORCA、Herd 多 Agent 协作思路）、开发技能与 Skill 机制（含 superpowers、mattpocock、DietrichGebert/ponytail、affaan-m/ecc 等实践）、提效功能（飞书 lark CLI、office CLI）。

8. 综合项目与求职准备：每个课程章节内容包含小综合实战，整套课程带有 2 个以上中大型集成项目；配套面试辅导、面试宝典与 1 对 1 指导。

其中 Daytona、LangFuse、DeepEval、Temporal 为课程打标优先讲解的工具链，本书给予更深的实战篇幅。

## 明确不覆盖的主题

为控制范围，以下内容明确不纳入本书：

- 大模型预训练与权重微调（Pre-training / SFT / RLHF 原理与训练实操）
- CUDA 内核、量化内核与端侧推理极致优化
- Python / 前端零基础语法教学
- LangChain 中级课程已覆盖的基础 Chain 与基础 RAG 用法（仅做衔接回顾）
- 特定云厂商的计费与合规审计细节（仅在部署章节给出通用 checklist）

## 课程概览

大模型应用开发的重心已经从“单次调用”转向“可靠系统”：检索要混合、工具要规范、Agent 要协作、运行要可观测、评测要闭环、数据要可编排。本课程以可落地的 Agent 系统为主线，把 RAG/GraphRAG、MCP 工具交付、A2A Agent 互联、记忆与沙箱、可观测与评测、调度与数据湖、多模态生成、推理网关全部串成一条业务链，并以小实战 + 中大型集成项目收敛到求职作品集。

学完本书，读者应能独立设计并交付一个带知识库、多 Agent 分工、可观测可评测、后端落库的 Agent 应用，而不是停留在 Notebook 级别的 Demo。

## 学习目标

学完本课程，学生将能够：

### Remember

- 列出 RAG、GraphRAG、MCP、A2A、多 Agent 编排的核心术语与适用边界。
- 说出 Daytona / E2B、LangFuse / LangSmith、DeepEval / RAGAS、Temporal / Dagster、Polaris-Iceberg / Trino 各自解决的问题。
- 回忆 vLLM 与 LiteLLM 在推理服务链中的位置与职责。
- 列举 Mem0 记忆层、Supabase 落库、ffmpeg 合成链的关键配置项。

### Understand

- 解释 GraphRAG 与 Neo4j + 向量库混合架构相比纯向量检索的召回差异。
- 说明 MCP（纵向工具调用）与 A2A（横向 Agent 互联）互补的分工模型。
- 描述多 Agent 协作中的角色分工、任务交接与结果汇总机制。
- 阐释 Daytona 沙箱隔离、LangFuse 追踪、DeepEval 评测三者在可靠性闭环中的关系。

### Apply

- 使用 RagFlow 搭建带混合检索的知识库问答应用并接入业务后端。
- 使用 FastMCP 将内部 API 封装为 MCP 工具并供给 Agent 调用。
- 使用 AutoGen 实现带角色分工的多 Agent 协作流程并输出汇总结果。
- 使用 Daytona 或 E2B 为工具智能体配置代码执行沙箱。
- 使用 LangFuse 记录 Trace 并定位一次 Agent 失败调用的根因。
- 使用 Supabase 为 AI 应用实现用户、会话与业务数据的持久化。

### Analyze

- 对比纯向量 RAG 与 GraphRAG 混合架构在同一评测集上的召回失败案例并归因。
- 拆解一次多 Agent 任务失败为编排、工具、记忆、提示词四类原因并给出证据链。
- 分析 vLLM 推理延迟与 LiteLLM 网关路由策略对端到端成本的影响。
- 比較 Temporal 编排持久化与 Dagster 资产管理在长任务断点续跑场景下的取舍。

### Evaluate

- 基于 DeepEval 与 RAGAS 设计 RAG 与 Agent 的评测集并判定是否达到上线阈值。
- 评估一个 Agent 系统是否需要引入记忆层（Mem0）与沙箱执行，给出成本与风险判断。
- 评审多模态方案（Realtime 语音、Seedance2.5 / Minimax H3、RunningHub、ffmpeg）在短剧与电商带货场景下的质量与成本。
- 判断 LLM 自进化（self-evolving / RSI）方案在当前业务阶段是否值得投入。

### Create

- 设计并交付一个集成项目一：带知识库、多 Agent 分工、可观测与评测、Supabase 落库的业务 Agent（含部署与复盘文档）。
- 设计并交付一个集成项目二：企业数据分析 Agent（含 Temporal 编排、Polaris/Iceberg 数据湖、Trino 查询与自然语言分析报告）。
- 为每章小实战产出可复现的代码仓库、复盘记录与面试作品集讲述稿。
- 综合运用 Skills 与 Agentic 开发工作流，搭建个人提效工具链并沉淀为团队规范。
