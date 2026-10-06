# 参考资料：MCP 工具交付

本章提到的技术、工具与方法，可从以下来源深入。带 ★ 的是本章最核心的必读项。

## 官方文档

- ★ **[Model Context Protocol](https://modelcontextprotocol.io/)** — 协议官方站点。本章"协议是接线规范、不是工具质量保证"这个定位判断，出处就在这里。
- ★ **[MCP 规范（最新版本）](https://modelcontextprotocol.io/specification/latest)** — JSON-RPC 2.0 报文、`initialize` 握手顺序、`tools/*` 与 `resources/*` 与 `prompts/*` 三组方法名、以及错误码约定的规范原文。本章那四步会话流程逐条对照此页。
- **[MCP 官方 Servers 仓库](https://github.com/modelcontextprotocol/servers)** — 大量可运行的参考实现。本章"把内部 API、数据库、文件封装成工具"时，先看官方怎么写这些工具最省事。
- **[FastMCP 文档](https://gofastmcp.com/)** — Python 服务端框架文档。`@mcp.tool()` 装饰器从函数签名生成 Schema、从 docstring 生成 description，以及 HTTP 与 stdio 两种传输方式的配置。
- **[OpenTelemetry Trace 信号](https://opentelemetry.io/docs/concepts/signals/traces/)** — span 与 trace 的语义、父子关系与属性约定。本章工具可观测埋点一节的 span 设计以此为准。
- **[JSON-RPC 2.0 规范](https://www.jsonrpc.org/specification)** — MCP 底层的传输约定。本章讲"HTTP 是无状态的、重试逻辑必须由客户端负责"，理解这一点需要先读这份规范。

## 规范与论文

- ★ **[ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)** — 推理与行动交替的范式。本章反复强调"模型只出工具调用、真正执行的是你的代码"，这个分工来自 ReAct。
- **[Toolformer: Language Models Can Teach Themselves to Use Tools](https://arxiv.org/abs/2302.04761)** — 模型学会调用工具的训练方法。理解"模型为什么能稳定吐出可用的参数"，这篇是基础。

## 工具仓库

- ★ **[modelcontextprotocol/python-sdk](https://github.com/modelcontextprotocol/python-sdk)** — 官方 Python SDK。本章的 `ClientSession`、`streamablehttp_client`、`initialize` / `list_tools` / `call_tool` 三行调用结构全部出自这里。
- **[jlowin/fastmcp](https://github.com/jlowin/fastmcp)** — FastMCP 框架本体，装饰器与异常类型的实现细节看源码最快。