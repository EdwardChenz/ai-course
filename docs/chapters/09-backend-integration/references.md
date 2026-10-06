# 参考资料：AI 应用后端集成

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[Supabase 文档](https://supabase.com/docs)** — 本章主线的官方文档总入口。本章讲"为什么不是裸 FastAPI + 自建 Postgres"时列的四笔账，对应的能力边界都在这里。
- ★ **[Postgres 行级安全策略](https://supabase.com/docs/guides/database/postgres/row-level-security)** — RLS 的启用、`USING` 与 `WITH CHECK` 的区别、`PERMISSIVE` 与 `RESTRICTIVE` 策略组合。本章"RLS 漏配导致数据越权"那个模拟器的判定条件，标准来自这一页。
- **[PostgreSQL 行安全（官方手册）](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)** — RLS 的底层语义：策略如何对每行的 `SELECT` / `INSERT` / `UPDATE` / `DELETE` 生效，以及表所有者默认绕过策略这个关键细节。
- ★ **[Supabase 的 pgvector 扩展](https://supabase.com/docs/guides/database/extensions/pgvector)** — 在 Supabase 上建向量索引与相似度查询的完整步骤，本章"AI 数据四件套"里的向量扩展一节直接照它写。
- **[Supabase Realtime](https://supabase.com/docs/guides/realtime)** — 实时订阅与推送的机制。本章"实时订阅推送"那节的实现方式。
- **[Supabase Storage](https://supabase.com/docs/guides/storage)** — 文件存储、桶权限与签名 URL。本章"文件存储集成"一节的口径。
- **[Supabase Auth](https://supabase.com/docs/guides/auth)** — JWT 签发、刷新与用户管理。本章强调 `service_role` 密钥会绕过 RLS，这条警示在这一页。
- **[Supabase Edge Functions](https://supabase.com/docs/guides/functions)** — 边缘函数的部署与运行时。本章"边缘函数集成"一节的技术前提。

## 工具仓库

- **[supabase/supabase](https://github.com/supabase/supabase)** — 平台本体与自托管部署配置；本章成本估算里哪些部分是自己扛、哪些是托管的，看这个仓库最清楚。
- **[supabase/supabase-py](https://github.com/supabase/supabase-py)** — 官方 Python 客户端。本章的 `create_client` 与实时订阅写法都出自这里。
- **[pgvector/pgvector](https://github.com/pgvector/pgvector)** — Postgres 的向量扩展本体。本章反复强调"元数据过滤要下推到索引查询、不能事后过滤"，其索引支持能力以这个仓库为准。