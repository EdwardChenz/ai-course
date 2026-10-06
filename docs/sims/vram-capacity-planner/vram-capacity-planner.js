// 显存与并发容量估算器 — VRAM Capacity Planner
// 教学目标：调节模型档位、量化精度、上下文长度与并发路数四组参数，
// 逐条判定六组配置能否装下，并选出唯一满足「并发 ≥ 16 路且显存不超预算」的配置。
// 规格来源：docs/chapters/14-inference-deploy/index.md 的 vram-capacity-planner 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：3 个下拉框（模型 / 量化 / 上下文）+ 1 个滑块（并发）+ 1 个下拉框（判定项）
//           + 1 组单选 + 2 个按钮，共 4 行
// controlHeight = (4 * 35) + 10 = 150
// drawHeight = 570；canvasHeight = 570 + 150 = 720；iframeHeight = 722
// 行分配：第 1 行模型 + 量化 + 上下文三个下拉框 / 第 2 行滑块并发
//         第 3 行判定项下拉框 + 判定值单选组 / 第 4 行按钮

let canvasWidth = 800;
let drawHeight = 570;
let controlHeight = 150;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let sliderLeftMargin = 150;
let defaultTextSize = 16;

// ---- 固定常量（规格块 Content）----
const CARD_GB = 80;
const GPU_UTIL = 0.90;
const SINGLE_CARD_BUDGET = CARD_GB * GPU_UTIL;  // 72.0 GB
const OVERHEAD_RATIO = 0.10;                    // 算子与碎片开销

// ---- 模型档位（规格块 Content）----
const MODELS = {
  '7B':  { params: 7,  cards: { 'FP16': 1, 'INT8': 1, 'INT4': 1 },
           kvMB: { 'FP16': 0.5, 'INT8': 0.25, 'INT4': 0.125 } },
  '13B': { params: 13, cards: { 'FP16': 1, 'INT8': 1, 'INT4': 1 },
           kvMB: { 'FP16': 0.8, 'INT8': 0.4 } },
  '70B': { params: 70, cards: { 'FP16': 4, 'INT8': 2, 'INT4': 2 },
           kvMB: { 'FP16': 2.5, 'INT8': 1.25, 'INT4': 1.25 } }
};
const BYTES_PER_PARAM = { 'FP16': 2, 'INT8': 1, 'INT4': 0.5 };
const QUANTS = ['FP16', 'INT8', 'INT4'];
const CONTEXTS = [2048, 4096, 8192];

// ---- 六组待判定配置（规格块 Content 表）----
const CONFIGS = [
  { no: 1, model: '7B',  quant: 'FP16', ctx: 2048, conc: 8,
    w: 14.0, kv: 8.0, oh: 2.2, total: 24.2, budget: 72.0, fits: true,  rest: 47.8,
    fb: '单卡绰绰有余，但 8 路并发的吞吐只有约 1.0 QPS，撑不住生产流量——装得下不等于可用。' },
  { no: 2, model: '13B', quant: 'INT8', ctx: 4096, conc: 16,
    w: 13.0, kv: 25.6, oh: 3.9, total: 42.5, budget: 144.0, fits: true, rest: 101.5,
    fb: '13B 量化到 INT8 后权重降到 13 GB，且 INT8 把 KV 也降了半档，16 路只占 42.5 GB。它是六组里余量最宽的一条，代价是正确率掉 0.01。' },
  { no: 3, model: '7B',  quant: 'FP16', ctx: 4096, conc: 32,
    w: 14.0, kv: 64.0, oh: 7.8, total: 85.8, budget: 72.0, fits: false, rest: -13.8,
    fb: '本章最典型的陷阱：权重只占 19.4% 看着宽裕，但 32 路并发把 KV 撑到 64 GB，加 10% 开销后 85.8 GB，比预算多 13.8 GB，进程会被直接杀掉。' },
  { no: 4, model: '7B',  quant: 'FP16', ctx: 4096, conc: 24,
    w: 14.0, kv: 48.0, oh: 6.2, total: 68.2, budget: 72.0, fits: true, rest: 3.8,
    fb: '本章生产基线。24 路并发满足吞吐要求，68.2 GB 对 72.0 GB 预算留 5.3% 余量——余量偏薄，所以监控里必须有 OOM 告警。' },
  { no: 5, model: '7B',  quant: 'FP16', ctx: 8192, conc: 16,
    w: 14.0, kv: 64.0, oh: 7.8, total: 85.8, budget: 72.0, fits: false, rest: -13.8,
    fb: '权重很轻但上下文翻倍，KV 同样涨到 64 GB。KV 是并发与上下文的乘积，压并发或压上下文必须至少动一个。' },
  { no: 6, model: '70B', quant: 'INT4', ctx: 4096, conc: 8,
    w: 35.0, kv: 40.0, oh: 7.5, total: 82.5, budget: 72.0, fits: false, rest: -10.5,
    fb: 'INT4 把 70B 的权重从 140 GB 压到 35 GB，单卡装得下权重，但 8 路并发的 KV 仍有 40 GB，两项相加 82.5 GB 已超单卡预算。要跑 70B INT4 至少两卡，且并发不能超过 8 路。' }
];
const FINAL_ANSWER = 4;

function gb(x) { return Math.round(x * 10) / 10; }
function weightGB(model, quant) { return gb(MODELS[model].params * BYTES_PER_PARAM[quant]); }
function kvGB(model, quant, ctx, conc) {
  return gb(conc * ctx * MODELS[model].kvMB[quant] / 1024);
}
function overhead(w, kv) { return gb((w + kv) * OVERHEAD_RATIO); }
function totalOf(w, kv) { return gb(w + kv + overhead(w, kv)); }
function budgetOf(model, quant) {
  return gb(MODELS[model].cards[quant] * SINGLE_CARD_BUDGET);
}
function isFits(c) { return c.total <= c.budget; }

let modelSel, quantSel, ctxSel, concSlider;
let itemSel, valRadio;
let submitBtn, resetBtn;
let locked = {};
let revealed = false;

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  modelSel = createSelect();
  modelSel.parent(document.querySelector('main'));
  modelSel.position(48, drawHeight + 5);
  modelSel.size(90);
  for (const m of ['7B', '13B', '70B']) modelSel.option(m, m);
  modelSel.attribute('aria-label', '模型档位');

  quantSel = createSelect();
  quantSel.parent(document.querySelector('main'));
  quantSel.position(186, drawHeight + 5);
  quantSel.size(90);
  for (const q of QUANTS) quantSel.option(q, q);
  quantSel.attribute('aria-label', '量化精度');

  ctxSel = createSelect();
  ctxSel.parent(document.querySelector('main'));
  ctxSel.position(348, drawHeight + 5);
  ctxSel.size(120);
  for (const c of CONTEXTS) ctxSel.option(c + ' token', String(c));
  ctxSel.attribute('aria-label', '上下文长度');
  ctxSel.selected('4096');

  concSlider = createSlider(8, 64, 24, 8);
  concSlider.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  concSlider.position(sliderLeftMargin, drawHeight + 40);
  concSlider.size(canvasWidth - sliderLeftMargin - margin);
  concSlider.attribute('aria-label', '并发路数');

  itemSel = createSelect();
  itemSel.parent(document.querySelector('main'));
  itemSel.position(110, drawHeight + 78);
  itemSel.size(138);
  for (const c of CONFIGS) itemSel.option('序号 ' + c.no, 'c' + c.no);
  itemSel.option('★ 最终可用配置', 'final');
  itemSel.attribute('aria-label', '判定项');
  itemSel.changed(refreshRadio);

  submitBtn = createButton('提交判定');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(10, drawHeight + 113);
  submitBtn.mousePressed(submitVerdict);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(130, drawHeight + 113);
  resetBtn.mousePressed(resetAll);

  refreshRadio();

  describe('交互式显存容量估算器：调节模型档位、量化精度、上下文长度与并发路数，' +
    '实时读出权重、KV、开销与显存合计，再逐条判定六组配置能否装下并选出最终可用配置。');
}

function refreshRadio() {
  const opts = itemSel.value() === 'final'
    ? CONFIGS.map(c => '序号 ' + c.no)
    : ['装得下', '装不下'];
  // p5 2.x 的 radio.remove() 需要传 value，无参调用不会移除 DOM；这里改用 elt.remove()
  if (typeof valRadio !== 'undefined' && valRadio) { valRadio.elt.remove(); valRadio = null; }
// p5 2.x 的 createRadio 只接受组名，选项必须逐个 .option() 添加
  valRadio = createRadio('vram_answer');
  for (const o of opts) valRadio.option(o, o);
  valRadio.parent(document.querySelector('main'));
  valRadio.position(255, drawHeight + 80);
  // p5 2.x 单选组必须给足宽度，否则每个选项会各占一行撑破画布
  valRadio.size(520);
  valRadio.attribute('aria-label', '判定值');
}

function draw() {
  updateCanvasSize();

  fill('aliceblue');
  stroke('silver');
  rect(0, 0, canvasWidth, drawHeight);
  fill('white');
  rect(0, drawHeight, canvasWidth, controlHeight);

  fill('black');
  noStroke();
  textSize(24);
  textAlign(CENTER, TOP);
  text('显存与并发容量估算器', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawReadout(44);
  drawTable(206);
  drawFeedback(428);
  drawControls();
}

function drawReadout(y) {
  const model = modelSel.value(), quant = quantSel.value();
  const ctx = parseInt(ctxSel.value(), 10), conc = concSlider.value();
  const w = weightGB(model, quant);
  const kv = kvGB(model, quant, ctx, conc);
  const oh = overhead(w, kv);
  const total = totalOf(w, kv);
  const budget = budgetOf(model, quant);
  const ok = total <= budget;

  fill(60);
  textSize(14);
  const endY = drawWrapped('屏幕提问：六组配置只有一组能上生产——先逐条判装下，再选配置。固定常量：单张 A100 80 GB，' +
    '--gpu-memory-utilization 0.90，算子与碎片开销按权重加 KV 的 10% 计。', margin, y, charsPerLine(), 18);
  fill('black');

  const rows = [
    ['权重 = ' + MODELS[model].params + 'B × ' + BYTES_PER_PARAM[quant] + ' 字节',
      w.toFixed(1) + ' GB'],
    ['KV = ' + conc + ' 路 × ' + ctx + ' token × ' + MODELS[model].kvMB[quant] + ' MB',
      kv.toFixed(1) + ' GB'],
    ['开销 = （权重 + KV）× 10%', oh.toFixed(1) + ' GB'],
    ['显存合计 = 权重 + KV + 开销', total.toFixed(1) + ' GB'],
    ['预算 = ' + MODELS[model].cards[quant] + ' 卡 × 80 GB × 0.90', budget.toFixed(1) + ' GB']
  ];
  textSize(15);
  let yy = endY + 6;
  for (const r of rows) {
    text(r[0], margin, yy);
    text(r[1], 520, yy);
    yy += 20;
  }
  textSize(20);
  fill(ok ? 'darkgreen' : 'darkred');
  text('判定：' + (ok ? '装得下，余 ' + (budget - total).toFixed(1) + ' GB'
                     : '装不下，超 ' + (total - budget).toFixed(1) + ' GB'), margin, yy);
  fill('black');
}

function drawTable(top) {
  const xs = [28, 56, 90, 200, 260, 340, 430, 520, 600, 690];
  const heads = ['序号', '模型', '量化', '上下文', '并发', '权重', 'KV合计', '开销', '显存合计', '你的判定'];
  textSize(13);
  textStyle(BOLD);
  for (let i = 0; i < heads.length; i++) text(heads[i], xs[i], top);
  stroke(200);
  line(margin, top + 18, canvasWidth - margin, top + 18);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < CONFIGS.length; i++) {
    const c = CONFIGS[i];
    const y = top + 26 + i * 24;
    text(String(c.no), xs[0], y);
    text(c.model, xs[1], y);
    text(c.quant, xs[2], y);
    text(String(c.ctx), xs[3], y);
    text(c.conc + ' 路', xs[4], y);
    text(c.w.toFixed(1), xs[5], y);
    text(c.kv.toFixed(1), xs[6], y);
    text(c.oh.toFixed(1), xs[7], y);
    fill(c.total <= c.budget ? 'darkgreen' : 'darkred');
    text(c.total.toFixed(1) + ' / ' + c.budget.toFixed(1), xs[8], y);
    fill('black');
    const lk = locked['c' + c.no];
    if (lk) {
      fill(lk.ok ? 'darkgreen' : 'darkred');
      text((lk.ok ? '✓ ' : '✗ ') + lk.pick, xs[9], y);
      fill('black');
    } else { fill(130); text('待判定', xs[9], y); fill('black'); }
  }

  textSize(12);
  fill(120);
  const cpl12 = Math.max(16, Math.floor((canvasWidth - margin * 2) / 12));
  drawWrapped('本块的六条判定全部使用单卡预算口径 72.0 GB（序号 2 的 144.0 GB 是 13B INT8 两卡口径，' +
    '在本块内记为装得下、余 101.5 GB）。序号 3 与序号 5 的显存合计完全相同，因为 KV 只看「并发 × 上下文」的乘积：' +
    '32 路配 4,096 与 16 路配 8,192 乘积一样。', margin, top + 26 + CONFIGS.length * 24 + 6, cpl12, 16);
}

function drawFeedback(top) {
  const cpl = charsPerLine();
  let y = top;
  textSize(14);
  fill('black');

  const lk = locked['final'];
  if (lk) {
    fill(lk.ok ? 'darkgreen' : 'darkred');
    text(lk.ok
      ? '序号 4，7B FP16、4,096 上下文、24 路，68.2 GB 对 72.0 GB 预算。'
      : '只有序号 2 和序号 4 装得下，而序号 2 是 13B INT8、并发只有 16 路且质量掉 0.01；本章基线选序号 4。',
      margin, y);
    fill('black');
    y += 22;
  } else {
    fill(110);
    text('逐条提交装得下 / 装不下判定，再提交最终「并发 ≥ 16 路且装得下」的那一组；判定锁定后才揭晓。',
         margin, y);
    y += 22;
  }

  const curKey = itemSel.value();
  if (curKey !== 'final') {
    const c = CONFIGS[parseInt(curKey.slice(1), 10) - 1];
    const l = locked[curKey];
    if (l) {
      y = drawWrapped('序号 ' + c.no + '（' + l.pick + '）：' +
        (l.ok ? '判定正确：' + (c.fits ? '装得下' : '装不下') + '。'
              : '先分开算权重与 KV，KV 等于并发乘上下文乘每 token 字节数，再加 10% 开销。') +
        (revealed ? '显存合计 ' + c.total.toFixed(1) + ' GB 对预算 ' + c.budget.toFixed(1) + ' GB。' : '') +
        c.fb, margin, y, cpl, 18) + 6;
    }
  }

  if (revealed) {
    fill(30);
    const nc = CONFIGS.filter(c => locked['c' + c.no] && locked['c' + c.no].ok).length;
    text('判定答对 ' + nc + ' / 6，选型答对 ' + (lk && lk.ok ? 1 : 0) + ' / 1', margin, y + 4);
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('模型', 10, drawHeight + 15);
  text('量化', 150, drawHeight + 15);
  text('上下文', 310, drawHeight + 15);
  text('并发路数: ' + concSlider.value(), 10, drawHeight + 50);
  text('判定项 →', 10, drawHeight + 88);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitVerdict() {
  if (revealed) return;
  const key = itemSel.value();
  const pick = valRadio.value();
  let ok;
  if (key === 'final') {
    const m = /^序号 (\d+)/.exec(pick);
    ok = !!m && parseInt(m[1], 10) === FINAL_ANSWER;
  } else {
    const c = CONFIGS[parseInt(key.slice(1), 10) - 1];
    ok = pick === (c.fits ? '装得下' : '装不下');
  }
  locked[key] = { pick: pick, ok: ok };
  let n = 0;
  for (const c of CONFIGS) if (locked['c' + c.no]) n++;
  if (n === CONFIGS.length && locked['final']) revealed = true;
}

function resetAll() {
  locked = {};
  revealed = false;
  itemSel.value('c1');
  refreshRadio();
  modelSel.value('7B');
  quantSel.value('FP16');
  ctxSel.selected('4096');
  concSlider.value(24);
}

function windowResized() {
  updateCanvasSize();
  resizeCanvas(canvasWidth, canvasHeight);
}

function updateCanvasSize() {
  const container = document.querySelector('main');
  if (container) {
    canvasWidth = container.offsetWidth;
    // setup() 的第一句会调用本函数，那时滑块尚未创建，必须守卫
    if (typeof concSlider !== 'undefined' && concSlider) {
      concSlider.size(canvasWidth - sliderLeftMargin - margin);
    }
  }
}

function charsPerLine() {
  return Math.max(16, Math.floor((canvasWidth - margin * 2) / 14));
}

function wrapCJK(str, n) {
  const out = [];
  let line = '';
  for (const ch of String(str)) {
    line += ch;
    if (line.length >= n) { out.push(line); line = ''; }
  }
  if (line) out.push(line);
  return out;
}

function drawWrapped(str, x, y, n, lineH) {
  noStroke();
  const lines = wrapCJK(str, n);
  for (let i = 0; i < lines.length; i++) text(lines[i], x, y + i * lineH);
  return y + lines.length * lineH;
}