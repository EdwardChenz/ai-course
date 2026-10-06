// 多跳推理路径演示器 — Multihop Path Explorer
// 教学目标：学习者把路径结构翻译成「跳数」与「结果集」两个可检验的量，先预测再揭晓
// 规格来源：docs/chapters/05-graphrag-hybrid/index.md 的 multihop-path-explorer 规格块
// 图谱为示意数据：8 个节点、12 条有向边，全部照抄规格块 Content 表，不新增不删改

(function () {
  'use strict';

  // ================= 布局常量（先算再写码）=================
  // graph 380 + panel 210 + controls 84 = 674；index.md 的 iframe 高度 = 674 + 2 = 676px
  const GRAPH_HEIGHT = 380;
  const PANEL_HEIGHT = 210;
  const CONTROL_HEIGHT = 84;
  const MAX_HOPS = 3;          // 跳数上限 3 跳
  const MAX_FANOUT = 50;       // 单跳扇出上限 50

  // ================= 图谱数据（Content：节点 8 个）=================
  const NODES = [
    { id: 'N1', name: '宁德时代',     type: 'Company',  attrs: 'ticker 300750',    x: 300, y: 105 },
    { id: 'N2', name: '比亚迪',       type: 'Company',  attrs: 'ticker 002594',    x: 300, y: 215 },
    { id: 'N3', name: '亿纬锂能',     type: 'Company',  attrs: 'ticker 300014',    x: 300, y: 325 },
    { id: 'N4', name: '中信证券研究所', type: 'Org',    attrs: 'kind 券商研究所',   x: 55,  y: 62  },
    { id: 'N5', name: '华泰证券研究所', type: 'Org',    attrs: 'kind 券商研究所',   x: 55,  y: 322 },
    { id: 'N6', name: '动力电池',     type: 'Industry', attrs: 'level 申万一级',   x: 560, y: 215 },
    { id: 'N7', name: '产能增速',     type: 'Metric',   attrs: 'unit %',           x: 770, y: 82  },
    { id: 'N8', name: '毛利率',       type: 'Metric',   attrs: 'unit %',           x: 770, y: 350 }
  ];

  // Content：边 12 条，关系均为有向，边带属性
  const EDGES = [
    { id: 'E1',  from: 'N4', rel: 'COVERS',     to: 'N1', props: 'since 2023' },
    { id: 'E2',  from: 'N4', rel: 'COVERS',     to: 'N2', props: 'since 2022' },
    { id: 'E3',  from: 'N5', rel: 'COVERS',     to: 'N1', props: 'since 2024' },
    { id: 'E4',  from: 'N5', rel: 'COVERS',     to: 'N3', props: 'since 2021' },
    { id: 'E5',  from: 'N1', rel: 'BELONGS_TO', to: 'N6', props: 'weight 0.8' },
    { id: 'E6',  from: 'N2', rel: 'BELONGS_TO', to: 'N6', props: 'weight 0.8' },
    { id: 'E7',  from: 'N3', rel: 'BELONGS_TO', to: 'N6', props: 'weight 0.8' },
    { id: 'E8',  from: 'N1', rel: 'REPORTS',    to: 'N7', props: 'value 35.2，year 2025' },
    { id: 'E9',  from: 'N2', rel: 'REPORTS',    to: 'N7', props: 'value 28.4，year 2025' },
    { id: 'E10', from: 'N3', rel: 'REPORTS',    to: 'N7', props: 'value 41.0，year 2025' },
    { id: 'E11', from: 'N1', rel: 'REPORTS',    to: 'N8', props: 'value 32.1，year 2025' },
    { id: 'E12', from: 'N3', rel: 'REPORTS',    to: 'N8', props: 'value 19.8，year 2025' }
  ];

  const TYPE_STYLE = {
    Company:  { bg: '#bbdefb', bd: '#1565c0', zh: '公司' },
    Org:      { bg: '#ffe0b2', bd: '#e65100', zh: '机构' },
    Industry: { bg: '#c8e6c9', bd: '#2e7d32', zh: '行业' },
    Metric:   { bg: '#e1bee7', bd: '#6a1b9a', zh: '指标' }
  };

  const NODE_BY_ID = {};
  NODES.forEach(function (n) { NODE_BY_ID[n.id] = n; });
  const EDGE_BY_ID = {};
  EDGES.forEach(function (e) { EDGE_BY_ID[e.id] = e; });

  // ================= 挑战题（Content：6 题，固定顺序；跳数与结果集照抄）=================
  const CHALLENGES = [
    {
      stem: '从宁德时代出发，找到与它同属动力电池行业的全部公司',
      hops: 2,
      answer: ['比亚迪', '亿纬锂能'],
      pathEdges: ['E5', 'E6', 'E7'],
      fadedEdges: [],
      pathText: '宁德时代 -BELONGS_TO-> 动力电池 <-BELONGS_TO- 比亚迪；宁德时代 -BELONGS_TO-> 动力电池 <-BELONGS_TO- 亿纬锂能',
      hint: '必须先走到行业节点再走出来，图里没有"公司直接到公司"的边，所以是 2 跳不是 1 跳。'
    },
    {
      stem: '从宁德时代出发，数出覆盖它的研究所有多少家',
      hops: 1,
      answer: ['中信证券研究所', '华泰证券研究所'],
      count: '计数 2',
      pathEdges: ['E1', 'E3'],
      fadedEdges: [],
      pathText: '中信证券研究所 -COVERS-> 宁德时代；华泰证券研究所 -COVERS-> 宁德时代（两条都指向宁德时代，沿反方向计数，1 跳）',
      hint: 'COVERS 边指向公司，沿反方向走 1 跳即可计数，不需要先到行业节点。'
    },
    {
      stem: '从亿纬锂能出发，找出同行业中产能增速超过 30 的其他公司',
      hops: 3,
      answer: ['宁德时代'],
      detail: '宁德时代（35.2）',
      pathEdges: ['E7', 'E5', 'E8'],
      fadedEdges: ['E6', 'E9'],
      fadedText: '比亚迪的路径（E6、E9）存在，但产能增速 28.4 不严格大于 30，被过滤。',
      pathText: '亿纬锂能 -BELONGS_TO-> 动力电池 <-BELONGS_TO- 宁德时代 -REPORTS-> 产能增速（value 35.2）',
      hint: '路径是"公司到行业、到公司、再到指标"三跳，阈值只作用在末端的指标节点属性上；比亚迪 28.4 被过滤。'
    },
    {
      stem: '从华泰证券研究所出发，列出它覆盖的公司所属行业',
      hops: 2,
      answer: ['动力电池'],
      count: '去重后 1 个行业',
      pathEdges: ['E3', 'E4', 'E5', 'E7'],
      fadedEdges: [],
      pathText: '华泰证券研究所 -COVERS-> 宁德时代 -BELONGS_TO-> 动力电池；华泰证券研究所 -COVERS-> 亿纬锂能 -BELONGS_TO-> 动力电池',
      hint: '到公司是第 1 跳，再到行业是第 2 跳；答案按去重后的行业计数，不按公司条数。'
    },
    {
      stem: '从宁德时代出发，找出同行业中毛利率低于它自身的公司',
      hops: 3,
      answer: ['亿纬锂能'],
      detail: '亿纬锂能（19.8）',
      pathEdges: ['E5', 'E7', 'E12'],
      fadedEdges: ['E6', 'E11'],
      fadedText: 'E11 是阈值参照（宁德时代自身毛利率 32.1）；比亚迪没有指向毛利率的边——是缺数据，不是值为 0。',
      pathText: '宁德时代 -BELONGS_TO-> 动力电池 <-BELONGS_TO- 亿纬锂能 -REPORTS-> 毛利率（value 19.8），阈值取宁德时代自身 32.1',
      hint: '宁德时代自身毛利率 32.1，要先取到它做阈值再比较；比亚迪没有指向毛利率的边，属于缺数据而不是值为 0，不返回。'
    },
    {
      stem: '从比亚迪出发，找出与它被同一机构覆盖的其他公司',
      hops: 2,
      answer: ['宁德时代'],
      detail: '宁德时代（中信证券研究所）',
      pathEdges: ['E2', 'E1'],
      fadedEdges: [],
      pathText: '比亚迪 <-COVERS- 中信证券研究所 -COVERS-> 宁德时代',
      hint: '路径是"比亚迪逆一条边到中信、再顺一条边到宁德时代"，共 2 跳；亿纬锂能只有华泰覆盖，不共享机构。'
    }
  ];

  // ================= 运行状态 =================
  const state = {
    mode: 'explore',        // explore | challenge
    seed: 'N1',
    depth: 0,               // 0..3
    selected: null,
    qi: 0,                  // 当前题号 0..5
    round: 1,               // 预测轮次 1 / 2
    locked: 0,              // 已锁定的题数
    correct: 0,             // 已判对的题数
    allLocked: false,       // 是否已全部锁定并揭晓
    answers: [],            // 每题的作答与判定
    highlightQ: null        // 正在高亮路径的题号
  };

  let network = null;
  let el = {};

  // ================= 初始化 =================
  function init() {
    el = {
      graph: document.getElementById('graph'),
      panel: document.getElementById('panel'),
      seedSelect: document.getElementById('seedSelect'),
      expandBtn: document.getElementById('expandBtn'),
      collapseBtn: document.getElementById('collapseBtn'),
      startBtn: document.getElementById('startBtn'),
      fitBtn: document.getElementById('fitBtn'),
      zoomInBtn: document.getElementById('zoomInBtn'),
      zoomOutBtn: document.getElementById('zoomOutBtn'),
      hopInput: document.getElementById('hopInput'),
      setInput: document.getElementById('setInput'),
      submitBtn: document.getElementById('submitBtn'),
      retryBtn: document.getElementById('retryBtn'),
      answerBtn: document.getElementById('answerBtn'),
      resetBtn: document.getElementById('resetBtn'),
      chips: document.getElementById('chips')
    };

    // 起点下拉框：8 个节点全列
    el.seedSelect.innerHTML = NODES.map(function (n) {
      return '<option value="' + n.id + '">' + n.id + ' ' + n.name + '</option>';
    }).join('');

    buildNetwork();
    wireControls();
    // 不允许鼠标滚轮缩放：捕获阶段拦下 wheel，既不缩放也不劫持页面滚动
    el.graph.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    }, { passive: false, capture: true });

    for (var i = 0; i < CHALLENGES.length; i++) {
      state.answers.push({ hops: null, set: null, locked: false, ok: false, verdict: '', attempts: 0, revealed: false });
    }
    el.seedSelect.value = state.seed;
    setTimeout(function () { if (network) { network.fit({ animation: false }); } }, 60);
    render();
  }

  function buildNetwork() {
    const nodeSet = NODES.map(function (n) {
      const st = TYPE_STYLE[n.type];
      return {
        id: n.id,
        label: n.name,
        shape: n.type === 'Industry' ? 'ellipse' : (n.type === 'Metric' ? 'diamond' : 'box'),
        size: 30,
        borderWidth: 2,
        color: {
          background: st.bg,
          border: st.bd,
          highlight: { background: '#fff59d', border: '#f57f17' },
          hover: { background: '#e1f5fe', border: st.bd }
        },
        font: { color: '#102027', size: 14, face: 'Arial, Microsoft YaHei, sans-serif' },
        x: n.x,
        y: n.y,
        fixed: true,
        title: n.id + ' ' + n.name + '\n类型：' + n.type + '（' + st.zh + '）\n属性：' + n.attrs
      };
    });

    const edgeSet = EDGES.map(function (e) {
      return {
        id: e.id,
        from: e.from,
        to: e.to,
        label: e.rel,
        font: { color: '#455a64', size: 11, strokeWidth: 3, strokeColor: '#ffffff', align: 'middle' },
        color: { color: '#78909c', highlight: '#455a64', hover: '#455a64', opacity: 1 },
        width: 1.5,
        arrows: 'to',
        title: e.id + ' ' + e.rel + '\n' + e.from + ' ' + NODE_BY_ID[e.from].name +
               ' -> ' + e.to + ' ' + NODE_BY_ID[e.to].name + '\n边属性：' + e.props
      };
    });

    network = new vis.Network(el.graph, { nodes: nodeSet, edges: edgeSet }, {
      autoResize: true,
      physics: false,
      layout: { improvedLayout: false, randomSeed: 42 },
      nodes: { borderWidth: 2 },
      edges: {
        smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.4 },
        arrows: { to: { enabled: true, scaleFactor: 0.55 } }
      },
      interaction: {
        hover: true,
        selectable: true,
        multiselect: false,
        dragNodes: false,
        dragView: true,
        zoomView: true,
        navigationButtons: false,
        keyboard: false,
        tooltipDelay: 150
      }
    });

    network.on('click', function (params) {
      if (params.nodes && params.nodes.length) {
        onNodeClick(params.nodes[0]);
      } else if (params.edges && params.edges.length) {
        onEdgeClick(params.edges[0]);
      } else {
        state.selected = null;
        render();
      }
    });
  }

  function wireControls() {
    el.seedSelect.addEventListener('change', function () {
      state.seed = el.seedSelect.value;
      state.depth = 0;
      state.selected = state.seed;
      render();
    });
    el.expandBtn.addEventListener('click', function () {
      if (state.mode !== 'explore') return;
      state.depth = Math.min(state.depth + 1, MAX_HOPS);
      render();
    });
    el.collapseBtn.addEventListener('click', function () {
      if (state.mode !== 'explore') return;
      state.depth = 0;
      state.selected = state.seed;
      render();
    });
    el.startBtn.addEventListener('click', startChallenge);
    el.fitBtn.addEventListener('click', function () { network.fit({ animation: true }); });
    el.zoomInBtn.addEventListener('click', function () {
      const s = network.getScale();
      network.moveTo({ scale: Math.min(s * 1.3, 3), animation: true });
    });
    el.zoomOutBtn.addEventListener('click', function () {
      const s = network.getScale();
      network.moveTo({ scale: Math.max(s / 1.3, 0.2), animation: true });
    });
    el.submitBtn.addEventListener('click', submitPrediction);
    el.retryBtn.addEventListener('click', retryWrong);
    el.answerBtn.addEventListener('click', showAnswer);
    el.resetBtn.addEventListener('click', resetAll);
    el.chips.addEventListener('click', function (ev) {
      const t = ev.target;
      if (t && t.dataset && t.dataset.q !== undefined) {
        const q = parseInt(t.dataset.q, 10);
        state.qi = q;              // 芯片可切换到任意一题，回看它的判定
        state.highlightQ = q;      // 同时高亮该题的真实路径
        render();
      }
    });
    window.addEventListener('resize', function () {
      if (network) network.redraw();
    });
  }

  // ================= 展开算法（跳数上限 3、扇出上限 50）=================
  // 展开规则：COVERS 与 REPORTS 沿箭头方向；BELONGS_TO 视为双向（行业节点是枢纽，
  // 规格块第 1、4 题的答案要求从行业节点"走出来"）；允许在起点处反向走一条边。
  function neighborsOf(id, isSeed) {
    const out = [];
    for (let i = 0; i < EDGES.length; i++) {
      const e = EDGES[i];
      if (e.from === id) {
        out.push({ edge: e.id, to: e.to, dir: 'forward' });
      }
      if (e.to === id) {
        if (e.rel === 'BELONGS_TO' || isSeed) {
          out.push({ edge: e.id, to: e.from, dir: 'reverse' });
        }
      }
    }
    return out;
  }

  function distances(seed) {
    const dist = {};
    const queue = [seed];
    dist[seed] = 0;
    let truncated = false;
    while (queue.length) {
      const cur = queue.shift();
      const d = dist[cur];
      if (d >= MAX_HOPS) continue;
      let nbs = neighborsOf(cur, cur === seed);
      if (nbs.length > MAX_FANOUT) {
        nbs = nbs.slice(0, MAX_FANOUT);
        truncated = true;
      }
      for (let i = 0; i < nbs.length; i++) {
        if (dist[nbs[i].to] === undefined) {
          dist[nbs[i].to] = d + 1;
          queue.push(nbs[i].to);
        }
      }
    }
    return { dist: dist, truncated: truncated };
  }

  function visibleEdges() {
    if (state.mode === 'challenge') return EDGES.slice();
    if (state.depth < 1) return [];
    const d = distances(state.seed).dist;
    const out = [];
    for (let i = 0; i < EDGES.length; i++) {
      const e = EDGES[i];
      const df = d[e.from];
      const dt = d[e.to];
      if (df === undefined || dt === undefined) continue;
      if (Math.abs(df - dt) > 1) continue;
      if (Math.min(df, dt) >= state.depth) continue;
      out.push(e);
    }
    return out;
  }

  // ================= 渲染图 =================
  function renderGraph() {
    const visEdges = visibleEdges();
    const visEdgeIds = {};
    visEdges.forEach(function (e) { visEdgeIds[e.id] = true; });

    const d = distances(state.seed).dist;
    const nodes = NODES.map(function (n) {
      const st = TYPE_STYLE[n.type];
      const reached = state.mode === 'challenge' ? true : (d[n.id] !== undefined && d[n.id] <= state.depth);
      return {
        id: n.id,
        label: n.name,
        shape: n.type === 'Industry' ? 'ellipse' : (n.type === 'Metric' ? 'diamond' : 'box'),
        size: 30,
        x: n.x,
        y: n.y,
        fixed: true,
        title: n.id + ' ' + n.name + '\n类型：' + n.type + '（' + st.zh + '）\n属性：' + n.attrs,
        color: {
          background: reached ? st.bg : '#eceff1',
          border: reached ? st.bd : '#b0bec5',
          highlight: { background: '#fff59d', border: '#f57f17' },
          hover: { background: '#e1f5fe', border: st.bd }
        },
        opacity: reached ? 1 : 0.6,
        font: { color: reached ? '#102027' : '#90a4ae', size: 14, face: 'Arial, Microsoft YaHei, sans-serif' },
        borderWidth: (state.selected === n.id) ? 4 : 2,
        hidden: false
      };
    });

    const edges = EDGES.map(function (e) {
      let color = { color: '#78909c', highlight: '#455a64', hover: '#455a64', opacity: 1 };
      let width = 1.5;
      let opacity = 1;
      if (state.mode === 'explore') {
        if (!visEdgeIds[e.id]) { opacity = 0.12; color = { color: '#cfd8dc', highlight: '#cfd8dc', hover: '#cfd8dc', opacity: 0.12 }; }
      }
      const hq = state.highlightQ;
      if (hq !== null) {
        const ch = CHALLENGES[hq];
        if (ch && ch.pathEdges.indexOf(e.id) >= 0) {
          color = { color: '#2e7d32', highlight: '#1b5e20', hover: '#1b5e20', opacity: 1 };
          width = 3;
          opacity = 1;
        } else if (ch && ch.fadedEdges && ch.fadedEdges.indexOf(e.id) >= 0) {
          color = { color: '#ef6c00', highlight: '#ef6c00', hover: '#ef6c00', opacity: 0.7 };
          width = 2.5;
          opacity = 0.7;
        } else {
          opacity = 0.12;
          color = { color: '#cfd8dc', highlight: '#cfd8dc', hover: '#cfd8dc', opacity: 0.12 };
        }
      }
      return {
        id: e.id,
        from: e.from,
        to: e.to,
        label: e.rel,
        font: { color: '#455a64', size: 11, strokeWidth: 3, strokeColor: '#ffffff', align: 'middle' },
        color: color,
        width: width,
        opacity: opacity,
        arrows: { to: { enabled: true, scaleFactor: 0.55 } },
        title: e.id + ' ' + e.rel + '\n' + e.from + ' ' + NODE_BY_ID[e.from].name +
               ' -> ' + e.to + ' ' + NODE_BY_ID[e.to].name + '\n边属性：' + e.props,
        hidden: false
      };
    });

    network.setData({ nodes: nodes, edges: edges });
  }

  function onNodeClick(id) {
    state.selected = id;
    if (state.mode === 'explore') {
      const d = distances(state.seed).dist;
      if (d[id] !== undefined && d[id] > state.depth && d[id] <= MAX_HOPS) {
        // 点击即展开到该节点所在跳数（跳数上限 3）
        state.depth = d[id];
      }
    }
    render();
  }

  function onEdgeClick(id) {
    const e = EDGE_BY_ID[id];
    if (!e) return;
    state.selected = e.from;
    render();
  }

  // ================= 判定辅助 =================
  function normalizeSet(raw) {
    return String(raw === null || raw === undefined ? '' : raw)
      .replace(/[（(][^）)]*[）)]/g, ' ')
      .split(/[、,，;；\s\/]+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0 && !/^[0-9.]+$/.test(s); });
  }

  function sameSet(a, b) {
    const x = a.slice().sort();
    const y = b.slice().sort();
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  // ================= 挑战流程（先预测 → 提交 → 揭晓）=================
  function startChallenge() {
    state.mode = 'challenge';
    state.qi = 0;
    state.round = 1;
    state.locked = 0;
    state.correct = 0;
    state.allLocked = false;
    state.highlightQ = 0;
    state.selected = null;
    state.answers = [];
    for (let i = 0; i < CHALLENGES.length; i++) {
      state.answers.push({ hops: null, set: null, locked: false, ok: false, verdict: '', attempts: 0, revealed: false });
    }
    el.hopInput.value = '';
    el.setInput.value = '';
    setTimeout(function () { if (network) network.fit({ animation: true }); }, 30);
    render();
  }

  function submitPrediction() {
    if (state.mode !== 'challenge') return;
    if (state.allLocked) return;
    if (state.qi >= CHALLENGES.length) return;

    const ans = state.answers[state.qi];
    if (ans.locked) return;

    const hopsRaw = el.hopInput.value.trim();
    const setRaw = el.setInput.value.trim();
    if (hopsRaw === '' && setRaw === '') return;

    ans.attempts++;
    ans.revealed = false;
    ans.hops = hopsRaw === '' ? null : parseInt(hopsRaw, 10);
    ans.set = setRaw === '' ? null : normalizeSet(setRaw).join('、');
    ans.locked = true;
    state.locked++;

    // 判定：跳数与结果集两项全对才算该题正确（Evidence of Mastery）
    const ch = CHALLENGES[state.qi];
    const hopsOk = ans.hops === ch.hops;
    const setOk = ans.set !== null && sameSet(normalizeSet(ans.set), ch.answer);
    ans.ok = hopsOk && setOk;
    if (ans.ok) {
      state.correct++;
      ans.verdict = '正确：' + ch.hops + ' 跳，命中 ' + ch.answer.length + ' 个实体。';
    } else if (ans.attempts >= 2) {
      ans.verdict = '两次机会已用完，本题记为失手。标准答案：' + ch.hops + ' 跳，' +
        ch.answer.join('、') + (ch.detail ? '（' + ch.detail + '）' : '');
    } else {
      ans.verdict = (hopsOk ? '' : '跳数不对；') + (setOk ? '' : '结果集不对；') +
        '还可以重预测一次（还有 ' + (2 - ans.attempts) + ' 次机会）。';
    }
    state.highlightQ = state.qi;
    if (state.locked >= CHALLENGES.length) state.allLocked = true;
    render();

    if (!state.allLocked) {
      // 自动跳到下一道尚未锁定的题
      let next = -1;
      for (let i = state.qi + 1; i < CHALLENGES.length; i++) {
        if (!state.answers[i].locked) { next = i; break; }
      }
      state.qi = next >= 0 ? next : state.qi;
      el.hopInput.value = '';
      el.setInput.value = '';
      render();
    }
  }

  function retryWrong() {
    if (state.mode !== 'challenge' || !state.allLocked) return;
    let first = -1;
    for (let i = 0; i < CHALLENGES.length; i++) {
      if (!state.answers[i].ok && state.answers[i].attempts < 2) {
        state.answers[i] = { hops: null, set: null, locked: false, ok: false, verdict: '', attempts: state.answers[i].attempts, revealed: false };
        if (first < 0) first = i;
      }
    }
    if (first < 0) return;
    state.locked = 0;
    for (let i = 0; i < CHALLENGES.length; i++) if (state.answers[i].locked) state.locked++;
    state.allLocked = false;
    state.round = 2;
    state.qi = first;
    state.highlightQ = first;
    el.hopInput.value = '';
    el.setInput.value = '';
    render();
  }

  function showAnswer() {
    if (state.mode !== 'challenge') return;
    state.answers[state.qi].revealed = true;
    state.highlightQ = state.qi;
    render();
  }

  function resetAll() {
    state.mode = 'explore';
    state.seed = 'N1';
    state.depth = 0;
    state.selected = 'N1';
    state.qi = 0;
    state.round = 1;
    state.locked = 0;
    state.correct = 0;
    state.allLocked = false;
    state.highlightQ = null;
    state.answers = [];
    for (let i = 0; i < CHALLENGES.length; i++) {
      state.answers.push({ hops: null, set: null, locked: false, ok: false, verdict: '', attempts: 0, revealed: false });
    }
    el.seedSelect.value = state.seed;
    el.hopInput.value = '';
    el.setInput.value = '';
    render();
  }

  // ================= 面板与控件渲染 =================
  function render() {
    renderGraph();
    renderControls();
    if (state.mode === 'explore') renderExplorePanel();
    else renderChallengePanel();
  }

  function renderControls() {
    const explore = state.mode === 'explore';
    el.expandBtn.disabled = !explore || state.depth >= MAX_HOPS;
    el.collapseBtn.disabled = !explore;
    el.startBtn.disabled = !explore;
    el.seedSelect.disabled = !explore;
    const canSubmit = !explore && !state.allLocked && state.qi < CHALLENGES.length;
    el.hopInput.disabled = !canSubmit;
    el.setInput.disabled = !canSubmit;
    el.submitBtn.disabled = !canSubmit;
    el.retryBtn.disabled = explore || !state.allLocked;
    el.answerBtn.disabled = explore;

    let html = '';
    for (let i = 0; i < CHALLENGES.length; i++) {
      const a = state.answers[i];
      let cls = 'chip';
      let mark = String(i + 1);
      if (a.locked) {
        cls += a.ok ? ' ok' : ' no';
        mark = String(i + 1) + (a.ok ? '✔' : '✘');
      } else if (explore === false && i === state.qi) {
        cls += ' locked';
        mark = String(i + 1) + '·';
      }
      html += '<span class="' + cls + '" data-q="' + i + '" role="button" tabindex="0" aria-label="第' +
        (i + 1) + '题">' + mark + '</span>';
    }
    el.chips.innerHTML = html;
  }

  function infoboxHtml(id) {
    if (!id) return '<div class="hint">点击任意节点：显示它的类型、属性与进出边关系。</div>';
    const n = NODE_BY_ID[id];
    const st = TYPE_STYLE[n.type];
    const outs = EDGES.filter(function (e) { return e.from === id; });
    const ins = EDGES.filter(function (e) { return e.to === id; });
    let html = '<div><b>' + id + ' ' + n.name + '</b>　类型：' + n.type + '（' + st.zh + '）　属性：' +
      n.attrs + '</div>';
    html += '<div class="hint">出边 ' + outs.length + '：' + (outs.length ? outs.map(function (e) {
      return e.rel + ' → ' + e.to + ' ' + NODE_BY_ID[e.to].name + '（' + e.props + '）';
    }).join('；') : '无') + '</div>';
    html += '<div class="hint">入边 ' + ins.length + '：' + (ins.length ? ins.map(function (e) {
      return e.from + ' ' + NODE_BY_ID[e.from].name + ' -' + e.rel + '->（' + e.props + '）';
    }).join('；') : '无') + '</div>';
    return html;
  }

  function renderExplorePanel() {
    const d = distances(state.seed);
    const dist = d.dist;
    const vis = visibleEdges();
    const reached = {};
    reached[state.seed] = true;
    vis.forEach(function (e) { reached[e.from] = true; reached[e.to] = true; });
    let hop1 = 0;
    for (const k in dist) if (dist[k] === 1) hop1++;

    let html = '<div><b>多跳推理路径演示器</b>　起点：' + state.seed + ' ' + NODE_BY_ID[state.seed].name +
      '　展开深度：' + state.depth + ' 跳（上限 ' + MAX_HOPS + '）　已到达节点：' +
      Object.keys(reached).length + '/' + NODES.length + '　已展开边：' + vis.length + '/' + EDGES.length +
      '　扇出上限：' + MAX_FANOUT + (d.truncated ? '（已截断）' : '（未触发截断）') + '</div>';
    html += '<div class="hint">展开规则：COVERS 与 REPORTS 沿箭头方向；BELONGS_TO 视为双向（行业节点是枢纽）；允许在起点处反向走一条边。跳数上限 ' +
      MAX_HOPS + ' 跳，单跳扇出上限 ' + MAX_FANOUT + '。</div>';
    html += '<div class="hint">从 ' + state.seed + ' 出发的 1 跳邻居共 ' + hop1 + ' 个' +
      (state.seed === 'N1' ? '（与章节锚点一致：1 跳 5 个邻居）' : '') + '。</div>';
    html += infoboxHtml(state.selected);
    html += '<div class="hint">悬停边可看关系类型与边属性；点击节点展开它的邻居，点"展开下一跳"继续到第 3 跳为止。滚轮不缩放，用"适配视图"与"＋／－"按钮控制。</div>';
    el.panel.innerHTML = html;
  }

  function renderChallengePanel() {
    const ch = CHALLENGES[state.qi];
    const ans = state.answers[state.qi];
    let html = '<div><b>多跳推理路径演示器 · 挑战 ' + (state.qi + 1) + '/' + CHALLENGES.length +
      '</b>　第 ' + state.round + ' 轮预测　已锁定 ' + state.locked + ' 题，答对 ' + state.correct +
      ' 题（掌握标准：答对 ≥ 5 题）</div>';

    if (state.allLocked) {
      html += '<div class="' + (state.correct >= 5 ? 'ok' : 'no') + '">全部锁定并揭晓：答对 ' +
        state.correct + '/' + CHALLENGES.length + ' 题' +
        (state.correct >= 5 ? '（已掌握）' : '（未达掌握标准，可用"重预测错题"再试一次）') +
        '　点题号芯片可回看任意一题的判定与真实路径。</div>';
    } else {
      html += '<div><b>第 ' + (state.qi + 1) + ' 题：' + ch.stem + '</b></div>';
      html += '<div class="hint">请在下方输入两项预测：跳数（1-3）与结果集（多个实体用顿号分隔，顺序无关）。点"提交预测"锁定本题。' +
        '　点题号芯片可跳到任意一题。</div>';
    }

    if (state.allLocked || ans.locked) {
      html += '<div class="' + (ans.ok ? 'ok' : 'no') + '">本题判定：' + ans.verdict + '</div>';
      if (!ans.ok) {
        html += '<div class="hint">提示：' + ch.hint + '</div>';
      }
      html += '<div class="hint">真实路径：' + ch.pathText + '</div>';
      if (ch.fadedText) html += '<div class="hint">' + ch.fadedText + '</div>';
      html += '<div class="hint">正确答案：' + ch.hops + ' 跳；结果集 ' + ch.answer.join('、') +
        (ch.count ? '（' + ch.count + '）' : '') + '。高亮路径已画在图上（橙色为被过滤或仅作阈值参照的边）。</div>';
    } else if (ans.revealed) {
      html += '<div class="no">已点"显示答案"：本题不计分，答案如下。</div>';
      html += '<div class="hint">真实路径：' + ch.pathText + '</div>';
      if (ch.fadedText) html += '<div class="hint">' + ch.fadedText + '</div>';
      html += '<div class="hint">正确答案：' + ch.hops + ' 跳；结果集 ' + ch.answer.join('、') +
        (ch.count ? '（' + ch.count + '）' : '') + '。提示：' + ch.hint + '</div>';
    } else {
      html += '<div class="hint">本题尚未提交。不要先看答案——先写下你的跳数与结果集，再点"提交预测"。' +
        '（实在想不出可点"显示答案"，但该题不计分。）</div>';
    }
    html += infoboxHtml(state.selected);
    el.panel.innerHTML = html;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
