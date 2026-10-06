// 跨 Agent 任务交接状态同步 — Task Handoff State Timeline
// 教学目标：学习者追踪一次理赔委托 task-7f3c1a92 的十二条状态事件，
//           判定哪一条必须丢弃（序号 6）并算出接受该回退后的重复扣费（4.5 分）
// 规格来源：docs/chapters/08-cross-agent-protocols/index.md 的 task-handoff-state-timeline 规格块
// 十二条事件的序号、时刻、事件名、接受后状态与是否应执行全部照抄规格块 Content 表

(function () {
  'use strict';

  // ================= 布局常量（先算再写码）=================
  // timeline 210 + ledger 84 + events 234 + feedback 112 + controls 120 = 760
  // index.md 的 iframe 高度 = 760 + 2 = 762px
  const TIMELINE_HEIGHT = 210;
  const LEDGER_HEIGHT = 84;
  const EVENTS_HEIGHT = 234;
  const FEEDBACK_HEIGHT = 112;
  const CONTROL_HEIGHT = 120;

  // 规格块 Rules：事件状态序号（当前状态的序号大于事件状态的序号即判回退）
  const RANK = { created: 1, accepted: 2, running: 3, completed: 4 };
  const TERMINAL = 'completed';
  const PRICE_PER_RUN = 1.5;   // 按次计价 1.5 分
  const FIRST_DONE = 780;      // 首次 completed 的时刻（毫秒）
  const P95_CARD = 800;        // 能力卡片 P95 800 毫秒
  const DEFAULT_DEADLINE = 2000; // deadline_ms 2000
  const BASE = 1767225600000;  // 时间轴零点，仅作基准，差值即相对委托发出的毫秒数
  const MARK_MS = 30;           // 事件是瞬时到达，画成 30 毫秒宽的标记块只为看得见，不代表持续时间
  const LABEL_WINDOW = 2600;    // 视窗宽度小于该值（毫秒）时给标记加序号标签，否则只画色块

  // ================= Content：十二条状态事件（合成数据，随机种子 20261006）=================
  const EVENTS = [
    { no: 1,  t: 0,    name: 'created',   state: 'created',           exec: '是',               kind: 'ok' },
    { no: 2,  t: 12,   name: 'accepted',  state: 'accepted',          exec: '是',               kind: 'ok' },
    { no: 3,  t: 140,  name: 'running',   state: 'running',           exec: '是',               kind: 'ok' },
    { no: 4,  t: 310,  name: 'running',   state: 'running',           exec: '是',               kind: 'ok' },
    { no: 5,  t: 780,  name: 'completed', state: 'completed',         exec: '是',               kind: 'first' },
    { no: 6,  t: 905,  name: 'running',   state: '回退至 running',     exec: '否，必须丢弃',      kind: 'rollback' },
    { no: 7,  t: 980,  name: 'completed', state: '保持 completed',     exec: '幂等重复，不重执行', kind: 'idem' },
    { no: 8,  t: 1035, name: 'running',   state: '回退至 running',     exec: '否，必须丢弃',      kind: 'rollback' },
    { no: 9,  t: 1120, name: 'completed', state: '保持 completed',     exec: '幂等重复，不重执行', kind: 'idem' },
    { no: 10, t: 5200, name: 'running',   state: '回退至 running',     exec: '否，必须丢弃',      kind: 'rollback' },
    { no: 11, t: 5400, name: 'completed', state: '保持 completed',     exec: '幂等重复，不重执行', kind: 'idem' },
    { no: 12, t: 5490, name: 'completed', state: '保持 completed',     exec: '幂等重复，不重执行', kind: 'idem' }
  ];

  const STYLE = {
    ok:       'background:#c8e6c9;color:#1b5e20;border-color:#2e7d32;font-weight:bold',
    first:    'background:#a5d6a7;color:#0d47a1;border-color:#1b5e20;font-weight:bold',
    idem:     'background:#ffe0b2;color:#e65100;border-color:#ef6c00',
    rollback: 'background:#ef5350;color:#ffffff;border-color:#b71c1c;font-weight:bold'
  };

  // ================= 三道挑战题（Content + Feedback，固定顺序）=================
  const QUIZ = [
    {
      key: 'q1',
      ask: '哪一条状态事件必须被丢弃（回退）？填写事件序号。',
      expect: 6, tol: 0,
      derivation: '事件状态序号：created 1 < accepted 2 < running 3 < completed 4。序号 6（running，时刻 905 毫秒）到达时编排侧状态为 completed（序号 4），4 > 3 判回退，必须丢弃；序号 8（1035 毫秒）、序号 10（5200 毫秒）同理。',
      feedback: '序号 6 之所以必须丢弃，不是因为对方有意回退，而是因为完成态是终态，一旦被拉回 running，被委托方会重新调用模型与规则库，一次委托就变成两次计费；正确的处理是丢弃事件并记一条审计日志，同时把这次回退本身作为监控指标上报。'
    },
    {
      key: 'q2',
      ask: '若接受该回退，重复扣费金额是多少分？',
      expect: 4.5, tol: 0.05,
      derivation: '若接受该回退，核保规则被重新执行一遍，按次计价 1.5 分意味着多扣 1.5 分；本时间轴上回退被接受了三次（序号 6、8、10），每次按次计价 1.5 分，合计重复扣费 4.5 分。正确实现下回退被丢弃，重复扣费为 0.0 分，核保规则只执行 1 次，扣费 1.5 分。',
      feedback: '若接受该回退，核保规则被重新执行一遍，按次计价 1.5 分意味着多扣 1.5 分；本时间轴上回退被接受了三次（序号 6、8、10），每次按次计价 1.5 分，合计重复扣费 4.5 分。序号 7、9、11、12 与当前状态相同，属于幂等重复，必须返回首次结果而不是再执行一遍。'
    },
    {
      key: 'q3',
      ask: '延迟到达的事件是否应判超时？',
      expect: 'no', tol: 0,
      derivation: '首次 completed 在 780 毫秒；deadline_ms = 2000 毫秒；780 < 2000 且 completed 是终态 → 不应判超时。',
      feedback: 'completed 实际发生在 780 毫秒，远小于 deadline_ms 的 2000 毫秒，延迟到达只影响观测时刻，不改变任务已经完成的事实。'
    }
  ];

  // ================= 运行状态 =================
  const state = {
    deadline: DEFAULT_DEADLINE,
    selected: 5,
    labels: false,         // 视窗够窄时才给事件标记加序号标签
    answers: [],
    attempts: [0, 0, 0],
    ok: [false, false, false],
    resolved: [false, false, false],
    revealed: false,
    messages: ['', '', '']
  };

  let timeline = null;
  let el = {};

  // ================= Rules 引擎 =================
  // 规则一：当前状态的序号大于事件状态的序号即判回退，必须丢弃并记审计日志
  // 规则二：事件序号等于当前状态序号即判幂等重复，返回首次结果且不执行
  // 规则三：超时判定用 >=，事件到达时刻 >= 超时阈值且状态非终态才判超时
  function simulate(T) {
    let cur = null;
    let runs = 0;
    const rows = [];
    for (let i = 0; i < EVENTS.length; i++) {
      const ev = EVENTS[i];
      const r = RANK[ev.name];
      const preTerminal = (cur !== null && cur.name === TERMINAL);
      const timeout = (ev.t >= T) && !preTerminal;
      let verdict, action, audit;
      if (cur !== null && cur.rank > r) {
        verdict = '回退：' + cur.rank + ' > ' + r + '，必须丢弃';
        action = 'discard';
        audit = true;
      } else if (cur !== null && cur.rank === r) {
        verdict = (ev.name === TERMINAL) ? '同态：幂等重复，返回首次结果' : '同态：状态不变';
        action = 'idempotent';
        audit = false;
      } else {
        verdict = (cur === null) ? '前向：首次接受' : ('前向：' + cur.rank + ' < ' + r + '，接受');
        action = 'accept';
        audit = false;
        cur = { name: ev.name, rank: r };
        if (ev.name === TERMINAL) runs++;
      }
      rows.push({ verdict: verdict, action: action, audit: audit, timeout: timeout });
    }
    return { rows: rows, runs: runs };
  }

  // ================= 初始化 =================
  function init() {
    el = {
      timeline: document.getElementById('timeline'),
      ledger: document.getElementById('ledger'),
      events: document.getElementById('events'),
      feedback: document.getElementById('feedback'),
      slider: document.getElementById('timeoutSlider'),
      timeoutValue: document.getElementById('timeoutValue'),
      focusBtn: document.getElementById('focusBtn'),
      fitBtn: document.getElementById('fitBtn'),
      zoomInBtn: document.getElementById('zoomInBtn'),
      zoomOutBtn: document.getElementById('zoomOutBtn'),
      q1: document.getElementById('q1Input'),
      q2: document.getElementById('q2Input'),
      q3: document.getElementById('q3Input'),
      verdict: document.getElementById('verdict'),
      submitBtn: document.getElementById('submitBtn'),
      retryBtn: document.getElementById('retryBtn'),
      answerBtn: document.getElementById('answerBtn'),
      resetBtn: document.getElementById('resetBtn')
    };
    resetQuiz();
    buildTimeline();
    wire();
    // 滚轮不缩放：捕获阶段拦下 wheel，既不缩放也不劫持页面滚动；缩放与定位用按钮控制
    el.timeline.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }, { passive: false, capture: true });
    render();
  }

  function resetQuiz() {
    state.answers = [null, null, null];
    state.attempts = [0, 0, 0];
    state.ok = [false, false, false];
    state.resolved = [false, false, false];
    state.revealed = false;
    state.messages = ['', '', ''];
  }

  function buildTimeline() {
    const groups = [
      { id: 'ev', content: '状态事件（12 条，时刻为相对委托发出的毫秒数）' },
      { id: 'dl', content: '超时阈值 deadline_ms' }
    ];
    const options = {
      width: '100%',
      height: TIMELINE_HEIGHT + 'px',
      stack: true,
      showCurrentTime: false,
      orientation: { axis: 'top', item: 'top' },
      groupWidth: 190,
      min: BASE,
      max: BASE + 6300,
      zoomMin: 40,
      zoomMax: 400000,
      zoomKey: 'altKey',
      moveable: true,
      selectable: true,
      multiselect: false,
      editable: { updateTime: false, add: false, remove: false },
      margin: { item: { horizontal: 6, vertical: 3 }, axis: 8 },
      format: {
        // 'ss.SSS' 保证毫秒刻度标签自带秒前缀（600 ms -> 00.600），不与下一秒混淆
        minorLabels: { millisecond: 'ss.SSS', second: 's.SSS', minute: 'm' },
        majorLabels: false
      },
      tooltip: { followMouse: true, overflowMethod: 'cap' }
    };
    timeline = new vis.Timeline(el.timeline, buildItems(), groups, options);
    timeline.on('click', function (ev) {
      if (ev.item) {
        state.selected = ev.item;
        render();
      }
    });
    // 视窗宽度跨过阈值时切换事件标记上的序号标签（缩放、聚焦、拖动都走这里）
    timeline.on('rangechange', function () { syncLabels(); });
    setTimeout(function () { showAll(); render(); }, 60);
  }

  function buildItems() {
    const items = EVENTS.map(function (ev) {
      return {
        id: ev.no,
        group: 'ev',
        content: state.labels ? '#' + ev.no : '',
        start: new Date(BASE + ev.t),
        end: new Date(BASE + ev.t + MARK_MS),
        type: 'range',
        className: 'ev-' + ev.kind,
        style: STYLE[ev.kind],
        title: '序号 ' + ev.no + '｜' + ev.t + ' ms｜' + ev.name + '｜' + ev.state + '｜' + ev.exec
      };
    });
    items.push({
      id: 'deadline',
      group: 'dl',
      content: 'deadline_ms = ' + state.deadline + ' ms',
      start: new Date(BASE),
      end: new Date(BASE + state.deadline),
      style: 'background:#ffcdd2;color:#b71c1c;border-color:#c62828'
    });
    return items;
  }

  function wire() {
    el.slider.addEventListener('input', function () {
      state.deadline = parseInt(el.slider.value, 10);
      render();
    });
    el.focusBtn.addEventListener('click', function () {
      timeline.setWindow(BASE + 600, BASE + 1300, { animation: true });
      state.selected = 6;
      render();
    });
    el.fitBtn.addEventListener('click', showAll);
    el.zoomInBtn.addEventListener('click', function () { timeline.zoomIn(0.6, { animation: true }); });
    el.zoomOutBtn.addEventListener('click', function () { timeline.zoomOut(0.6, { animation: true }); });
    el.submitBtn.addEventListener('click', submit);
    el.retryBtn.addEventListener('click', retry);
    el.answerBtn.addEventListener('click', showAnswer);
    el.resetBtn.addEventListener('click', function () {
      resetQuiz();
      el.q1.value = '';
      el.q2.value = '';
      el.q3.value = '';
      state.deadline = DEFAULT_DEADLINE;
      el.slider.value = DEFAULT_DEADLINE;
      showAll();
      render();
    });
  }

  function showAll() {
    if (timeline) timeline.setWindow(BASE, BASE + 6300, { animation: false });
  }

  // ================= 判定（Feedback：每题两次机会，提交后立即揭晓）=================
  function submit() {
    const raw = [el.q1.value.trim(), el.q2.value.trim(), el.q3.value];
    if (raw[0] === '' && raw[1] === '' && raw[2] === '') return;
    let resolvedCount = 0;
    for (let i = 0; i < QUIZ.length; i++) {
      const q = QUIZ[i];
      const v = raw[i];
      if (v === '') continue;
      if (q.key !== 'q3' && isNaN(parseFloat(v))) continue;
      if (state.resolved[i]) {
        if (state.ok[i]) continue;                 // 已答对的不再重复判定
        if (state.attempts[i] >= 2) continue;       // 两次机会已用完
        if (String(state.answers[i]) === String(v)) continue;  // 答案没变就不重复判
      }
      state.answers[i] = v;
      state.attempts[i]++;
      resolvedCount++;
      let good;
      if (q.key === 'q3') {
        good = (v === q.expect);
      } else if (q.key === 'q1') {
        const n = parseInt(v, 10);
        good = !isNaN(n) && Math.abs(n - q.expect) <= q.tol;
      } else {
        const n = parseFloat(v);
        good = !isNaN(n) && Math.abs(n - q.expect) <= q.tol;
      }
      state.ok[i] = good;
      state.resolved[i] = true;
      let headline, detail;
      if (good) {
        headline = '正确，' + expectText(i);
        detail = '反馈：' + q.feedback;
      } else if (state.attempts[i] >= 2) {
        headline = '答错（第 2 次机会用完），本题记为失手。标准答案：' + expectText(i);
        detail = '判定规则推导：' + q.derivation + '　反馈：' + q.feedback;
      } else {
        headline = '答错，还有 1 次机会。';
        detail = '判定规则推导：' + q.derivation;
      }
      state.messages[i] = { ok: good, headline: headline, detail: detail };
      if (good) {
        el.q1.disabled = i === 0;
        el.q2.disabled = i === 1;
        el.q3.disabled = i === 2;
      }
    }
    if (resolvedCount > 0) render();
  }

  function expectText(i) {
    const q = QUIZ[i];
    if (q.key === 'q1') return '必须丢弃的是序号 6（running，905 毫秒）';
    if (q.key === 'q2') return '重复扣费 4.5 分（按次计价 1.5 分 × 3 次）';
    return '不应判超时';
  }

  function retry() {
    const left = [];
    for (let i = 0; i < QUIZ.length; i++) {
      if (state.resolved[i] && !state.ok[i] && state.attempts[i] < 2) left.push(i);
    }
    for (const i of left) {
      state.resolved[i] = false;
      state.ok[i] = false;
      state.messages[i] = '';
      state.answers[i] = null;
      if (i === 0) { el.q1.value = ''; el.q1.disabled = false; }
      if (i === 1) { el.q2.value = ''; el.q2.disabled = false; }
      if (i === 2) { el.q3.value = ''; el.q3.disabled = false; }
    }
    if (left.length) state.revealed = false;
    render();
  }

  function showAnswer() {
    state.revealed = true;
    for (let i = 0; i < QUIZ.length; i++) {
      state.messages[i] = {
        ok: true,
        headline: '标准答案：' + expectText(i) + '（显示答案不计分）',
        detail: '判定规则推导：' + QUIZ[i].derivation + '　反馈：' + QUIZ[i].feedback
      };
    }
    state.selected = 6;
    timeline.setWindow(BASE + 600, BASE + 1300, { animation: true });
    render();
  }

  function renderFeedback() {
    let any = false;
    let html = '';
    for (let i = 0; i < QUIZ.length; i++) {
      const m = state.messages[i];
      if (!m) continue;
      any = true;
      html += '<div><span class="' + (m.ok ? 'ok' : 'no') + '">第 ' + (i + 1) + ' 题｜' + m.headline + '</span><br>' +
        '<span class="hint">' + m.detail + '</span></div>';
    }
    if (!any) {
      html = '<div class="hint">三道挑战题的判定与反馈会出现在这里。每题两次机会，提交后立即揭晓；答错会给出该题的判定规则推导与反馈文案。<br>' +
        '回退（序号 6、8、10）必须丢弃并记审计日志；幂等重复（序号 7、9、11、12）返回首次结果，不重执行。</div>';
    }
    el.feedback.innerHTML = html;
  }

  // ================= 渲染 =================
  // 视窗够窄时给事件标记加序号标签：12 条事件挤在 5.5 秒内，全景视图下标签必然重叠，
  // 因此全景只画色块，聚焦或放大后才显示序号。
  function syncLabels() {
    if (!timeline || state.applying) return;
    const w = timeline.getWindow();
    const want = (w.end - w.start) < LABEL_WINDOW;
    if (want === state.labels) return;
    state.labels = want;
    state.applying = true;
    timeline.setItems(buildItems());
    setTimeout(function () { state.applying = false; }, 0);
  }

  function render() {
    syncLabels();
    const sim = simulate(state.deadline);
    timeline.setItems(buildItems());
    renderLedger(sim);
    renderTable(sim);
    renderFeedback();
    renderVerdict();
  }

  function renderLedger(sim) {
    const T = state.deadline;
    const flagged = [];
    for (let i = 0; i < sim.rows.length; i++) if (sim.rows[i].timeout) flagged.push(EVENTS[i].no);
    const margin = T - FIRST_DONE;
    const verdictText = flagged.length
      ? '序号 ' + flagged.join('、') + ' 被判超时'
      : '无事件被判超时';
    let html = '<div><b>跨 Agent 任务交接状态同步</b>　委托 <code>task-7f3c1a92</code>　幂等键 ' +
      '<code>CL-20261006-0031:risk-score</code>　超时阈值 T = ' + T + ' ms（区间 500-5000，步长 100）</div>';
    html += '<div class="hint">首次 completed 在 ' + FIRST_DONE + ' ms，与阈值比较：' + FIRST_DONE + ' &gt;= ' + T +
      ' ？' + (FIRST_DONE >= T ? '是' : '否') + ' → 当前阈值下' + (FIRST_DONE >= T ? '判超时' : '不判超时（余量 ' + margin +
      ' ms）') + '；T ≥ ' + P95_CARD + ' ms（卡片 P95 800 ms 口径）判为准时。超时判定用 &gt;= 且状态非终态才判超时：' + verdictText + '。</div>';
    html += '<div class="hint">正确实现：核保规则执行 ' + sim.runs + ' 次，按次计价 1.5 分 → 扣费 ' +
      (sim.runs * PRICE_PER_RUN).toFixed(1) + ' 分，重复扣费 0.0 分；若接受该回退，核保规则被重新执行一遍，按次计价 1.5 分意味着多扣 1.5 分，本时间轴合计重复扣费 ' +
      QUIZ[1].expect.toFixed(1) + ' 分。延迟到达的序号 10-12（5200/5400/5490 ms）只影响观测时刻，不改变任务已完成的事实。</div>';
    html += '<div class="hint">滚轮已禁用（避免劫持页面滚动），用"聚焦回退""显示全部""＋／－"按钮控制视图；悬停或点击时间轴上的序号查看该事件的完整字段。</div>';
    el.ledger.innerHTML = html;
    el.timeoutValue.textContent = T + ' ms';
  }

  function renderTable(sim) {
    let html = '<table><thead><tr><th>序号</th><th>时刻 ms</th><th>事件</th><th>编排侧接受后状态</th>' +
      '<th>是否应执行</th><th>判定（当前状态序号 vs 事件序号）</th><th>阈值判定</th></tr></thead><tbody>';
    for (let i = 0; i < EVENTS.length; i++) {
      const ev = EVENTS[i];
      const row = sim.rows[i];
      let cls = ev.kind === 'rollback' ? 'rb' : (ev.kind === 'idem' ? 'idem' : '');
      if (state.selected === ev.no) cls = (cls + ' sel').trim();
      html += '<tr class="' + cls + '" data-no="' + ev.no + '">' +
        '<td class="num">' + ev.no + '</td>' +
        '<td class="num">' + ev.t + '</td>' +
        '<td>' + ev.name + '</td>' +
        '<td>' + ev.state + '</td>' +
        '<td>' + ev.exec + '</td>' +
        '<td class="hint">' + row.verdict + (row.audit ? '，记审计日志' : '') + '</td>' +
        '<td>' + (row.timeout ? '<span class="no">判超时</span>' : '不判超时') + '</td>' +
        '</tr>';
    }
    html += '</tbody></table>';
    el.events.innerHTML = html;
    el.events.scrollTop = 0;
  }

  function renderVerdict() {
    let done = 0, ok = 0;
    for (let i = 0; i < 3; i++) {
      if (state.resolved[i]) { done++; if (state.ok[i]) ok++; }
    }
    let html = '';
    if (done > 0) {
      html = '<span class="' + (ok >= 2 ? 'ok' : 'no') + '">答对 ' + ok + '/3 题</span>' +
        '（计分满分 3 分，' + (ok >= 2 ? '已掌握' : '达到 2 分视为掌握') + '）';
      // 回退与幂等重复的差别写在下方反馈区
    } else if (state.revealed) {
      html = '<span class="hint">已显示答案，本轮不计分。</span>';
    } else {
      html = '<span class="hint">先预测再提交，锁定前不显示标准答案。</span>';
    }
    el.verdict.innerHTML = html;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
