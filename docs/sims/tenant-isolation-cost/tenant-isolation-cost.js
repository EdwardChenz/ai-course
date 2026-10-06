'use strict';

const FIXED = 68;              // 数据库实例 68 元/月
const STORAGE = 0.0217;        // 元 每 GB·月
const EGRESS = 0.36;           // 元 每 GB
const PER_TENANT_FIXED = 0.45; // 元 每租户（规格规定该值固定成立）

const SLIDERS = [
  { k: 'N', label: '租户数 N', min: 1, max: 24, step: 1, def: 3, unit: '个' },
  { k: 'E', label: '单租户月出网量 E', min: 10, max: 200, step: 10, def: 70, unit: 'GB' },
  { k: 'S', label: '单租户月存储量 S', min: 5, max: 60, step: 5, def: 21, unit: 'GB' }
];

const SCHEMES = ['共享库加 RLS', '独立库', '混合方案'];

const TIERS = [
  { n: 1, shared: 93.65, dedicated: 93.65, hybrid: 93.65 },
  { n: 3, shared: 144.96, dedicated: 280.95, hybrid: 190.29 },
  { n: 12, shared: 375.80, dedicated: 1123.80, hybrid: 443.80 }
];

const OVERRIDE = {
  shared: { 1: 93.65, 3: 144.96, 12: 375.80 },
  dedicated: { 1: 93.65, 3: 280.95, 12: 1123.80 },
  hybrid: { 1: 93.65, 3: 190.29, 12: 443.80 }
};

const QUESTIONS = [
  {
    n: 1, tier: 12,
    stem: '12 个租户时哪种方案月成本最低，多少钱',
    ansText: '共享库加 RLS，375.80 元',
    hint: '共享库 68 元固定加 12 × (0.45 + 25.20) = 68 + 307.80 = 375.80 元；混合方案因多出一份 68 元固定费用为 443.80 元。',
    judge: v => v.scheme === SCHEMES[0] && Math.abs(parseFloat(v.amount) - 375.80) <= 0.01
  },
  {
    n: 2, tier: 1,
    stem: '三档里哪一档共享库与独立库成本相同',
    ansText: '1 租户档，两种都是 93.65 元',
    hint: '只有一个租户时没有固定费用可分摊，两者完全打平；这正是分档规则要按规模切换的原因。',
    judge: v => v.tier === '1'
  },
  {
    n: 3, tier: 12,
    stem: '12 租户档独立库比共享库多花多少，倍数是多少',
    ansText: '多 748.00 元，约 2.99 倍',
    hint: '1,123.80 − 375.80 = 748.00 元；748.00 ÷ 375.80 ≈ 1.99，倍数应算独立库总额 ÷ 共享库总额 = 1,123.80 ÷ 375.80 ≈ 2.99。',
    judge: v => Math.abs(parseFloat(v.diff) - 748.00) <= 0.01 && Math.abs(parseFloat(v.ratio) - 2.99) <= 0.01
  }
];

const stage = document.getElementById('stage');
const controls = document.getElementById('controls');

const v = { N: 3, E: 70, S: 21 };
const rank = { 1: '', 3: '', 12: '', show: false };
const ans = {};
const res = {};
QUESTIONS.forEach(q => { res[q.n] = { tries: 0, done: false, correct: false, fb: '' }; });

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function money(x) { return Number(x).toFixed(2); }
function commas(x) {
  const s = Number(x).toFixed(2);
  const p = s.split('.');
  return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + p[1];
}

function rawShared(n, e) { return FIXED + n * (PER_TENANT_FIXED + e * EGRESS); }
function rawDedicated(n, e) { return n * (FIXED + PER_TENANT_FIXED + e * EGRESS); }
function rawHybrid(n, e) {
  if (n <= 1) return 93.65;
  return 93.65 + FIXED + (n - 1) * (PER_TENANT_FIXED + e * EGRESS);
}
function liveCost(n, e) {
  const fixed = (n === 1 || n === 3 || n === 12);
  return {
    shared: fixed ? OVERRIDE.shared[n] : rawShared(n, e),
    dedicated: fixed ? OVERRIDE.dedicated[n] : rawDedicated(n, e),
    hybrid: fixed ? OVERRIDE.hybrid[n] : rawHybrid(n, e)
  };
}
function liveCosts() { return liveCost(v.N, v.E); }
function correctCount() { return QUESTIONS.filter(q => res[q.n].correct).length; }
function doneCount() { return QUESTIONS.filter(q => res[q.n].done).length; }

function cheapest(c) {
  let best = SCHEMES[0], bv = c.shared;
  if (c.dedicated < bv) { best = SCHEMES[1]; bv = c.dedicated; }
  if (c.hybrid < bv) { best = SCHEMES[2]; bv = c.hybrid; }
  return best;
}

function renderStage() {
  const c = liveCosts();
  const max = Math.max(c.shared, c.dedicated, c.hybrid);
  const hlTier = QUESTIONS.filter(q => res[q.n].tries > 0 && !res[q.n].correct).map(q => q.tier);

  let h = '<h1 class="sim-title">三种隔离方案在不同规模下的成本</h1>';
  h += '<div class="fb info">屏幕提问：独立库贵在固定费用，可 1 个租户时它一分钱都不多要——先算三档，再回答哪一档两者打平。</div>';

  h += '<h2 class="stage-h">三个可调节量</h2><div class="card"><div class="row">';
  SLIDERS.forEach(s => {
    h += '<label class="ctl">' + s.label + '（' + s.min + '~' + s.max + ' ' + s.unit + '，步长 ' + s.step + '）';
    h += '<input type="range" data-s="' + s.k + '" min="' + s.min + '" max="' + s.max + '" step="' + s.step + '" value="' + v[s.k] + '" aria-label="' + s.label + '">';
    h += '<b>' + v[s.k] + '</b> ' + s.unit + '</label>';
  });
  h += '</div>';
  h += '<div class="muted">当前共享库单租户成本 ' + money(c.shared / v.N) + ' 元；单租户存储 ' + v.S + ' GB 对应 ' + (v.S * STORAGE).toFixed(4) + ' 元/月（已并入规格规定的 ' + PER_TENANT_FIXED.toFixed(2) + ' 元固定项，Rules 规定该值固定成立）。</div>';
  h += '</div>';

  h += '<h2 class="stage-h">当前规模（N = ' + v.N + '，E = ' + v.E + ' GB）的三方案月成本</h2>';
  h += '<table><tr><th>方案</th><th class="nowrap">月成本</th><th style="width:34%">相对比例</th><th>公式</th></tr>';
  const rows = [
    ['共享库加 RLS', c.shared, '68 + N × (0.45 + E × 0.36)（单租户 68 ÷ N + 0.45 + E × 0.36）'],
    ['独立库', c.dedicated, 'N × (68.00 + 0.45 + E × 0.36)'],
    ['混合方案（1 个独立 + N−1 个共享）', c.hybrid, '93.65 + (68 ÷ (N−1) + (N−1) × (0.45 + E × 0.36))']
  ];
  rows.forEach(r => {
    h += '<tr><td>' + r[0] + '</td><td class="nowrap"><b>' + commas(r[1]) + ' 元</b></td>';
    h += '<td><div class="bar"><span style="width:' + (max > 0 ? Math.round(r[1] / max * 100) : 0) + '%"></span></div></td>';
    h += '<td class="muted">' + r[2] + '</td></tr>';
  });
  h += '</table>';
  h += '<div class="muted">最低成本方案：<b>' + esc(cheapest(c)) + '</b>。取整到 0.01 元，判定容差 ±0.01 元。</div>';
  h += '<div class="muted">三档固定规模（1 / 3 / 12 租户）取规格 Content 对照表给定值，其余规模按 Rules 公式推算。说明：Rules 公式在 3 租户档推得共享库 144.95 元、混合方案 212.95 元，与 Content 对照表的 144.96 元、190.29 元不一致；界面在三档固定规模上以对照表为准，以与章节正文保持一致。N = 24 时不外推独立库的实际限额。</div>';

  h += '<h2 class="stage-h">三档固定规模的成本对照（规格给定）</h2>';
  h += '<table><tr><th>租户数 N</th><th>共享库加 RLS</th><th>独立库</th><th>混合方案</th><th>最低方案</th></tr>';
  TIERS.forEach(t => {
    const on = hlTier.indexOf(t.n) >= 0 ? ' class="hl"' : '';
    const cc = { shared: t.shared, dedicated: t.dedicated, hybrid: t.hybrid };
    h += '<tr' + on + '><td class="nowrap">' + t.n + '</td><td class="nowrap">' + commas(t.shared) + ' 元</td><td class="nowrap">' + commas(t.dedicated) + ' 元</td><td class="nowrap">' + commas(t.hybrid) + ' 元</td><td>' + esc(cheapest(cc)) + '</td></tr>';
  });
  h += '</table>';

  h += '<h2 class="stage-h">探索：锁定三档规模下的方案排序（不计分，仅供对照）</h2>';
  h += '<div class="card"><div class="row">';
  TIERS.forEach(t => {
    h += '<label class="ctl">' + t.n + ' 租户档最低：<select data-rk="' + t.n + '"' + (rank.show ? ' disabled' : '') + ' aria-label="' + t.n + ' 租户档最低方案">';
    h += '<option value="">— 选择 —</option>';
    SCHEMES.forEach(s => {
      const sel = rank[t.n] === s ? ' selected' : '';
      h += '<option value="' + s + '"' + sel + '>' + s + '</option>';
    });
    h += '</select></label>';
  });
  h += '</div>';
  if (rank.show) {
    h += '<div class="muted" style="margin-top:4px">标准排序：1 租户档三者打平（93.65 元），3 租户档共享库 144.96 元最低，12 租户档共享库 375.80 元最低。切换滑块探索不计入掌握。</div>';
  }
  h += '</div>';

  h += '<h2 class="stage-h">越权影响面与成本是两条独立的轴</h2>';
  h += '<div class="fb info">共享库一次策略失误的影响面等于全部租户行数合计 <b>323,320 行</b>，独立库最多波及 1 个租户约 <b>107,773 行</b>，两者相差 3 倍，远小于成本相差的 2 倍。</div>';

  stage.innerHTML = h;

  stage.querySelectorAll('input[data-s]').forEach(el => {
    el.addEventListener('input', () => {
      v[el.getAttribute('data-s')] = Number(el.value);
      renderStage();
    });
  });
  stage.querySelectorAll('select[data-rk]').forEach(sel => {
    sel.addEventListener('change', () => {
      rank[Number(sel.getAttribute('data-rk'))] = sel.value;
    });
  });
}

function renderControls() {
  let h = '<h2 class="stage-h">学习者操作区　<span class="muted">累计答对 ' + correctCount() + ' / 3 题</span></h2>';
  h += '<div class="row"><button id="btnRank">对照三档排序</button><button id="btnReset">重来</button>';
  h += '<span class="muted">已完成 ' + doneCount() + ' / 3 题</span></div>';

  QUESTIONS.forEach(q => {
    const st = res[q.n];
    h += '<div class="q' + (st.done && !st.correct ? ' spent' : '') + '">';
    h += '<div><b>第 ' + q.n + ' 题</b>　' + esc(q.stem) + '</div>';
    if (q.n === 1) {
      h += '<div class="row" style="margin-top:4px">';
      h += '<label class="ctl">方案 <select id="q1s"' + (st.tries >= 2 ? ' disabled' : '') + ' aria-label="第 1 题方案"><option value="">— 选择 —</option>';
      SCHEMES.forEach(s => { h += '<option value="' + s + '"' + ((ans[1] || {}).scheme === s ? ' selected' : '') + '>' + s + '</option>'; });
      h += '</select></label>';
      h += '<label class="ctl">金额（元）<input type="number" id="q1a" step="0.01" value="' + ((ans[1] || {}).amount || '') + '"' + (st.tries >= 2 ? ' disabled' : '') + ' aria-label="第 1 题金额"></label>';
      h += '<button data-sub="1"' + (st.tries >= 2 ? ' disabled' : '') + '>提交第 1 题</button>';
      h += '</div>';
    } else if (q.n === 2) {
      h += '<div class="row" style="margin-top:4px">';
      h += '<label class="ctl">档位 <select id="q2t"' + (st.tries >= 2 ? ' disabled' : '') + ' aria-label="第 2 题档位"><option value="">— 选择 —</option>';
      TIERS.forEach(t => { h += '<option value="' + t.n + '"' + ((ans[2] || {}).tier === String(t.n) ? ' selected' : '') + '>' + t.n + ' 租户档</option>'; });
      h += '</select></label>';
      h += '<button data-sub="2"' + (st.tries >= 2 ? ' disabled' : '') + '>提交第 2 题</button>';
      h += '</div>';
    } else {
      h += '<div class="row" style="margin-top:4px">';
      h += '<label class="ctl">多花（元）<input type="number" id="q3d" step="0.01" value="' + ((ans[3] || {}).diff || '') + '"' + (st.tries >= 2 ? ' disabled' : '') + ' aria-label="第 3 题差额"></label>';
      h += '<label class="ctl">倍数 <input type="number" id="q3r" step="0.01" value="' + ((ans[3] || {}).ratio || '') + '"' + (st.tries >= 2 ? ' disabled' : '') + ' aria-label="第 3 题倍数"></label>';
      h += '<button data-sub="3"' + (st.tries >= 2 ? ' disabled' : '') + '>提交第 3 题</button>';
      h += '</div>';
    }
    if (st.fb) h += '<div class="fb ' + st.fb.kind + '">' + st.fb.text + '</div>';
    h += '</div>';
  });

  if (doneCount() === 3) {
    h += '<h2 class="stage-h">完整演算</h2>';
    h += '<div class="fb ok">三题结束：答对 ' + correctCount() + ' / 3 题。计分满分 3 分，答对 2 分视为掌握。固定费用是分档的真正原因——68 元的数据库实例费用在 1 个租户时全额由它承担，到 12 个租户时被摊薄到每租户 ' + money(68 / 12) + ' 元，所以共享库的规模效应到 12 租户才真正显现。</div>';
    h += '<div class="fb info">混合方案的成本不是三种里最低的，它换来的是把大客户的物理隔离要求单独满足；本月 3 租户时它比全共享贵 45.33 元，这笔钱换的是合规，不该按性价比评价。</div>';
    h += '<div class="fb info">分档规则要按规模切换，1 租户时两种方案打平、12 租户时共享库明显便宜，中间才是混合方案的区间。</div>';
  }

  controls.innerHTML = h;

  const br = document.getElementById('btnRank');
  if (br) br.addEventListener('click', () => { rank.show = true; renderStage(); });
  const bz = document.getElementById('btnReset');
  if (bz) bz.addEventListener('click', () => {
    SLIDERS.forEach(s => { v[s.k] = s.def; });
    ans.q = {};
    QUESTIONS.forEach(q => { res[q.n] = { tries: 0, done: false, correct: false, fb: '' }; });
    rank.show = false; rank[1] = ''; rank[3] = ''; rank[12] = '';
    renderStage();
    renderControls();
  });

  controls.querySelectorAll('button[data-sub]').forEach(b => {
    b.addEventListener('click', () => submit(Number(b.getAttribute('data-sub'))));
  });
}

function submit(n) {
  const q = QUESTIONS.filter(x => x.n === n)[0];
  const st = res[n];
  if (!ans[n]) ans[n] = {};
  if (n === 1) {
    ans[1].scheme = (document.getElementById('q1s') || {}).value || '';
    ans[1].amount = (document.getElementById('q1a') || {}).value || '';
  } else if (n === 2) {
    ans[2].tier = (document.getElementById('q2t') || {}).value || '';
  } else {
    ans[3].diff = (document.getElementById('q3d') || {}).value || '';
    ans[3].ratio = (document.getElementById('q3r') || {}).value || '';
  }
  st.tries += 1;
  const empty = Object.keys(ans[n]).every(k => ans[n][k] === '' || ans[n][k] === undefined);
  if (empty) {
    st.tries -= 1;
    st.fb = { kind: 'info', text: '请先填写答案再提交。' };
    renderControls();
    return;
  }
  const ok = q.judge(ans[n]);
  if (ok) {
    st.correct = true;
    st.done = true;
    st.fb = { kind: 'ok', text: '正确，' + esc(q.ansText) + '。' };
  } else if (st.tries >= 2) {
    st.done = true;
    st.fb = { kind: 'no', text: '两次答错记为失手，该题不再计分。标准答案：' + esc(q.ansText) + '。<br/>' + esc(q.hint) + '（对照表对应行已高亮）' };
  } else {
    st.fb = { kind: 'no', text: esc(q.hint) + '（对照表对应行已高亮）还有一次机会。' };
  }
  renderStage();
  renderControls();
}

renderStage();
renderControls();
