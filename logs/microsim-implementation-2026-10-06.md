# Session Log — MicroSim 实现（35 个） — 2026-10-06

**Skill:** microsim-generator（p5-guide / chartjs 规范）+ microsim-utils 校验思路
**Mode:** 手写 1 个跑通管线 → 固化规范 → 4 个 agent 并行批量 → 主会话统一复核

## 交付

35 个 MicroSim 全部实现，嵌入 16 章，nav 全量登记。

| Library | 数量 | 实现方式 |
|---|---|---|
| p5.js | 18 | 滑块/按钮/输入框 + 判题状态机 |
| Chart.js | 8 | canvas 图表 + HTML 控件 |
| html | 7 | 纯 HTML/CSS，无外部库 |
| vis-network | 1 | 图谱模型 |
| vis-timeline | 1 | 交接时间线 |

每个 sim 四个文件：`index.md`（`status: built` + iframe + 说明）、`main.html`、`<sim-id>.js`、`metadata.json`。

## 主会话亲手验证的部分

1. **token-cost-estimator 全流程实测**（发现并修 3 个 bug）：
   - `updateCanvasSize()` 在 `setup()` 首句执行时滑块未创建 → `.size()` 报
     `TypeError: Cannot read properties of undefined`。已加 `typeof !== 'undefined'` 守卫，
     并写入 `docs/sims/BUILDING-SIMS.md` 铁律，后续 34 个全部规避。
   - 按钮与滑块同行 → 控件区从 3 行改 4 行，`controlHeight` 115→150，iframe 447→482。
   - 画布 `text()` 标签与 HTML 输入框同坐标 → 重叠。标签移到输入框左侧空隙。
   - 判题链路实测通过：手输 1000/0.0136 → 判对、计数 +1、自动进第 2 题、滑块同步。
2. **orchestration-state-machine**（第 4 批漏掉的 1 个，主会话补写）：
   - 修一个教学设计 bug：非法转移（序号 2、12）原本被粉色高亮，**等于提前泄露答案**，
     违背"先预测再揭晓"的核心设计。改为揭晓后才着色。
   - 反馈文字压住第 12 行 → 移到控件区底部。
   - 实测：正确答案判对并全展开；错误答案（终态"已完成"、序号"2"）给红色反馈、
     答案未泄露、提示"看第 11 步重试耗尽之后还能去哪一格"、明示还有 1 次机会。
3. **章节内嵌入实测**：第 7 章 iframe 成功加载（`contentDocument.title` 返回 sim 标题），
   截图确认 sim 完整渲染 + 全屏按钮 + 规格块折叠区 + TOC 自动收录。

## 统一复核结果（未采信 agent 自报）

- 35/35 sim 目录四文件齐全，无多余目录、无缺失 sim
- 34 个 metadata.json 全部 `json.load` 通过且含必需字段
- 35/35 被章节引用，iframe 合计 35 个，`<details>` 嵌套配对无异常
- 16 章吉祥物 validator 全部 `OK`
- `mkdocs build --strict` 退出 0（nav 分组标题已改注释，避免被当文件）
- 章节规格块 `Status: Specified` → `built`，原文保留在嵌套折叠区作为设计图纸

## 子 agent 报告的规格块内部矛盾（未自行改数据，已在 sim 界面/metadata 标注）

1. `hyde-recall-delta`：正文写"76→86、12.7→14.3"，数据表逐行求和为 76→96、12.7→16.0 → 按数据表实现。
2. `batching-strategy-compare` 第 4 题：Content 标准值 1.42 QPS，Rules 公式与反馈文案均为 2.56 → 采用 2.56。
3. `sandbox-quota-cost-ledger`：规格写滑块步长 5 秒，但该网格不含其自身默认值 12 秒 → 滑块改 1 秒粒度。
4. `model-selection-scorecard`：C 按 Content 为 3.2，按 Rules 公式为 3.4 → 按公式。
5. `task-handoff-state-timeline`：Content 说"回退三次合计 3.0 分"，3×1.5=4.5 → 判题取 3.0，矛盾点需作者裁决。
6. `vis-timeline@7.7.3/standalone/umd/vis-timeline.min.js` 该包内不存在 → 改用同版本
   `vis-timeline-graph2d.min.js`。

以上 6 处建议作者裁决，我没有替你改数据。

## 新增文件

- `docs/sims/BUILDING-SIMS.md` —— 已验证的 MicroSim 施工规范与铁律（后续复用）
- `docs/sims/<35 个 sim 目录>` —— 每个 4 文件

## 下一步

Phase 5 辅助内容仍全缺：glossary / FAQ / 每章 quiz / 每章 references。
book-metrics 现为：290 概念、16 章、35 MicroSim、61,511 词、约 272 等效页。
