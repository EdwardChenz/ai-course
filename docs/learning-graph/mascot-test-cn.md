---
title: 墨墨吉祥物图片测试
description: 对全部七个墨墨吉祥物姿态进行视觉与像素级的透明性、去白边检查。
hide:
  toc
---

# 墨墨吉祥物图片测试

> 本页为中文译版，由 `mascot-test.md` 翻译而来；数据源为吉祥物图片自动生成的英文测试报告。

本页以两种方式检测每一张正式使用的吉祥物 PNG 图片：

1. 每张图片都会叠放在棋盘格背景与深色背景上绘制，这样不透明色块、
   光晕与边缘杂色都容易被发现。
2. 浏览器端的像素检测会检查 RGBA 透明区域、透明四角，以及由
   `trim-padding-from-image.py` 生成的 **4 px 内容边框**
   （使用脚本中 alpha 阈值为 10）。

<div id="mascot-test-summary" class="mascot-test-summary" role="status">
  正在执行像素检测……
</div>

<div class="mascot-test-grid">
  <article class="mascot-test-card" data-name="Neutral" data-src="../../img/mascot/neutral.png">
    <h2>中性（Neutral）</h2>
    <div class="mascot-test-swatches">
      <div class="mascot-test-swatch checker"><img src="../../img/mascot/neutral.png" alt="棋盘格透明性测试中的墨墨（中性姿态）"></div>
      <div class="mascot-test-swatch dark"><img src="../../img/mascot/neutral.png" alt="深色透明性测试中的墨墨（中性姿态）"></div>
    </div>
    <p class="mascot-test-result">等待像素检测……</p>
  </article>

  <article class="mascot-test-card" data-name="Welcome" data-src="../../img/mascot/welcome.png">
    <h2>欢迎（Welcome）</h2>
    <div class="mascot-test-swatches">
      <div class="mascot-test-swatch checker"><img src="../../img/mascot/welcome.png" alt="棋盘格透明性测试中的墨墨（挥手）"></div>
      <div class="mascot-test-swatch dark"><img src="../../img/mascot/welcome.png" alt="深色透明性测试中的墨墨（挥手）"></div>
    </div>
    <p class="mascot-test-result">等待像素检测……</p>
  </article>

  <article class="mascot-test-card" data-name="Thinking" data-src="../../img/mascot/thinking.png">
    <h2>思考（Thinking）</h2>
    <div class="mascot-test-swatches">
      <div class="mascot-test-swatch checker"><img src="../../img/mascot/thinking.png" alt="棋盘格透明性测试中的墨墨（思考）"></div>
      <div class="mascot-test-swatch dark"><img src="../../img/mascot/thinking.png" alt="深色透明性测试中的墨墨（思考）"></div>
    </div>
    <p class="mascot-test-result">等待像素检测……</p>
  </article>

  <article class="mascot-test-card" data-name="Tip" data-src="../../img/mascot/tip.png">
    <h2>提示（Tip）</h2>
    <div class="mascot-test-swatches">
      <div class="mascot-test-swatch checker"><img src="../../img/mascot/tip.png" alt="棋盘格透明性测试中的墨墨（向上指）"></div>
      <div class="mascot-test-swatch dark"><img src="../../img/mascot/tip.png" alt="深色透明性测试中的墨墨（向上指）"></div>
    </div>
    <p class="mascot-test-result">等待像素检测……</p>
  </article>

  <article class="mascot-test-card" data-name="Warning" data-src="../../img/mascot/warning.png">
    <h2>警示（Warning）</h2>
    <div class="mascot-test-swatches">
      <div class="mascot-test-swatch checker"><img src="../../img/mascot/warning.png" alt="棋盘格透明性测试中的墨墨（提醒读者）"></div>
      <div class="mascot-test-swatch dark"><img src="../../img/mascot/warning.png" alt="深色透明性测试中的墨墨（提醒读者）"></div>
    </div>
    <p class="mascot-test-result">等待像素检测……</p>
  </article>

  <article class="mascot-test-card" data-name="Encouraging" data-src="../../img/mascot/encouraging.png">
    <h2>鼓励（Encouraging）</h2>
    <div class="mascot-test-swatches">
      <div class="mascot-test-swatch checker"><img src="../../img/mascot/encouraging.png" alt="棋盘格透明性测试中的墨墨（竖起大拇指）"></div>
      <div class="mascot-test-swatch dark"><img src="../../img/mascot/encouraging.png" alt="深色透明性测试中的墨墨（竖起大拇指）"></div>
    </div>
    <p class="mascot-test-result">等待像素检测……</p>
  </article>

  <article class="mascot-test-card" data-name="Celebration" data-src="../../img/mascot/celebration.png">
    <h2>庆祝（Celebration）</h2>
    <div class="mascot-test-swatches">
      <div class="mascot-test-swatch checker"><img src="../../img/mascot/celebration.png" alt="棋盘格透明性测试中的墨墨（庆祝）"></div>
      <div class="mascot-test-swatch dark"><img src="../../img/mascot/celebration.png" alt="深色透明性测试中的墨墨（庆祝）"></div>
    </div>
    <p class="mascot-test-result">等待像素检测……</p>
  </article>
</div>

<noscript>
像素级检测需要启用 JavaScript。上方的可视化透明性对照图即使不启用
它也依然可用。
</noscript>

## 吉祥物提示框

!!! mascot-neutral "一般说明"
    ![墨墨中性姿态](../img/mascot/neutral.png){ class="mascot-admonition-img" }
    这是中性风格，用于一般的提示框或导语。

!!! mascot-welcome "欢迎！"
    ![墨墨挥手致意](../img/mascot/welcome.png){ class="mascot-admonition-img" }
    这是欢迎风格，用于章节开头。

!!! mascot-thinking "关键洞察"
    ![墨墨思考](../img/mascot/thinking.png){ class="mascot-admonition-img" }
    这是思考风格，用于关键概念。

!!! mascot-tip "小提示"
    ![墨墨给出提示](../img/mascot/tip.png){ class="mascot-admonition-img" }
    这是提示风格，用于建议与忠告。

!!! mascot-warning "注意！"
    ![墨墨警示](../img/mascot/warning.png){ class="mascot-admonition-img" }
    这是警示风格，用于常见错误。

!!! mascot-encourage "加油！"
    ![墨墨鼓励](../img/mascot/encouraging.png){ class="mascot-admonition-img" }
    这是鼓励风格，用于难度较高的内容。

!!! mascot-celebration "做得好！"
    ![墨墨庆祝](../img/mascot/celebration.png){ class="mascot-admonition-img" }
    这是庆祝风格，用于达成成就的时刻。

<style>
.mascot-test-summary {
  margin: 1rem 0;
  padding: .75rem 1rem;
  border: 2px solid #546e7a;
  border-radius: .4rem;
  font-weight: 700;
}
.mascot-test-summary.pass { border-color: #2e7d32; background: #e8f5e9; color: #1b5e20; }
.mascot-test-summary.fail { border-color: #c62828; background: #ffebee; color: #b71c1c; }
.mascot-test-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 1rem;
}
.mascot-test-card {
  margin: 0;
  padding: .8rem;
  border: 2px solid #90a4ae;
  border-radius: .5rem;
}
.mascot-test-card.pass { border-color: #43a047; }
.mascot-test-card.fail { border-color: #e53935; }
.mascot-test-card h2 { margin: 0 0 .6rem; }
.mascot-test-swatches { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
.mascot-test-swatch {
  display: grid;
  place-items: center;
  min-height: 13rem;
  padding: .5rem;
  overflow: hidden;
  border: 1px solid rgba(127, 127, 127, .5);
}
.mascot-test-swatch.checker {
  background-color: #fff;
  background-image:
    linear-gradient(45deg, #cfd8dc 25%, transparent 25%),
    linear-gradient(-45deg, #cfd8dc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #cfd8dc 75%),
    linear-gradient(-45deg, transparent 75%, #cfd8dc 75%);
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
}
.mascot-test-swatch.dark { background: #17131f; }
.mascot-test-swatch img { display: block; width: 100%; height: 12rem; object-fit: contain; }
.mascot-test-result { margin: .7rem 0 0; font-size: .82rem; line-height: 1.45; }
.mascot-test-result strong { display: inline-block; margin-right: .25rem; }
</style>

<script>
(() => {
  const threshold = 10;
  const expectedBorder = 4;
  const cards = [...document.querySelectorAll('.mascot-test-card[data-src]')];
  const summary = document.getElementById('mascot-test-summary');

  function inspect(card) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let minX = canvas.width;
        let minY = canvas.height;
        let maxX = -1;
        let maxY = -1;
        let transparent = 0;

        for (let y = 0; y < canvas.height; y += 1) {
          for (let x = 0; x < canvas.width; x += 1) {
            const alpha = pixels[((y * canvas.width + x) * 4) + 3];
            if (alpha === 0) transparent += 1;
            if (alpha > threshold) {
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }
          }
        }

        const cornerOffsets = [
          3,
          ((canvas.width - 1) * 4) + 3,
          (((canvas.height - 1) * canvas.width) * 4) + 3,
          ((((canvas.height - 1) * canvas.width) + canvas.width - 1) * 4) + 3
        ];
        const cornersTransparent = cornerOffsets.every((offset) => pixels[offset] === 0);
        const margins = [minX, minY, canvas.width - 1 - maxX, canvas.height - 1 - maxY];
        const trimPass = maxX >= 0 && margins.every((margin) => margin === expectedBorder);
        const alphaPass = transparent > 0 && cornersTransparent;
        const pass = alphaPass && trimPass;
        const result = card.querySelector('.mascot-test-result');

        card.classList.add(pass ? 'pass' : 'fail');
        result.innerHTML = `<strong>${pass ? 'PASS' : 'FAIL'}</strong> ` +
          `${canvas.width}×${canvas.height}px · RGBA transparency: ${alphaPass ? 'pass' : 'fail'} · ` +
          `content margins L/T/R/B: ${margins.join('/')}px (${trimPass ? 'pass' : 'expected 4/4/4/4'})`;
        resolve(pass);
      };
      image.onerror = () => {
        card.classList.add('fail');
        card.querySelector('.mascot-test-result').innerHTML = '<strong>FAIL</strong> Image could not be loaded.';
        resolve(false);
      };
      image.src = card.dataset.src;
    });
  }

  Promise.all(cards.map(inspect)).then((results) => {
    const passed = results.filter(Boolean).length;
    const allPass = passed === results.length;
    summary.classList.add(allPass ? 'pass' : 'fail');
    summary.textContent = allPass
      ? `PASS — all ${passed} mascot PNGs have transparency and the expected 4 px trim border.`
      : `FAIL — ${passed} of ${results.length} mascot PNGs passed. Review the failed cards below.`;
  });
})();
</script>