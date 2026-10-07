# 章节目录

本书共 16 章，覆盖学习图中的全部 290 个概念。章节顺序尊重概念依赖关系：
后一章只会用到本章或之前章节讲过的概念，请按顺序学习。

## 章节一览

1. [开发基础与工程规范](01-dev-foundations/index.md) - 本章夯实 AI 应用的工程地基：Python 异步、FastAPI 服务、Linux 排查、Docker 与 Git 协作，以及模型调用基本功，为全书提供零依赖起点。
2. [模型接入与进阶过渡](02-model-access/index.md) - 本章完成从 LangChain 中级到高级的过渡：链式编排、文档切分、向量库操作、工具绑定与代理循环，把能调模型升级为能建系统。
3. [RAG 基础：检索与知识库搭建](03-rag-basics/index.md) - 本章用 RagFlow 流水线讲透知识库问答：文档解析、智能分块、混合检索、查询改写与引用溯源，建成第一个可用的企业问答应用。
4. [RAG 进阶：评测运营与上线](04-rag-advanced/index.md) - 本章让 RAG 从 Demo 走向生产：评测集构建、失败归因、幻觉抑制、灰度发布与知识保鲜，形成完整的上线检查清单。
5. [GraphRAG 与混合检索架构](05-graphrag-hybrid/index.md) - 本章引入 Neo4j 图谱：实体关系抽取、社区发现、图谱与向量融合、多跳推理，用混合架构攻克纯向量检索的召回短板。
6. [MCP 工具交付](06-mcp-tools/index.md) - 本章讲透 MCP 纵向工具观：用 FastMCP 把内部 API 封装为 Agent 可调用的工具，并覆盖鉴权、版本、熔断与工具治理。
7. [多智能体协作编排](07-multi-agent/index.md) - 本章以 AutoGen 为主线讲多 Agent 协作：角色分工、任务交接、结果汇总、群聊管理与反思循环，含 Herd 协作思路与四个业务实战。
8. [跨 Agent 协议互联](08-cross-agent-protocols/index.md) - 本章讲 A2A 横向互联：能力发现、任务委托、状态同步与跨框架消息，阐明 MCP 与 A2A 互补的分工模型。
9. [AI 应用后端集成](09-backend-integration/index.md) - 本章用 Supabase 为 AI 应用落库：数据建模、行级安全、会话持久化、实时订阅与边缘函数，实现业务快速落地。
10. [记忆层与执行沙箱](10-memory-sandbox/index.md) - 本章给 Agent 加上记忆与安全手：Mem0 记忆层管理长短期记忆，Daytona 优先、E2B 对照的沙箱隔离代码执行。
11. [可观测性与评测优化](11-observability-eval/index.md) - 本章建成可靠性闭环：LangFuse 优先追踪定位根因，DeepEval 优先、RAGAS 对照评测守门，外加 LLM 自进化前沿选讲。
12. [企业数据工程](12-data-engineering/index.md) - 本章讲数据分析 Agent 的底座：Temporal 编排持久化、Dagster 资产管理、Polaris 加 Iceberg 数据湖与 Trino 分布式查询。
13. [多模态应用开发](13-multimodal-apps/index.md) - 本章进入多模态：Realtime 语音交互、Seedance 与 Minimax 视频生成、RunningHub 云任务、ffmpeg 合成链，直达短剧与电商场景。
14. [推理服务与部署交付](14-inference-deploy/index.md) - 本章讲上线最后一公里：vLLM 推理部署、显存估算、LiteLLM 网关路由、故障转移、压测与容量规划。
15. [AI 辅助开发工作流](15-dev-workflows/index.md) - 本章把 Agent 用回研发本身：ORCA 开发范式、Superpowers 等 Skill 实践、飞书与 Office CLI 提效，沉淀个人与团队工具链。
16. [综合项目与求职准备](16-capstone-career/index.md) - 本章收敛全书：两个中大型集成项目的验收标准、复盘文档与作品集讲述稿，以及面试宝典与求职全流程准备。

## 使用方法

每章首页列出本章覆盖的概念及其 Concept Impact Score（CIS）：CIS 越高的概念是越多后续内容的地基，值得花更多时间；
每章的「Prerequisites」段说明学前应完成的章节。建议先通读一章的概念表，再进入正文。

每章另有「Quiz」（章后测验）与「Annotated References」（带注释的参考文献）两个子页，从左侧导航栏进入。

---

**注意：** 每章都有一份「本章覆盖概念」清单。开始学习某章前，请先确认该章的「Prerequisites」段里要求的学前章节已完成。
