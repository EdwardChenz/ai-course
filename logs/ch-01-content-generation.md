# Session Log — book-installer/mascot + chapter-content-generator Ch1 — 2026-10-06

**Skill Versions:** book-installer/learning-mascot (feature 30), chapter-content-generator 1.11
**Mode:** Sequential. MicroSim reuse check: SKIPPED（catalog 路径为作者本机 macOS 路径，本机不存在，按 graceful degradation 跳过）。

## 吉祥物：墨墨 (Momo)

- 决策（用户授权自行发挥）：章鱼，八触手隐喻多智能体并行；"墨"呼应工程师文化；靛蓝加橙取自本书主题色；中文叠词名，无性别指向。
- 落地文件：`docs/css/mascot.css`、`docs/img/mascot/character-sheet.md`、
  `docs/img/mascot/image-prompts.md`（7 条自包含提示词）、7 张占位 PNG（PIL 生成，透明底）、
  `docs/learning-graph/mascot-test.md`（脚本生成）、CONTENT-GENERATION-GUIDE.md（renderer +
  File Index / Character Overview / Voice 三节）、`mkdocs.yml`（extra_css + nav + exclude 角色卡）。
- 构建零警告。占位图待用户用 prompts 生成正式美术后覆盖（命令在 image-prompts.md 文末）。

## Ch1 开发基础与工程规范

- 预算：19×A + 5×B（cis_max=97 全局归一），正文约 12700 有效字符，24/24 概念覆盖，TODO 已移除。
- 非文本元素：6 个代码块、对比表 2 张、MicroSim 规格 2 个（token-cost-estimator Apply/calculate；
  retry-backoff-ladder Analyze/compare，均过自检：六行头完整、无构建指令、无"例如"类 hedges、
  Chapter Anchors 与正文数字一致）。
- 吉祥物 9 个（welcome 自我介绍 + thinking 2 + tip 2 + warning 2 + encourage 1 + celebration 1），
  无连续、无重复、图片齐全；CJK 句数自查 1–4 句合规。
- `mkdocs build --strict` 通过。

## 修订 2026-10-06（用户反馈：修 validator、去英文、加厚）

- 上游 `validate-chapter-mascots.py`：`SENTENCE_RE` 补上 `。！？`
 （`[.!?](?:\s|$)|[。！？]`），第一章现零违规通过。改的是 ibook-skills 仓库内文件，已告知用户。
- 第一章自我介绍按 canonical pattern 改为编号列表（此前是散文式），命中自介绍豁免。
- 去英文：脚手架英文句、两份 MicroSim 规格块正文全部转中文；
  机器可读六行头（Type/Library/Status/Bloom）、CIS 表头、公式标识符保留英文。
- 加厚（12.7k→15.5k 有效字符，代码块 10→13 处）：venv 三选一、pip-tools 锁流程、
  信号量限并发、线程对照表、422 处理、客户端消费示例、TTFT 算例、流形态对照、
  dictConfig、awk 统计、日志归档、K8s 双探针、多阶段构建、env 优先级、容器排障三板斧、
  PR 清单、冒烟清单、few-shot、超时分层、上下文三策略、解析重试、完整 tools 循环、
  嵌套 Schema、熔断器实现、密钥方案对照、Redis 缓存。
- 复检：24/24 覆盖、规格自检通过、吉祥物零违规、`build --strict` 通过。

## 仍遗留（非阻塞）

- `mascot-test.md` 的 7 连 admonition 是样式目录（脚本生成），validator 报 back-to-back 属预期内，
  非章节正文问题，未动。

- `validate-chapter-mascots.py` 的 `SENTENCE_RE = [.!?]` 只认 ASCII 句号，中文 `。！？` 结尾一律判 0 句。
  本书 9 条吉祥物实际 1–4 句、全以中文标点结尾，属 validator 对 CJK 的误报。未改上游脚本
 （那是 ibook-skills 仓库的文件）；如需根治，一行补丁 `[.!?。！？]` 即可，由作者定夺。
- `mascot-test.md` 的 7 连 admonition 是样式目录（脚本生成），validator 报 back-to-back 属预期内，
  非章节正文问题，未动。
