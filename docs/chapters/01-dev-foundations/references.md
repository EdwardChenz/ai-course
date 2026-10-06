# 参考资料：开发基础与工程规范

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[asyncio — Concurrent Programming with Python](https://docs.python.org/3/library/asyncio.html)** — 事件循环、`await`、协程与信号量的权威定义；本章"等 IO 用异步、等算力用多进程"这条分工表的理论依据就在这里。
- ★ **[FastAPI 教程](https://fastapi.tiangolo.com/tutorial/)** — 从路由、Pydantic 请求体校验到依赖注入的完整入门路径；本章的 `/chat` 请求模型和 422 校验行为都出自这一套声明式范式。
- ★ **[FastAPI 流式响应](https://fastapi.tiangolo.com/advanced/stream-data/)** — `StreamingResponse`、`yield` 逐块输出与内存模式的区别，是本章 SSE 实现的服务端写法依据。
- ★ **[Server-Sent Events（MDN）](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)** — `data:` 行格式、空行分帧、自动重连与 `[DONE]` 收尾的浏览器端规范，本章 SSE 一节直接对照它写。
- **[Python 标准库 logging](https://docs.python.org/3/library/logging.html)** — `dictConfig`、Formatter、Handler 的配置模型；本章"结构化日志"一节讲的就是把它改造成一行一条 JSON。
- **[Python 标准库 venv](https://docs.python.org/3/library/venv.html)** — 虚拟环境的官方说明，本章选型表里"`venv` 是标准库自带"这条结论的出处。
- **[Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/)** — 本章"Dockerfile 按层缓存、依赖在前代码在后"以及"最终镜像不留 gcc"的官方依据。
- **[Docker 网络](https://docs.docker.com/engine/network/)** — 默认 bridge 网络下容器用服务名互访的规则，本章"容器里 `localhost` 指的是自己"这个高频坑的出处。

## 规范与论文

- ★ **[Attention Is All You Need](https://arxiv.org/abs/1706.03762)** — Transformer 原始论文。理解 token、上下文窗口与自注意力解码成本，本章"Token 与上下文窗口"那套估算公式的物理背景在这里。

## 延伸阅读

- **[HTTP 状态码（MDN）](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)** — 状态码各自的语义约定。本章强调"监控和网关只认状态码，不要 `return {"error": ...}` 混在 200 里"的理由。

## 工具仓库

- **[openai/openai-python](https://github.com/openai/openai-python)** — 官方 Python SDK；本章的 `AsyncOpenAI` 单例封装、分层超时设置与 `tools` 数组定义都来自这个包。
- **[tiangolo/fastapi](https://github.com/tiangolo/fastapi)** — 框架本体；遇到声明式校验或流式响应的边界行为，直接读源码比读文档更快。