'use strict';

const STAGES = [
  { k: 'verify', t: '证据校验', d: '抽取事实必须在原文命中' },
  { k: 'stable', t: '稳定性判定', d: 'volatile 且置信度低于阈值才丢弃' },
  { k: 'route', t: '落点路由', d: '长期记忆 / 画像 / 空' },
  { k: 'overwrite', t: '显式覆盖', d: '旧值进 _superseded 留痕' }
];

const CANDS = [
  { n: 1, fact: '用户所在部门是华东销售二部', evidence: '是', stability: 'stable', conf: 0.95, field: 'dept' },
  { n: 2, fact: '用户偏好先给结论再看明细', evidence: '是', stability: 'stable', conf: 0.88, field: 'output_style' },
  { n: 3, fact: '用户今天心情不太好', evidence: '是', stability: 'volatile', conf: 0.55, field: '' },
  { n: 4, fact: '工单 SO-2024-0917 属于用户负责的区域', evidence: '是', stability: 'stable', conf: 0.92, field: 'account_scopes' }
];

const PROFILE_FIELDS = ['dept', 'output_style'];
const PROFILE_TOTAL = 18;

const Q4_OPTIONS = [
  { v: 'biz', t: '它的 profile_field 指向业务归属而非人的属性' },
  { v: 'conf', t: '因为它置信度 0.92 很高，所以可以直接回填画像' },
  { v: 'is18', t: '因为 account_scopes 属于 18 个画像字段之一' },
  { v: 'both', t: '因为它同时稳定且置信度高，应当补进画像' }
];

const QUESTIONS = [
  { n: 1, stem: '哪条候选被丢弃' },
  { n: 2, stem: '几条候选写入长期记忆' },
  { n: 3, stem: '哪两个画像字段被覆盖更新' },
  { n: 4, stem: '序号 4 为什么不进画像' }
];

const stage = document.getElementById('stage');
const controls = document.getElementById('controls');

let threshold = 0.60;
const ans = {};
const res = {};
QUESTIONS.forEach(q => { res[q.n] = { tries: 0, done: false, correct: false, fb: '' }; });
const state = { locked: false };

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function dropped() {
  return CANDS.filter(c => c.stability === 'volatile' && c.conf < threshold - 1e-9);
}
function kept() { return CANDS.filter(c => dropped().indexOf(c) < 0); }
function correctCount() { return QUESTIONS.filter(q => res[q.n].correct).length; }
function q1ans() { return dropped().length === 0 ? 'none' : 'n' + dropped()[0].n; }
function q1text() {
  const d = dropped();
  return d.length === 0 ? '没有候选被丢弃' : '序号 ' + d[0].n;
}
function q2ans() { return String(kept().length); }
function q2text() { return kept().length + ' 条'; }

function renderStage() {
  let h = '<h1 class="sim-title">记忆写入与回填闭环</h1>';
  h += '<div class="fb info">屏幕提问：四条候选里只有一条被丢掉，而置信度最高的那条偏偏不进画像——先写下四项判定，再看落点。</div>';

  h += '<h2 class="stage-h">四个阶段（固定顺序不可换）</h2><div class="flow">';
  STAGES.forEach((s, i) => {
    h += '<div class="node' + (state.locked ? ' on' : '') + '"><b>' + (i + 1) + '. ' + s.t + '</b><br/><span class="muted">' + s.d + '</span></div>';
    if (i < STAGES.length - 1) h += '<div class="arrow">→</div>';
  });
  h += '</div>';

  h += '<h2 class="stage-h">置信度阈值（可调，步长 0.05）</h2><div class="card"><div class="row">';
  h += '<label class="ctl">阈值 <input type="range" id="thr" min="0.50" max="0.95" step="0.05" value="' + threshold.toFixed(2) + '" aria-label="置信度阈值">';
  h += '<b>' + threshold.toFixed(2) + '</b></label>';
  h += '<span class="muted">丢弃条件：<code>stability == volatile</code> 且 <code>confidence &lt; 阈值</code>，两条同时成立才丢弃。当前阈值下的丢弃条数：<b>' + dropped().length + '</b>；写入长期记忆 <b>' + kept().length + ' 条</b>。</span>';
  h += '</div></div>';

  h += '<h2 class="stage-h">四条候选事实（12 轮会话抽出 4 条候选）</h2>';
  h += '<table><tr><th>序号</th><th>候选事实</th><th>证据命中原文</th><th>稳定性</th><th>置信度</th><th>目标画像字段</th><th>落点</th></tr>';
  CANDS.forEach(c => {
    const isDrop = dropped().indexOf(c) >= 0;
    let dest = '（待判定）';
    if (state.locked) {
      if (isDrop) dest = '丢弃';
      else if (PROFILE_FIELDS.indexOf(c.field) >= 0) dest = '长期记忆 + 覆盖画像字段 <code>' + esc(c.field) + '</code>';
      else dest = '长期记忆（不进画像）';
    }
    h += '<tr class="' + (state.locked ? (isDrop ? 'drop' : 'keep') : '') + '">';
    h += '<td>' + c.n + '</td><td>' + esc(c.fact) + '</td><td>' + c.evidence + '</td><td>' + c.stability + '</td>';
    h += '<td>' + c.conf.toFixed(2) + '</td><td>' + (c.field ? '<code>' + esc(c.field) + '</code>' : '空') + '</td>';
    h += '<td>' + dest + '</td></tr>';
  });
  h += '</table>';

  if (state.locked) {
    h += '<h2 class="stage-h">落点结果</h2>';
    h += '<div class="fb info">当前阈值 ' + threshold.toFixed(2) + ' 下：丢弃 <b>' + (dropped().length ? dropped().map(c => '序号 ' + c.n).join('、') : '无') + '</b>，写入长期记忆 <b>' + kept().length + ' 条</b>（' + esc(kept().map(c => '序号 ' + c.n).join('、') || '无') + '）。</div>';
    h += '<div class="fb info">序号 1 覆盖 <code>dept</code>，旧值“华东销售一部”进入 <code>_superseded</code> 留痕而不是被删；序号 2 覆盖 <code>output_style</code>；序号 3 没有字段；序号 4 的 <code>account_scopes</code> 不在 ' + PROFILE_TOTAL + ' 个画像字段里，因此不更新画像。</div>';
    h += '<div class="fb info">落点由字段语义决定：<code>dept</code> 与 <code>output_style</code> 描述“这个用户是怎样的人”，可以整段进 system 提示词；<code>account_scopes</code> 描述“这个账号能碰哪些工单”，属于运行时授权，从工具侧校验读取。</div>';
    h += '<div class="fb info">把置信度阈值从 0.60 调到 0.50，观察留存条数从 ' + (threshold <= 0.55 ? 4 : 3) + ' 条变化——阈值是唯一的旋钮，而其他条件不变。</div>';
  }

  stage.innerHTML = h;
  const thr = document.getElementById('thr');
  if (thr) thr.addEventListener('input', () => {
    threshold = Math.round(Number(thr.value) * 100) / 100;
    if (state.locked) { renderStage(); renderControls(); }
    else { renderStage(); }
  });
}

function renderControls() {
  let h = '<h2 class="stage-h">学习者操作区　<span class="muted">已答对 ' + correctCount() + ' / 4 题（当前阈值 ' + threshold.toFixed(2) + '）</span></h2>';
  h += '<div class="row"><button id="btnReset">重来</button><span class="muted">四项判定全部锁定后揭晓标准答案；每题两次机会。</span></div>';

  QUESTIONS.forEach(q => {
    const st = res[q.n];
    const lock = st.tries >= 2;
    h += '<div class="q' + (st.done && !st.correct ? ' spent' : '') + '">';
    h += '<div><b>第 ' + q.n + ' 题</b>　' + esc(q.stem) + '</div><div class="row" style="margin-top:4px">';
    if (q.n === 1) {
      h += '<label class="ctl">被丢弃的候选 <select id="a1"' + (lock ? ' disabled' : '') + ' aria-label="第 1 题被丢弃的候选"><option value="">— 选择 —</option>';
      CANDS.forEach(c => { h += '<option value="n' + c.n + '"' + ((ans[1] || '').toString() === 'n' + c.n ? ' selected' : '') + '>序号 ' + c.n + '</option>'; });
      h += '<option value="none"' + ((ans[1] || '').toString() === 'none' ? ' selected' : '') + '>没有候选被丢弃</option></select></label>';
      h += '<button data-sub="1"' + (lock ? ' disabled' : '') + '>提交第 1 题</button>';
    } else if (q.n === 2) {
      h += '<label class="ctl">写入条数 <input type="number" id="a2" min="0" max="4" step="1" value="' + ((ans[2] === undefined) ? '' : ans[2]) + '"' + (lock ? ' disabled' : '') + ' aria-label="第 2 题写入条数"></label>';
      h += '<button data-sub="2"' + (lock ? ' disabled' : '') + '>提交第 2 题</button>';
    } else if (q.n === 3) {
      h += '<span class="muted">勾选被覆盖更新的画像字段：</span>';
      PROFILE_FIELDS.concat(['account_scopes', '（无字段）']).forEach(f => {
        const on = (ans[3] || []).indexOf(f) >= 0 ? ' checked' : '';
        h += '<label class="ctl"><input type="checkbox" data-f="' + esc(f) + '"' + on + (lock ? ' disabled' : '') + '> <code>' + esc(f) + '</code></label>';
      });
      h += '<button data-sub="3"' + (lock ? ' disabled' : '') + '>提交第 3 题</button>';
    } else {
      h += '<label class="ctl">原因 <select id="a4"' + (lock ? ' disabled' : '') + ' aria-label="第 4 题原因"><option value="">— 选择 —</option>';
      Q4_OPTIONS.forEach(o => { h += '<option value="' + o.v + '"' + ((ans[4] || '') === o.v ? ' selected' : '') + '>' + esc(o.t) + '</option>'; });
      h += '</select></label>';
      h += '<button data-sub="4"' + (lock ? ' disabled' : '') + '>提交第 4 题</button>';
    }
    h += '</div>';
    if (st.fb) h += '<div class="fb ' + st.fb.kind + '">' + st.fb.text + '</div>';
    h += '</div>';
  });

  if (QUESTIONS.every(q => res[q.n].done)) {
    h += '<div class="fb ok">揭晓：答对 ' + correctCount() + ' / 4 题。四项全部命中算掌握；只答对序号而说不出序号 4 不进画像的原因，记为部分掌握。</div>';
    h += '<div class="fb info">提示：置信度高不等于该进画像，落点由字段语义决定。</div>';
  }

  controls.innerHTML = h;

  controls.querySelectorAll('input[data-f]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (!ans[3]) ans[3] = [];
      const f = cb.getAttribute('data-f');
      const i = ans[3].indexOf(f);
      if (cb.checked && i < 0) ans[3].push(f);
      if (!cb.checked && i >= 0) ans[3].splice(i, 1);
    });
  });

  const bz = document.getElementById('btnReset');
  if (bz) bz.addEventListener('click', () => {
    QUESTIONS.forEach(q => { res[q.n] = { tries: 0, done: false, correct: false, fb: '' }; delete ans[q.n]; });
    threshold = 0.60;
    state.locked = false;
    renderStage();
    renderControls();
  });
  controls.querySelectorAll('button[data-sub]').forEach(b => {
    b.addEventListener('click', () => submit(Number(b.getAttribute('data-sub'))));
  });
}

function rowOf(n) {
  const c = CANDS.filter(x => x.n === n)[0];
  return '序号 ' + c.n + '：' + c.fact + '（证据命中 ' + c.evidence + '，' + c.stability + '，置信度 ' + c.conf.toFixed(2) + '，目标画像字段 ' + (c.field || '空') + '）';
}

function submit(n) {
  const st = res[n];
  let ok = false, empty = false;
  if (n === 1) {
    ans[1] = (document.getElementById('a1') || {}).value || '';
    empty = ans[1] === '';
    ok = !empty && ans[1] === q1ans();
  } else if (n === 2) {
    ans[2] = (document.getElementById('a2') || {}).value || '';
    empty = ans[2] === '';
    ok = !empty && parseInt(ans[2], 10) === parseInt(q2ans(), 10);
  } else if (n === 3) {
    if (!ans[3]) ans[3] = [];
    empty = ans[3].length === 0;
    const got = ans[3].slice().sort().join('|');
    ok = !empty && got === PROFILE_FIELDS.slice().sort().join('|');
  } else {
    ans[4] = (document.getElementById('a4') || {}).value || '';
    empty = ans[4] === '';
    ok = !empty && ans[4] === 'biz';
  }
  if (empty) {
    st.fb = { kind: 'info', text: '请先填写答案再提交。' };
    renderControls();
    return;
  }
  st.tries += 1;
  state.locked = true;

  const std = { 1: q1text(), 2: q2text(), 3: 'dept 与 output_style', 4: '它的 profile_field 指向业务归属而非人的属性' }[n];
  const hint = {
    1: '序号 3 同时踩中两条丢弃条件：稳定性为 volatile，且置信度 0.55 低于阈值 ' + threshold.toFixed(2) + '。其余三条置信度均大于等于 0.60 且稳定。',
    2: '序号 1、2、4 三条通过证据校验与稳定性判定，全部写入长期记忆；一条被丢弃。',
    3: '序号 1 覆盖 dept，旧值“华东销售一部”进入 _superseded 留痕而不是被删；序号 2 覆盖 output_style；序号 3 没有字段；序号 4 的 account_scopes 不在 18 个画像字段里，因此不更新画像。',
    4: '置信度 0.92 不构成写入画像的理由。画像要能整段进 system 提示词，必须描述“这个用户是怎样的人”；工单归属描述的是“这个账号能碰哪些工单”，属于运行时授权，从工具侧的 account_scopes 校验读取，不进画像。'
  }[n];

  if (ok) {
    st.correct = true; st.done = true;
    st.fb = { kind: 'ok', text: '正确，' + esc(std) + '。<br/>' + esc(hint) };
  } else if (st.tries >= 2) {
    st.done = true;
    st.fb = { kind: 'no', text: rowOf(n) + '<br/>两次答错记为失手。标准答案：' + esc(std) + '。<br/>' + esc(hint) };
  } else {
    st.fb = { kind: 'no', text: rowOf(n) + '<br/>' + esc(hint) + ' 还有一次机会。' };
  }
  renderStage();
  renderControls();
}

renderStage();
renderControls();
