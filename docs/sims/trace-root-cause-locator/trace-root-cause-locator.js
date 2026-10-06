// Trace 根因定位判定器 — Trace Root Cause Locator
// 教学目标：根据六条失败 trace 的 span 观测值判定每条的第一个出错环节，
// 并说出该层对应的首要动作；六条判定全部命中才算掌握。
// 规格来源：docs/chapters/11-observability-eval/index.md 的 trace-root-cause-locator 规格块

// ---- 布局计算（先算再写码）----
// 控件清单：2 个下拉框（判定项 + 判定值）+ 2 个按钮，共 2 行
// controlHeight = (2 * 35) + 10 = 80
// drawHeight = 660；canvasHeight = 660 + 80 = 740；iframeHeight = 742
// 行分配：第 1 行判定项下拉框 / 第 2 行判定值下拉框 + 按钮

let canvasWidth = 800;
let drawHeight = 660;
let controlHeight = 80;
let canvasHeight = drawHeight + controlHeight;
let margin = 25;
let defaultTextSize = 16;

// ---- 四层归因（规格块 Rules 的顺序短路顺序）----
const LAYERS = ['检索未召回', '重排', '上下文压缩', '生成没答对'];

// ---- 六条失败 trace（规格块 Content 表）----
const TRACES = [
  {
    no: 1,
    obs: 'retrieval 稀疏返回 20 条、稠密返回 20 条，融合后 26 条候选里没有 gold；rerank top5 为候选第 2 到 6 位',
    layer: '检索未召回',
    action: '先查知识库有没有这份资料：库里有就改查询与嵌入，没就排期补文档',
    fb: 'gold 块连候选池都没进，问题发生在检索之前，换生成模型毫无意义；先做知识库覆盖自查，因为这类里通常一半以上是库里根本没有这份资料。'
  },
  {
    no: 2,
    obs: 'gold 在融合候选第 14 位；rerank top5 里没有它；rerank 打分显示该块 0.31，低于当前 top5 门槛 0.44',
    layer: '重排',
    action: '换更小的重排模型或调 TopK，并按打分复核 0.44 这个门槛是否偏高',
    fb: 'gold 块确实被召回了，是重排模型用 0.31 分把它判死，而当前 top5 的门槛高达 0.44——门槛定得太挑剔是重排类失效最常见的根因。'
  },
  {
    no: 3,
    obs: 'gold 是 rerank top5 的第 2 位，打分 0.81；context_compress 输出 4 段共 1,802 token，gold 不在其中',
    layer: '上下文压缩',
    action: '把压缩预算从 1,800 提到 2,400 token，或按重排分数保护前 2 段',
    fb: '最隐蔽的一类：gold 的重排分高达 0.81，压缩时却因为 token 预算 1,800 被挤掉，证据走到了门口又被打发走了。'
  },
  {
    no: 4,
    obs: 'gold 是 rerank top5 第 1 位，压缩后保留了它；答案引用了 [1] 但结论与资料相反',
    layer: '生成没答对',
    action: '改提示词约束并加断言校验，不要动检索',
    fb: '与序号 5 的区别在于方向相反：4 是有证据但答错，要加断言校验。'
  },
  {
    no: 5,
    obs: 'gold 在 rerank top5 第 3 位且压缩保留；答案未引用任何编号，直接输出「资料中未提及」',
    layer: '生成没答对',
    action: '校准拒答阈值：这条是过拒，改提示词让它先尝试作答',
    fb: '5 是证据充分却拒答，要调的是拒答阈值而不是检索。'
  },
  {
    no: 6,
    obs: 'retrieval 的稀疏与稠密两个子 span 都返回 0 条；trace 里记录 embed_service_status: timeout，降级逻辑返回空数组',
    layer: '检索未召回',
    action: '查嵌入服务可用性与降级策略，这是依赖故障，不是索引问题',
    fb: '全章唯一一条系统故障伪装成质量问题的情况，降级逻辑把超时吞成空数组，正确做法是让降级时打一条 error 事件并让该 trace 立刻进入排查队列。'
  }
];

const ITEMS = [];
TRACES.forEach(t => ITEMS.push({ key: 'L' + t.no, kind: 'layer', no: t.no }));
TRACES.forEach(t => ITEMS.push({ key: 'A' + t.no, kind: 'action', no: t.no }));

const VALUE_OPTIONS = LAYERS.concat(TRACES.map(t => '动作：' + t.action));

const DISTRIBUTION = '34 道错题的四层分布：检索未召回 15 道（44.1%）、重排 11 道（32.4%）、' +
  '上下文压缩 3 道（8.8%）、生成没答对 5 道（14.7%）；检索与重排两层合计 76.5%；' +
  '重排可当天修复的 14 道占错题 41.2%。';

let itemSel, valSel;
let submitBtn, resetBtn;

let locked = {};
let revealed = false;

function setup() {
  updateCanvasSize(); // 必须是 setup 的第一句
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.parent(document.querySelector('main')); // 绝不能用 canvas.parent('main')

  itemSel = createSelect();
  itemSel.parent(document.querySelector('main'));
  itemSel.position(110, drawHeight + 5);
  itemSel.size(320);
  for (const t of TRACES) {
    itemSel.option('归因层 · 序号 ' + t.no, 'L' + t.no);
  }
  for (const t of TRACES) {
    itemSel.option('首要动作 · 序号 ' + t.no, 'A' + t.no);
  }
  itemSel.attribute('aria-label', '判定项');
  itemSel.changed(refreshValues);

  valSel = createSelect();
  valSel.parent(document.querySelector('main'));
  valSel.position(110, drawHeight + 40);
  valSel.size(canvasWidth - 370);
  refreshValues();

  submitBtn = createButton('提交判定');
  submitBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  submitBtn.position(canvasWidth - 250, drawHeight + 40);
  submitBtn.mousePressed(submitJudge);

  resetBtn = createButton('重来');
  resetBtn.parent(document.querySelector('main')); // 所有控件必须挂到 <main> 上
  resetBtn.position(canvasWidth - 150, drawHeight + 40);
  resetBtn.mousePressed(resetAll);

  describe('交互式根因定位器：六条失败 trace 的 span 观测值。逐条判定第一个出错环节，' +
    '再逐条选出该层对应的首要动作，全部锁定后揭晓。');
}

function refreshValues() {
  const it = currentItem();
  const opts = it.kind === 'layer' ? LAYERS : VALUE_OPTIONS.filter(v => v.indexOf('动作：') === 0);
  if (typeof valSel !== 'undefined' && valSel) valSel.remove();
  valSel = createSelect();
  valSel.parent(document.querySelector('main'));
  valSel.position(110, drawHeight + 40);
  valSel.size(canvasWidth - 370);
  for (const o of opts) valSel.option(o, o);
  valSel.attribute('aria-label', '判定值');
  if (typeof submitBtn !== 'undefined' && submitBtn) {
    submitBtn.position(canvasWidth - 250, drawHeight + 40);
    resetBtn.position(canvasWidth - 150, drawHeight + 40);
  }
}

function currentItem() {
  const k = itemSel.value();
  return ITEMS.filter(i => i.key === k)[0];
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
  text('Trace 根因定位判定器', canvasWidth / 2, 10);
  textAlign(LEFT, TOP);
  textSize(defaultTextSize);

  drawRule(44);
  drawTable(86);
  drawFeedback(404);
  drawControls();
}

function drawRule(y) {
  fill(60);
  textSize(14);
  drawWrapped('判定规则按顺序短路：gold 不在 retrieval 候选中 → 检索未召回；在候选但不在 rerank top5 → 重排；' +
    '在 top5 但不在 compressed 输出 → 上下文压缩；三处都在 → 生成没答对。打分 ≥ 0.44 进入 top5，低于则排除。',
    margin, y, charsPerLine(), 18);
  fill('black');
}

function drawTable(top) {
  const cur = currentItem();
  const cpl = charsPerLine();
  textSize(13);
  textStyle(BOLD);
  text('序号', 28, top);
  text('trace 观测（span 字段）', 66, top);
  text('你的归因层', 470, top);
  text('你的动作', 580, top);
  stroke(200);
  line(margin, top + 18, canvasWidth - margin, top + 18);
  noStroke();
  textStyle(NORMAL);

  for (let i = 0; i < TRACES.length; i++) {
    const t = TRACES[i];
    const y = top + 24 + i * 48;
    const isCur = cur.no === t.no;
    if (isCur) { fill(235, 240, 255); rect(20, y - 3, canvasWidth - 45, 46); fill('black'); }
    text(String(t.no), 28, y);
    drawWrapped(t.obs, 66, y, Math.floor((canvasWidth - 480) / 13), 16);

    const lk = locked['L' + t.no];
    if (lk) {
      fill(lk.ok ? 'darkgreen' : 'darkred');
      text((lk.ok ? '✓ ' : '✗ ') + (lk.ok ? lk.pick : lk.pick), 470, y);
      fill('black');
    } else { fill(130); text(isCur && cur.kind === 'layer' ? '▼ 待判定' : '待判定', 470, y); fill('black'); }

    const ak = locked['A' + t.no];
    if (ak) {
      fill(ak.ok ? 'darkgreen' : 'darkred');
      text(ak.ok ? '✓ 匹配' : '✗ 未匹配', 580, y);
      fill('black');
    } else { fill(130); text(isCur && cur.kind === 'action' ? '▼ 待判定' : '待判定', 580, y); fill('black'); }

    textSize(11);
    fill(140);
    text('首个出错环节：' + t.layer, 66, y + 32);
    fill('black');
    textSize(13);
  }
}

function drawFeedback(top) {
  const cpl = charsPerLine();
  let y = top;
  textSize(14);
  fill('black');
  const cur = currentItem();
  text('当前判定项：' + (cur.kind === 'layer' ? '归因层 · 序号 ' + cur.no : '首要动作 · 序号 ' + cur.no) +
       '　|　进度：归因层 ' + TRACES.filter(t => locked['L' + t.no]).length + '/6，动作 ' +
       TRACES.filter(t => locked['A' + t.no]).length + '/6', margin, y);
  y += 24;

  const t = TRACES[cur.no - 1];
  const k = cur.kind === 'layer' ? 'L' + cur.no : 'A' + cur.no;
  const lk = locked[k];
  if (lk) {
    fill(lk.ok ? 'darkgreen' : 'darkred');
    text((cur.kind === 'layer' ? (lk.ok ? '判定正确：' + t.layer : '按 retrieval → rerank → compressed → generation 顺序短路，找 gold 第一次消失的环节')
                              : (lk.ok ? '动作正确：' + t.action : '展示该条 trace 的 span 字段，指明是哪个字段否定了你的假设')),
         margin, y);
    fill('black');
    y += 22;
  }
  y = drawWrapped(t.fb, margin, y, cpl, 18) + 6;

  if (revealed) {
    fill(30);
    const nl = TRACES.filter(x => locked['L' + x.no] && locked['L' + x.no].ok).length;
    const na = TRACES.filter(x => locked['A' + x.no] && locked['A' + x.no].ok).length;
    text('判定答对 ' + nl + ' / 6，动作答对 ' + na + ' / 6', margin, y);
    y += 22;
    y = drawWrapped('序号 1 与 6 标签相同（检索未召回）但动作完全不同：1 多半是知识库覆盖不足，' +
      '6 是嵌入服务超时后降级逻辑返回空数组的依赖故障。标签对了还不够，还要能往下再分一层。',
      margin, y, cpl, 18) + 6;
    drawWrapped(DISTRIBUTION, margin, y, cpl, 18);
  } else {
    fill(110);
    drawWrapped('十二项判定全部锁定后才揭晓；每项一次提交，不必重答。', margin, y, cpl, 18);
  }
}

function drawControls() {
  fill('black');
  noStroke();
  textAlign(LEFT, CENTER); // 控件区标签按行垂直居中，避免压住 HTML 控件
  textSize(14);
  text('判定项 →', 10, drawHeight + 15);
  text('判定值 →', 10, drawHeight + 50);
  textAlign(LEFT, TOP); // 还原为顶端对齐

}

function submitJudge() {
  if (revealed) return;
  const it = currentItem();
  const pick = valSel.value();
  const t = TRACES[it.no - 1];
  const ok = it.kind === 'layer' ? pick === t.layer : pick === '动作：' + t.action;
  locked[it.key] = { pick: pick, ok: ok };
  if (Object.keys(locked).length === ITEMS.length) revealed = true;
}

function resetAll() {
  locked = {};
  revealed = false;
  itemSel.value('L1');
  refreshValues();
}

function windowResized() {
  updateCanvasSize();
  resizeCanvas(canvasWidth, canvasHeight);
}

function updateCanvasSize() {
  const container = document.querySelector('main');
  if (container) {
    canvasWidth = container.offsetWidth;
    // setup() 的第一句会调用本函数，那时控件尚未创建，必须守卫
    if (typeof itemSel !== 'undefined' && itemSel) {
      itemSel.size(Math.min(320, canvasWidth - 130));
      if (valSel) valSel.size(Math.max(200, canvasWidth - 370));
      if (submitBtn) submitBtn.position(canvasWidth - 250, drawHeight + 40);
      if (resetBtn) resetBtn.position(canvasWidth - 150, drawHeight + 40);
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