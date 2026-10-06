# 参考资料：企业数据工程

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[Temporal 文档](https://docs.temporal.io/)** — 持久化工作流引擎的官方文档。本章"让长任务跑得完"这套机制：事件历史、重放、Activity 与 Workflow 的边界，以这里为准。
- **[Temporal 工作流](https://docs.temporal.io/workflows)** — Workflow 的确定性约束、重试策略与定时器。本章"工作流持久化"与"断点续跑"两节的底层机制。
- **[Temporal Python SDK](https://docs.temporal.io/python)** — `@activity`、`@workflow` 装饰器与 `RetryPolicy` 的 Python 用法，本章那几段编排代码照它写。
- **[Dagster 文档](https://dagster.io/docs/)** — 数据资产编排框架的官方文档。asset、partition、metadata 与血缘模型，本章"管住数据资产"这一节的术语体系在这里。
- ★ **[Apache Polaris](https://polaris.apache.org/)** — 开放表格式的目录服务。本章"Polaris 是元数据入口、格式差异在客户端库解决"这个定位以它为准。
- ★ **[Apache Iceberg](https://iceberg.apache.org/)** — 开放表格式的官方站点。本章讲的元数据分层、快照原子提交、删除文件三套机制，官方文档讲得最完整。
- **[Iceberg 文档](https://iceberg.apache.org/docs/latest/)** — 各类 SQL 操作、`rewrite_data_files` 等维护动作的参考手册，本章建表与合并小文件的参数以它为准。
- ★ **[Trino 文档](https://trino.io/docs/current/)** — 分布式 SQL 查询引擎的官方文档。本章"Trino 是查询引擎不是数据库、不存数据"这个定位的完整说明。

## 工具仓库

- **[temporalio/sdk-python](https://github.com/temporalio/sdk-python)** — Python SDK 源码；本章提到自托管要单独拉起控制面与运行时，仓库的 docker-compose 目录是最短路径。
- **[dagster-io/dagster](https://github.com/dagster-io/dagster)** — 框架本体；资产物化与元数据模型的实现细节读源码最快。
- **[apache/polaris](https://github.com/apache/polaris)** — 目录服务本体；本章说"鉴权方式在不同版本有差别"，这个差异在仓库的部署示例里能对照。
- **[trinodb/trino](https://github.com/trinodb/trino)** — 查询引擎本体；分区裁剪为什么会被"列上套函数"破坏，代码里的分区过滤逻辑是根因所在。