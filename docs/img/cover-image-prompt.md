# 封面图生成提示词（Cover Image Prompt）

> 用法：把下面「完整提示词」整段复制到你常用的文生图工具（ChatGPT 图像、Midjourney、Gemini、
> Ideogram、Leonardo.ai 等），生成 2-4 版草稿挑选。选定后存为 `docs/img/cover.png`，尺寸裁到
> 1200×630（1.91:1）。
>
> 提示：本书的吉祥物「墨墨」形象稿目前还是代码生成的占位图。如果你想让封面吉祥物更精致，
> 先按 `docs/img/mascot/image-prompts.md` 生成 7 个姿态的正式美术图，再用其中 `welcome.png`
> 作为本提示词的参考图（image reference）喂给文生图工具，效果会明显好于纯文字描述。

---

## 完整提示词（复制这一段）

```text
Please generate a professional-quality cover image for a Chinese technical textbook.
This image will be used in social media previews and must follow the formatting
guidelines for an Open Graph image preview.

**Required specifications:**
- Format: PNG
- Wide-landscape format
- Size: 1200x630 pixels (1.91:1 aspect ratio)
- This is the Open Graph standard for social media previews

The image has four layers, back to front: background montage, color
treatment, mascot, and title text.

## Subject & Tone

《高级AI大模型应用开发》is a practical engineering textbook about building
reliable AI agent systems: retrieval-augmented generation and GraphRAG knowledge
bases, the Model Context Protocol (MCP) for tool delivery, multi-agent
collaboration, runtime observability and evaluation, multimodal pipelines,
and LLM inference deployment. The intended audience is professional
developers who already know Python backends and basic LangChain, and who want
to ship production agent systems rather than notebooks. The visual tone should be
modern, technical and confident — the feel of a well-architected systems
diagram, not a friendly children's book and not a glossy stock-photo tech
brochure.

## Title

Place the Chinese title "高级AI大模型应用开发" in the center of the image, large and
highly legible, in a clean geometric sans-serif font (Noto Sans SC / Source Han
Sans style). Use a near-white font color with a subtle dark scrim panel behind it
so it stays readable against the busy montage background. Beneath the title, add
a smaller subtitle line in a lighter weight, same font: "从模型接入到 Agent 落地".
Do not shrink the title to fit — instead simplify and darken the background
directly behind the text.

## Background Montage

Arrange a montage of the following 9 technical concepts around the title, each
rendered in the same consistent isometric vector style so the composition reads as
one coherent image rather than a collage:

1. Retrieval pipeline — a horizontal flow of document chunks being embedded into
   floating vector points, with a magnifying lens selecting a few highlighted
   chunks from the field.
2. Knowledge graph — a dense node-and-edge network with a few nodes glowing and
   connected by curved paths of varying thickness, suggesting multi-hop reasoning.
3. Tool interface layer — a vertical stack of modular rectangular "tool" blocks
   plugging downward into a central hub, with small connector pins, suggesting a
   protocol interface.
4. Multi-agent orchestration — four or five distinct robot-like role nodes
   arranged in a loose ring, each connected to its neighbors by directional
   arrows, with small role badges on their bodies.
5. Agent-to-agent handshake — two distinct agent nodes facing each other exchanging
   a glowing envelope or handshake glyph across a link, suggesting horizontal
   interconnection between separate systems.
6. Observability and evaluation — a horizontal trace timeline with nested
   span bars in graded colors, alongside a small line chart with a threshold
   gate line, suggesting tracing and quality gating.
7. Sandboxed execution — a translucent rounded container box with code glyphs
   inside and a padlock shield motif, isolated from everything around it.
8. Inference serving — a vertical rack of GPU server blades with glowing status
   LEDs, next to a segmented queue of waiting request cards being served in
   parallel batches.
9. Multimodal pipeline — a flowing audio waveform on the left morphing into
   stacked video frames on the right, joined by a stream of small particles.

## Mascot

Place the book's mascot in the lower-left corner, sized so it does not overlap the
title text. The mascot is described as: a friendly cartoon octopus rendered in
the same flat vector style — deep indigo-blue round body (hex #3F51B5), eight
tentacles, a bright orange engineering scarf around its neck (hex #FF9800), small
round goggles pushed up on its head, big bright eyes and a warm reliable smile,
waving one tentacle in greeting. Keep it small and friendly, roughly 18% of the
image height.

## Style & Composition

- Illustration style: isometric technical vector illustration, clean geometric
  shapes, thin luminous connector lines, subtle depth. Apply this one style to
  every montage element for visual consistency.
- Color palette: deep indigo-blue and dark slate as the dominant background
  (#1A1F3A to #2A2F55), with vivid orange (#FF9800) and teal (#26C6DA) as
  accents, and a few pale gold highlights.
- Lighting/mood: dark, focused, "control room at night" — the accents glow
  against the dark background like instrument panels. Confident and calm, not
  busy or alarming.
- Composition: title centered with generous dark negative space immediately
  behind and around it; montage elements arranged in a loose ring or balanced
  grid around the title with visible gaps between them; mascot in the lower-left;
  the whole composition must remain legible when scaled down to 600px wide.

## Avoid

- Do not render dense paragraphs or blocks of small text anywhere in the image.
  Short axis labels or a single formula-like glyph are acceptable; paragraphs are not.
- Avoid generic stock-photo cliches: no handshakes between businesspeople, no
  isolated glowing lightbulbs, no people pointing at whiteboards, no floating
  brain icons, no chess pieces.
- Avoid photorealistic human faces and hands entirely.
- Do not use a literal octopus photograph or a realistic octopus — the mascot must
  read as a flat vector cartoon character.
- Do not let montage elements visually compete with, overlap, or sit on top of the
  title text; the title is the single most important element.
- Avoid a plain gradient background with nothing on it — the montage must be
  present and legible.
- Avoid red-and-green color pairs for any semantic distinction; use the indigo /
  orange / teal palette only.
```

---

## 备选变体（如果上面的初稿不满意，按需替换其中一项再重出）

| 想改什么 | 改哪里 |
|---|---|
| 整体更暗、更"极客" | 把 montage 数量从 9 减到 6，背景压到 `#141830`，减少发光效果 |
| 整体更亮、更亲和 | 背景改浅灰蓝 `#EEF1F8`，配色改靛蓝 + 天蓝 + 珊瑚橙，文字改深色 |
| 不想让 AI 画中文字 | 删掉 Title 与 Mascot 两节，只出纯图形底图，标题后期用设计软件叠加 |
| 想要竖版书封（不是 OG 图） | 把尺寸改为 1600×2400，把 `Wide-landscape` 相关描述改成 `Portrait` |
| 吉祥物太抢眼 | 把吉祥物尺寸从 18% 改到 12%，并移到左下角更靠边的位置 |

## 验收清单（拿到图后逐条确认）

- [ ] 尺寸为 1200×630（1.91:1），PNG 格式
- [ ] 缩到 600px 宽时，标题仍完全可读
- [ ] 没有大段模糊文字（AI 生成图最常见的失败点）
- [ ] 九（或六）个蒙太奇元素都能辨认出主题，不是抽象色块
- [ ] 吉祥物不像真实章鱼照片，是扁平卡通形象
- [ ] 标题区域没有元素压在上面
- [ ] 没有红绿搭配

## 当前封面的已知问题

现有 `docs/img/cover.png`（1731×909）是 `init-textbook` 脚手架自带的**通用占位封面**，
与本书内容无关，需用本提示词生成的正式封面替换。
