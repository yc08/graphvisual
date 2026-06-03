// Unified graph renderer + runner (enhanced)
(function(){
  const svg = document.getElementById('svg');
  if(!svg) return;
  const svgNS = 'http://www.w3.org/2000/svg';
  const page = document.body.dataset.page || 'bfs';

  // Controls (may be absent on some pages)
  const addNodeBtn = document.getElementById('addNodeBtn');
  const addEdgeBtn = document.getElementById('addEdgeBtn');
  const directedCheckbox = document.getElementById('directedCheckbox');
  const randomBtn = document.getElementById('randomBtn');
  const clearBtn = document.getElementById('clearBtn');
  const startLabel = document.getElementById('startLabel');
  const runBtn = document.getElementById('runBtn');
  const stepBtn = document.getElementById('stepBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const speedRange = document.getElementById('speedRange');

  // ensure optional controls (clear steps + cost label)
  function ensureExtras(){
    if(!document.getElementById('gv-extras')){
      const wrap = document.createElement('div');
      wrap.id = 'gv-extras';
      wrap.style.cssText = 'display:flex;gap:8px;align-items:center;margin:6px 0;flex-wrap:wrap';
      const target = document.querySelector('header') || document.body;
      target.parentNode.insertBefore(wrap, target.nextSibling);
    }
    const wrap = document.getElementById('gv-extras');
    if(!document.getElementById('clearStepsBtn')){ const b=document.createElement('button'); b.id='clearStepsBtn'; b.textContent='Clear Steps'; b.className='btn'; wrap.appendChild(b); }
    if(!document.getElementById('costLabel')){ const c=document.createElement('div'); c.id='costLabel'; c.style.fontWeight='600'; wrap.appendChild(c); }
    if(!document.getElementById('deleteEdgeBtn')){ const d=document.createElement('button'); d.id='deleteEdgeBtn'; d.textContent='Delete Edge'; d.className='btn'; wrap.appendChild(d);
      // try to move next to addEdge button in controls if present
      const addEdgeControl = document.getElementById('addEdgeBtn');
      if(addEdgeControl && addEdgeControl.parentNode){ addEdgeControl.parentNode.insertBefore(d, addEdgeControl.nextSibling); }
    }
  }
  ensureExtras();
  const clearStepsBtn = document.getElementById('clearStepsBtn');
  const costLabel = document.getElementById('costLabel');
  const deleteEdgeBtn = document.getElementById('deleteEdgeBtn');

  // ensure structure visualization panel
  function ensureStructurePanel(){
    if(document.getElementById('structurePanel')) return;
    const container = document.createElement('div');
    container.id = 'structurePanel';
    container.style.cssText = 'margin:8px 0;font-size:13px;max-width:100%;overflow:auto;padding:6px;border-radius:6px;background:#fbfcff;border:1px solid #eef3ff';
    // prefer sidebar controls if present so the panel is clearly visible
    const controlsArea = document.querySelector('.sidebar .controls');
    if(controlsArea){ controlsArea.insertBefore(container, controlsArea.firstChild); }
    else {
      const target = document.getElementById('gv-extras') || document.querySelector('header') || document.body;
      if(target && target.parentNode) target.parentNode.insertBefore(container, target.nextSibling?.nextSibling || target.nextSibling);
      else document.body.appendChild(container);
    }
    container.innerHTML = '<strong>Structure:</strong><div id="structureContent" style="margin-top:6px"></div>';
  }
  ensureStructurePanel();

  function updateStructure(name, items){
    ensureStructurePanel();
    const panel = document.getElementById('structurePanel');
    const content = document.getElementById('structureContent');
    if(!panel || !content) return;
    panel.querySelector('strong').textContent = name + ':';
    // build chips
    content.innerHTML = '';
    const list = (items||[]);
    list.forEach(x=>{
      const s = document.createElement('span');
      s.style.cssText = 'display:inline-block;padding:4px 8px;margin:4px 4px;border-radius:6px;background:#f0f4ff;border:1px solid #e0e6ff;font-size:12px';
      s.textContent = x;
      content.appendChild(s);
    });
    if(list.length===0) content.textContent = '(empty)';
    panel.style.display = 'block';
    panel.style.minHeight = '32px';
  }
  function clearStructure(){ const content=document.getElementById('structureContent'); const panel=document.getElementById('structurePanel'); if(content) content.innerHTML=''; if(panel) panel.querySelector('strong').textContent='Structure:'; }

  let mode = 'addNode';
  let edgeFrom = null;
  let dragging = null;
  let startNode = null;
  let speed = Number(speedRange?.value || 400);

  // runner state
  let steps = [];
  let stepIndex = 0;
  let running = false;
  let paused = false;
  const resumeListeners = [];

  const STORAGE_KEY = 'graphvisual_graph_v1';

  function svgPoint(evt){ // robustly convert client coords -> SVG coords with fallback
    try{
      const pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
      const ctm = svg.getScreenCTM(); if(ctm) return pt.matrixTransform(ctm.inverse());
    }catch(e){}
    // fallback: map using bounding rect and viewBox/width ratio
    const rect = svg.getBoundingClientRect(); const rx = (evt.clientX - rect.left); const ry = (evt.clientY - rect.top);
    // compute SVG scale factors
    const vb = svg.viewBox && svg.viewBox.baseVal;
    let svgW = rect.width, svgH = rect.height, offsetX = 0, offsetY = 0;
    if(vb && vb.width && vb.height){ svgW = vb.width; svgH = vb.height; }
    const x = (rx / rect.width) * svgW + (vb? vb.x : 0);
    const y = (ry / rect.height) * svgH + (vb? vb.y : 0);
    return { x, y };
  }

  class Graph{
    constructor(){ this.nodes=[]; this.edges=[]; this._nid=1; this._eid=1 }
    addNode(x,y){ const n={id:this._nid++, x,y}; this.nodes.push(n); return n }
    removeNode(id){ this.nodes=this.nodes.filter(n=>n.id!==id); this.edges=this.edges.filter(e=>e.u!==id && e.v!==id) }
    addEdge(u,v,capacity=10,weight=null){ const e={id:this._eid++, u,v,capacity,weight:(weight==null?capacity:weight),flow:0}; this.edges.push(e); return e }
    findEdge(u,v){ if(directedCheckbox && directedCheckbox.checked) return this.edges.find(e=>e.u===u && e.v===v); return this.edges.find(e=> (e.u===u && e.v===v) || (e.u===v && e.v===u) ); }
    neighborsWithEdge(u){ if(directedCheckbox && directedCheckbox.checked) return this.edges.filter(e=>e.u===u).map(e=>({v:e.v,edge:e})); const out=[]; for(const e of this.edges){ if(e.u===u) out.push({v:e.v,edge:e}); else if(e.v===u) out.push({v:e.u,edge:e}); } return out }
    clear(){ this.nodes=[]; this.edges=[]; this._nid=1; this._eid=1 }
    random(n=6){ this.clear(); const cx=400,cy=260,r=160; for(let i=0;i<n;i++){ const a=(i/n)*Math.PI*2; const x=cx+Math.cos(a)*r+(Math.random()-0.5)*40; const y=cy+Math.sin(a)*r+(Math.random()-0.5)*40; this.addNode(x,y);} for(let i=0;i<Math.floor(n*1.3);i++){ const u=this.nodes[Math.floor(Math.random()*this.nodes.length)].id; const v=this.nodes[Math.floor(Math.random()*this.nodes.length)].id; if(u!==v) this.addEdge(u,v,Math.floor(Math.random()*12)+3, Math.floor(Math.random()*12)+1); } }
  }

  function saveGraph(){ try{ const data={ nodes: graph.nodes.map(n=>({id:n.id,x:n.x,y:n.y})), edges: graph.edges.map(e=>({id:e.id,u:e.u,v:e.v,capacity:e.capacity,weight:e.weight})), _nid:graph._nid, _eid:graph._eid }; localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); updateTotalCost(); }catch(e){} }
  function loadGraph(){ try{ const s=localStorage.getItem(STORAGE_KEY); if(!s) return false; const obj = JSON.parse(s); graph.nodes = (obj.nodes||[]).map(n=>({id:n.id,x:n.x,y:n.y})); graph.edges = (obj.edges||[]).map(e=>({id:e.id,u:e.u,v:e.v,capacity:e.capacity,weight:e.weight,flow:0})); graph._nid = obj._nid || (graph.nodes.reduce((m,n)=>Math.max(m,n.id),0)+1); graph._eid = obj._eid || (graph.edges.reduce((m,e)=>Math.max(m,e.id),0)+1); return true;}catch(e){return false;} }

  function updateTotalCost(){ if(!costLabel) return; const total = graph.edges.reduce((s,e)=>s + Number(e.weight||0),0); costLabel.textContent = `Total weight: ${total}`; }

  class Renderer{
    constructor(svg,graph){ this.svg=svg; this.graph=graph; this.nodeEls=new Map(); this.edgeEls=new Map(); this._initDefs(); }
    _initDefs(){ const defs=document.createElementNS(svgNS,'defs'); const m=document.createElementNS(svgNS,'marker'); m.setAttribute('id','arrow'); m.setAttribute('markerWidth','10'); m.setAttribute('markerHeight','10'); m.setAttribute('refX','10'); m.setAttribute('refY','5'); m.setAttribute('orient','auto'); const p=document.createElementNS(svgNS,'path'); p.setAttribute('d','M0,0 L10,5 L0,10 z'); p.setAttribute('fill','#444'); m.appendChild(p); defs.appendChild(m); this.svg.appendChild(defs); }
    clearElements(){ [...this.svg.children].forEach(ch=>{ if(ch.tagName!=='defs') this.svg.removeChild(ch); }); this.nodeEls.clear(); this.edgeEls.clear(); }
    render(){ this.clearElements(); // edges
      for(const e of this.graph.edges){ const g=document.createElementNS(svgNS,'g'); g.classList.add('edge-group'); const line=document.createElementNS(svgNS,'line'); line.setAttribute('class','edge'); line.setAttribute('data-id', e.id); if(directedCheckbox && directedCheckbox.checked) line.setAttribute('marker-end','url(#arrow)'); g.appendChild(line); const label=document.createElementNS(svgNS,'text'); label.setAttribute('class','edge-label'); label.setAttribute('data-id', e.id); const labelValue = (page==='maxflow')? `${e.flow||0}/${e.capacity||0}` : (e.weight!=null? String(e.weight): ''); label.textContent = labelValue; g.appendChild(label); this.svg.appendChild(g); this.edgeEls.set(e.id,{group:g,line,label});
        // attach click handlers to allow editing weight
        try{
          line.style.cursor = 'pointer'; label.style.cursor = 'pointer';
          line.addEventListener('click', (ev)=>{ ev.stopPropagation(); if(mode==='deleteEdge'){ graph.edges = graph.edges.filter(xx=>xx.id!==e.id); renderer.render(); saveGraph(); } else { showEdgeEditor(e); } });
          label.addEventListener('click', (ev)=>{ ev.stopPropagation(); if(mode==='deleteEdge'){ graph.edges = graph.edges.filter(xx=>xx.id!==e.id); renderer.render(); saveGraph(); } else { showEdgeEditor(e); } });
        }catch(e){}
      }

      // nodes
      for(const n of this.graph.nodes){ const g=document.createElementNS(svgNS,'g'); g.setAttribute('class','node'); g.setAttribute('data-id',n.id); const circle=document.createElementNS(svgNS,'circle'); circle.setAttribute('r','18'); circle.setAttribute('cx',0); circle.setAttribute('cy',0); const text=document.createElementNS(svgNS,'text'); text.setAttribute('y','5'); text.setAttribute('text-anchor','middle'); text.textContent = n.id; g.appendChild(circle); g.appendChild(text); this.svg.appendChild(g); this.nodeEls.set(n.id,{group:g,circle,text});
        circle.addEventListener('pointerdown',(ev)=>{ ev.stopPropagation(); this._startDrag(n.id,ev); });
        g.addEventListener('click',(ev)=>{ ev.stopPropagation(); handleNodeClick(n.id); });
        g.addEventListener('dblclick',(ev)=>{ ev.stopPropagation(); setStart(n.id); });
        g.addEventListener('contextmenu',(ev)=>{ ev.preventDefault(); graph.removeNode(n.id); this.render(); saveGraph(); });
      }
      this.updatePositions();
      // after rendering, ensure fit if auto-fit is enabled
      try{ if(typeof fitToView === 'function' && autoFitOnRender) fitToView(); }catch(e){}
    }
    _startDrag(id,ev){ dragging={id,pid:ev.pointerId}; try{ ev.target.setPointerCapture(ev.pointerId); }catch{} }
    updatePositions(){ // compute groups for parallel edges
      const groups = new Map();
      for(const e of this.graph.edges){ const key = (directedCheckbox && directedCheckbox.checked) ? `${e.u}->${e.v}` : `${Math.min(e.u,e.v)}_${Math.max(e.u,e.v)}`; if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(e); }
      for(const arr of groups.values()){ const c = arr.length; for(let i=0;i<arr.length;i++){ arr[i]._offset = (i - (c-1)/2) * 12; } }

      for(const n of this.graph.nodes){ const el=this.nodeEls.get(n.id); if(!el) continue; el.group.setAttribute('transform',`translate(${n.x},${n.y})`); }
      for(const e of this.graph.edges){
        const src=this.graph.nodes.find(x=>x.id===e.u);
        const dst=this.graph.nodes.find(x=>x.id===e.v);
        const el=this.edgeEls.get(e.id);
        if(!el||!src||!dst) continue;
        const dx=dst.x-src.x; const dy=dst.y-src.y; const len=Math.max(Math.hypot(dx,dy),1);
        const px=-dy/len; const py=dx/len; const off=e._offset||0; const offX=px*off; const offY=py*off;
        const x1=src.x+offX; const y1=src.y+offY; const x2=dst.x+offX; const y2=dst.y+offY;
        el.line.setAttribute('x1',x1); el.line.setAttribute('y1',y1); el.line.setAttribute('x2',x2); el.line.setAttribute('y2',y2);
        const mx=(x1+x2)/2; const my=(y1+y2)/2;
        el.label.setAttribute('x', mx + offX*0.3); el.label.setAttribute('y', my + offY*0.3 - 6);
        const labelValue = (page==='maxflow')? `${e.flow||0}/${e.capacity||0}` : (e.weight!=null? String(e.weight): '');
        if(el.label.textContent !== labelValue){ el.label.textContent = labelValue; el.label.classList.remove('updated'); void el.label.offsetWidth; el.label.classList.add('updated'); }
      }
    }
    highlightNode(id,cls){ const el=this.nodeEls.get(id); if(!el) return; el.group.classList.remove('queued','visiting','visited','start'); if(cls) el.group.classList.add(cls); }
    highlightEdge(eid,cls){ const el=this.edgeEls.get(eid); if(!el) return; el.line.classList.remove('active','augment'); if(cls) el.line.classList.add(cls); }
    clearAllHighlights(){ for(const k of this.nodeEls.keys()){ const el=this.nodeEls.get(k); el.group.classList.remove('queued','visiting','visited','start'); const t=el.text; if(t) t.textContent = k; if(el && el.circle) el.circle.style.fill = ''; } for(const k of this.edgeEls.keys()){ const el=this.edgeEls.get(k); el.line.classList.remove('active','augment'); if(el && el.line){ el.line.style.stroke = ''; el.line.style.strokeWidth = ''; } } }
  }

  const graph = new Graph();
  const renderer = new Renderer(svg, graph);
  if(!loadGraph()){ graph.random(6); saveGraph(); }
  renderer.render();
  // ensure the structure panel exists after render so sidebar elements are present
  ensureStructurePanel();

  // auto-fit behavior
  let autoFitOnRender = true;
  function animateViewBox(from, to, duration=420){
    const start = performance.now();
    function ease(t){ return 1 - Math.pow(1-t, 3); }
    function step(now){ const t = Math.min(1, (now - start) / duration); const e = ease(t); const cx = from.x + (to.x - from.x) * e; const cy = from.y + (to.y - from.y) * e; const cw = from.w + (to.w - from.w) * e; const ch = from.h + (to.h - from.h) * e; svg.setAttribute('viewBox', `${cx} ${cy} ${cw} ${ch}`); if(t < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }

  function fitToView(){
    if(!graph.nodes || graph.nodes.length===0) return;
    // compute bounds of nodes
    let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
    for(const n of graph.nodes){ if(n.x < minX) minX = n.x; if(n.y < minY) minY = n.y; if(n.x > maxX) maxX = n.x; if(n.y > maxY) maxY = n.y; }
    if(!isFinite(minX)) return;
    const pad = 40; const w = Math.max(100, (maxX - minX) + pad*2); const h = Math.max(80, (maxY - minY) + pad*2);
    const vbX = minX - pad; const vbY = minY - pad;
    // determine current viewBox
    let cur = { x:0,y:0,w:svg.clientWidth||800,h:svg.clientHeight||600 };
    try{ const vb = svg.viewBox && svg.viewBox.baseVal; if(vb && vb.width && vb.height) cur = { x: vb.x, y: vb.y, w: vb.width, h: vb.height }; else {
        const rect = svg.getBoundingClientRect(); cur = { x: 0, y: 0, w: rect.width, h: rect.height }; }
    }catch(e){}
    const target = { x: vbX, y: vbY, w, h };
    animateViewBox(cur, target, 420);
  }

  // inline edge weight editor
  function showEdgeEditor(edge){
    if(!edge) return;
    // reuse existing input
    let input = document.getElementById('edgeWeightInput');
    if(!input){ input = document.createElement('input'); input.id = 'edgeWeightInput'; input.type = 'text'; document.body.appendChild(input); }
    // find label element for this edge
    const el = renderer.edgeEls.get(edge.id);
    if(!el) return;
    const rect = el.label.getBoundingClientRect();
    input.style.left = Math.round(rect.left) + 'px';
    input.style.top = Math.round(rect.top - rect.height/2) + 'px';
    input.value = (edge.weight!=null ? String(edge.weight) : '');
    input.style.display = 'block'; input.focus(); input.select();
    function done(save){ if(save){ const v = input.value.trim(); if(v==='') edge.weight = null; else { const num = Number(v); edge.weight = isNaN(num)? v : num; } renderer.updatePositions(); saveGraph(); updateTotalCost(); } input.style.display='none'; input.removeEventListener('blur', onBlur); input.removeEventListener('keydown', onKey);
      input.remove(); }
    function onBlur(){ done(true); }
    function onKey(ev){ if(ev.key==='Enter'){ done(true); } else if(ev.key==='Escape'){ done(false); } }
    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKey);
    // stop svg interactions while editing
    setTimeout(()=>{ input.addEventListener('pointerdown', e=>e.stopPropagation()); },0);
  }

  // debounce helper
  function debounce(fn,wait=120){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; }

  // wire resize/orientation auto-fit
  const debFit = debounce(()=>{ autoFitOnRender = true; fitToView(); }, 160);
  window.addEventListener('resize', debFit);
  window.addEventListener('orientationchange', debFit);

  // initial fit
  try{ fitToView(); }catch(e){}

  document.addEventListener('pointermove',(ev)=>{
    if(!dragging) return; if(ev.pointerId !== dragging.pid) return;
    const p = svgPoint(ev); const node = graph.nodes.find(n=>n.id===dragging.id);
    if(node){
      // clamp to visible svg bbox in SVG coordinates to avoid nodes being dragged offscreen
      const rect = svg.getBoundingClientRect(); const vb = svg.viewBox && svg.viewBox.baseVal;
      let minX = 0, minY = 0, maxX = rect.width, maxY = rect.height;
      if(vb && vb.width && vb.height){ minX = vb.x; minY = vb.y; maxX = vb.x + vb.width; maxY = vb.y + vb.height; }
      // if svgPoint returned an object without matrixTransform, it already is {x,y}
      const nx = Math.max(minX + 12, Math.min(maxX - 12, p.x));
      const ny = Math.max(minY + 12, Math.min(maxY - 12, p.y));
      node.x = nx; node.y = ny; renderer.updatePositions();
    }
  });

  document.addEventListener('pointerup',(ev)=>{
    if(!dragging) return; if(ev.pointerId !== dragging.pid) return;
    try{ const el = renderer.nodeEls.get(dragging.id); el?.circle?.releasePointerCapture?.(dragging.pid); }catch{}
    dragging = null; saveGraph();
  });

  function handleNodeClick(id){ if(mode==='addEdge'){ if(!edgeFrom){ edgeFrom=id; renderer.highlightNode(id,'queued'); } else { if(edgeFrom!==id){ graph.addEdge(edgeFrom,id,10,10); renderer.render(); saveGraph(); } edgeFrom=null; } }
  }

  function setStart(id){ startNode = id; renderer.clearAllHighlights(); renderer.highlightNode(id,'start'); if(startLabel) startLabel.textContent = id; }

  function prepareSteps(pageName){ steps=[]; stepIndex=0; renderer.clearAllHighlights(); clearStructure(); if(pageName==='bfs') buildBFS(); else if(pageName==='dfs') buildDFS(); else if(pageName==='scc') buildSCC(); else if(pageName==='maxflow') buildMaxFlow(); else if(pageName==='dijkstra') buildDijkstra(); else if(pageName==='mst' || pageName==='kruskal') buildMST(); }
  
  

  function buildBFS(){
    const s = startNode || (graph.nodes[0] && graph.nodes[0].id);
    if(!s){ alert('Set a start node by double-clicking a node.'); return; }
    const q = [s]; const seen = new Set([s]);
    const snap0 = q.slice(); steps.push(()=>{ renderer.highlightNode(s,'queued'); updateStructure('Queue', snap0); });
    while(q.length){
      const u = q.shift();
      const snap1 = q.slice(); steps.push(()=>{ renderer.highlightNode(u,'visiting'); updateStructure('Queue', snap1); });
      const nbrs = graph.neighborsWithEdge(u).map(x=>x.v);
      for(const v of nbrs){
        if(!seen.has(v)){
          seen.add(v);
          q.push(v);
          const e = graph.findEdge(u,v);
          if(e) steps.push(()=>renderer.highlightEdge(e.id,'active'));
          const snap2 = q.slice(); steps.push(()=>{ renderer.highlightNode(v,'queued'); updateStructure('Queue', snap2); });
        }
      }
      steps.push(()=>renderer.highlightNode(u,'visited'));
    }
    steps.push(()=>clearStructure());
  }


  function buildDFS(){
    const s = startNode || (graph.nodes[0] && graph.nodes[0].id);
    if(!s){ alert('Set a start node by double-clicking a node.'); return; }
    const seen = new Set(); const stackArr = [];
    function dfs(u){
      seen.add(u);
      stackArr.push(u);
      const snapPush = stackArr.slice();
      steps.push(()=>{ renderer.highlightNode(u,'visiting'); updateStructure('Stack', snapPush); });
      for(const item of graph.neighborsWithEdge(u)){
        const v = item.v; const e = item.edge;
        if(!seen.has(v)){
          if(e) steps.push(()=>renderer.highlightEdge(e.id,'active'));
          dfs(v);
        }
      }
      stackArr.pop();
      const snapPop = stackArr.slice();
      steps.push(()=>{ renderer.highlightNode(u,'visited'); updateStructure('Stack', snapPop); });
    }
    dfs(s);
    for(const n of graph.nodes) if(!seen.has(n.id)) dfs(n.id);
    steps.push(()=>clearStructure());
  }

  function buildSCC(){
    // Kosaraju's algorithm with safer step generation and node checks
    const ids = graph.nodes.map(n=>n.id);
    const adj = new Map(); ids.forEach(id=>adj.set(id,[]));
    for(const e of graph.edges){ if(adj.has(e.u)) adj.get(e.u).push(e.v); }
    const visited = new Set();
    const order = [];
    function dfs1(u){ visited.add(u); for(const v of (adj.get(u)||[])){ if(!visited.has(v)) dfs1(v); } order.push(u); }
    ids.forEach(id=>{ if(!visited.has(id)) dfs1(id); });

    // reverse graph
    const radj = new Map(); ids.forEach(id=>radj.set(id,[]));
    for(const e of graph.edges){ if(radj.has(e.v)) radj.get(e.v).push(e.u); }

    const compSeen = new Set();
    let colorIdx = 0;
    while(order.length){
      const u = order.pop();
      if(compSeen.has(u)) continue;
      const stack = [u];
      const comp = [];
      while(stack.length){
        const x = stack.pop();
        if(compSeen.has(x)) continue;
        compSeen.add(x);
        comp.push(x);
        for(const w of (radj.get(x)||[])) if(!compSeen.has(w)) stack.push(w);
      }
      const hue = (colorIdx * 67) % 360;
      const fill = `hsl(${hue} 70% 70%)`;
      for(const id of comp){
        // push a safe step (check element existence at run-time)
        steps.push(()=>{
          const el = renderer.nodeEls.get(id);
          if(el && el.circle) el.circle.style.fill = fill;
        });
      }
      colorIdx++;
    }
  }

  function buildMaxFlow(){ if(graph.nodes.length<2){ alert('Need at least source and sink nodes.'); return; } const s = startNode || graph.nodes[0].id; const t = graph.nodes[graph.nodes.length-1].id; function bfsPath(){ const q=[s]; const parent=new Map(); parent.set(s,null); while(q.length){ const u=q.shift(); for(const e of graph.edges.filter(x=>x.u===u)){ const residual = e.capacity - e.flow; if(residual>0 && !parent.has(e.v)){ parent.set(e.v,{edge:e,from:u}); q.push(e.v); if(e.v===t) return parent; } } } return null; } let iter=0; while(iter<50){ const prev=bfsPath(); if(!prev) break; let cur=t; const path=[]; while(cur!==s){ const info=prev.get(cur); if(!info) break; path.push(info.edge); cur = info.from; } path.reverse(); let bottleneck=Infinity; for(const e of path) bottleneck=Math.min(bottleneck, e.capacity - e.flow); for(const e of path) steps.push(()=>renderer.highlightEdge(e.id,'augment')); for(const e of path) steps.push(()=>{ e.flow += bottleneck; renderer.updatePositions(); }); iter++; } }

  function buildDijkstra(){
    const s = startNode || (graph.nodes[0] && graph.nodes[0].id);
    if(!s){ alert('Set a start node by double-clicking a node.'); return; }
    const dist = new Map(); const prev = new Map();
    for(const n of graph.nodes) dist.set(n.id, Infinity);
    dist.set(s,0);
    const Q = new Set(graph.nodes.map(n=>n.id));
    function formatPQ(){ return Array.from(Q).sort((a,b)=> (dist.get(a)||Infinity) - (dist.get(b)||Infinity)).map(id=>`${id}${dist.get(id)===Infinity? ' (∞)': ' ('+dist.get(id)+')'}`); }
    const snapPQ0 = formatPQ(); steps.push(()=>{ renderer.highlightNode(s,'queued'); if(costLabel) costLabel.textContent = `Source: ${s}`; updateStructure('Priority Queue', snapPQ0); });
    while(Q.size){
      let u=null; let best=Infinity;
      for(const id of Q) if(dist.get(id) < best){ best = dist.get(id); u = id; }
      if(u==null) break;
      Q.delete(u);
      const snapPQ1 = formatPQ(); steps.push(()=>{ renderer.highlightNode(u,'visiting'); if(costLabel) costLabel.textContent = `Visiting ${u} dist=${dist.get(u)===Infinity? '∞': dist.get(u)}`; updateStructure('Priority Queue', snapPQ1); });
      for(const item of graph.neighborsWithEdge(u)){
        const v = item.v; const e = item.edge; const alt = dist.get(u) + (e.weight||1);
        if(alt < dist.get(v)){
          dist.set(v, alt); prev.set(v, u);
          const snapPQ2 = formatPQ(); steps.push(()=>{ renderer.highlightEdge(e.id,'active'); const el = renderer.nodeEls.get(v); if(el) el.text.textContent = `${v} (${dist.get(v)})`; if(costLabel) costLabel.textContent = `Updated: ${v} = ${dist.get(v)}`; updateStructure('Priority Queue', snapPQ2); });
        }
      }
      const snapPQ3 = formatPQ(); steps.push(()=>{ renderer.highlightNode(u,'visited'); updateStructure('Priority Queue', snapPQ3); });
    }
    steps.push(()=>{ for(const n of graph.nodes){ const el=renderer.nodeEls.get(n.id); if(el) el.text.textContent = `${n.id}${dist.get(n.id)<Infinity? ' ('+dist.get(n.id)+')':''}`; } if(costLabel) costLabel.textContent = 'Dijkstra finished'; clearStructure(); });
  }

  function buildMST(){ if(graph.nodes.length===0) return; // Kruskal
    const parent = {};
    function find(x){ if(parent[x]==null) parent[x]=x; while(parent[x]!==x){ parent[x]=parent[parent[x]]; x=parent[x]; } return x; }
    function union(a,b){ parent[find(a)] = find(b); }
    const edges = graph.edges.slice().sort((a,b)=> (a.weight||0) - (b.weight||0)); let total=0;
    for(const e of edges){
      // highlight considered edge (no color change unless accepted)
      // skip applying 'active' class to avoid coloring non-selected edges
      if(find(e.u) !== find(e.v)){
        union(e.u,e.v);
        total += (e.weight||0);
        // mark edge as part of MST and show augment
        steps.push(()=>{ e._inMST = true; renderer.highlightEdge(e.id,'augment'); if(costLabel) costLabel.textContent = `MST cost: ${total}`; });

        // recolor MST edges by their current component (show progress)
        steps.push(()=>{
          const p = {};
          function f(x){ if(p[x]==null) p[x]=x; while(p[x]!==x){ p[x]=p[p[x]]; x=p[x]; } return x; }
          function u(a,b){ p[f(a)] = f(b); }
          for(const ee of graph.edges){ if(ee._inMST) u(ee.u, ee.v); }
          const repIndex = new Map(); let idx=0;
          for(const ee of graph.edges){ if(ee._inMST){ const r=f(ee.u); if(!repIndex.has(r)) repIndex.set(r, idx++); } }
          for(const ee of graph.edges){ const el = renderer.edgeEls.get(ee.id); if(ee._inMST){ const r=f(ee.u); const id = repIndex.get(r); const hue = (id*73)%360; const color = `hsl(${hue} 70% 40%)`; if(el && el.line){ el.line.style.stroke = color; el.line.style.strokeWidth = '3px'; } } else { if(el && el.line){ el.line.style.stroke = ''; el.line.style.strokeWidth = ''; } } }
        });
      } else {
        steps.push(()=>renderer.highlightEdge(e.id,null));
      }
    }
    
    // cleanup _inMST flags after coloring (clearSteps will reset fills)
    steps.push(()=>{ for(const e of graph.edges) delete e._inMST; });
  }

  async function play(){ running=true; pauseBtn && (pauseBtn.textContent='Pause'); while(stepIndex < steps.length){ if(paused){ await new Promise(r=>resumeListeners.push(r)); } try{ const fn = steps[stepIndex]; if(typeof fn==='function') fn(); }catch(e){} stepIndex++; await sleep(speed); } running=false; pauseBtn && (pauseBtn.textContent='Pause'); }

  function pauseToggle(){ paused = !paused; if(!paused){ while(resumeListeners.length) resumeListeners.shift()(); pauseBtn && (pauseBtn.textContent='Pause'); } else { pauseBtn && (pauseBtn.textContent='Resume'); } }

  function clearSteps(){ steps=[]; stepIndex=0; paused=false; running=false; renderer.clearAllHighlights(); clearStructure(); if(costLabel) costLabel.textContent=''; for(const n of graph.nodes){ const el=renderer.nodeEls.get(n.id); if(el) el.text.textContent = `${n.id}`; } for(const e of graph.edges) e.flow = 0; renderer.updatePositions(); }

  // enhance clearSteps with a short animation trigger
  const origClearSteps = clearSteps;
  function animatedClearSteps(){
    // trigger svg animation
    svg.classList.add('svg-clear-anim');
    const panel = document.getElementById('structurePanel');
    if(panel) panel.classList.add('structure-spark');
    // call original logic
    origClearSteps();
    // remove animation classes shortly after
    setTimeout(()=>{ svg.classList.remove('svg-clear-anim'); if(panel) panel.classList.remove('structure-spark'); }, 520);
  }
  // replace clearSteps usage in UI handlers
  clearStepsBtn?.addEventListener('click', ()=>{ animatedClearSteps(); });
  

  addNodeBtn?.addEventListener('click', ()=>{ mode='addNode'; addNodeBtn.classList.add('active'); addEdgeBtn.classList.remove('active'); edgeFrom=null; });
  addEdgeBtn?.addEventListener('click', ()=>{ mode='addEdge'; addEdgeBtn.classList.add('active'); addNodeBtn.classList.remove('active'); edgeFrom=null; });
  addEdgeBtn?.addEventListener('click', ()=>{ deleteEdgeBtn?.classList.remove('active'); });
  deleteEdgeBtn?.addEventListener('click', ()=>{ if(mode==='deleteEdge'){ mode='addNode'; deleteEdgeBtn.classList.remove('active'); } else { mode='deleteEdge'; deleteEdgeBtn.classList.add('active'); addEdgeBtn?.classList.remove('active'); edgeFrom=null; } });
  randomBtn?.addEventListener('click', ()=>{ graph.random(6); renderer.render(); saveGraph(); });
  clearBtn?.addEventListener('click', ()=>{ graph.clear(); renderer.render(); startNode=null; if(startLabel) startLabel.textContent='none'; saveGraph(); });
  speedRange?.addEventListener('input',(e)=>{ speed = Number(e.target.value); });

  svg.addEventListener('click',(e)=>{ if(mode!=='addNode') return; if(e.target!==svg) return; const p=svgPoint(e); graph.addNode(p.x,p.y); renderer.render(); saveGraph(); });
  pauseBtn?.addEventListener('click', ()=>{ pauseToggle(); });
  stepBtn?.addEventListener('click', ()=>{ if(steps.length===0) prepareSteps(page); if(stepIndex < steps.length){ const fn=steps[stepIndex]; if(typeof fn==='function') fn(); stepIndex++; } });
  runBtn?.addEventListener('click', ()=>{ prepareSteps(page); if(steps.length>0){ stepIndex=0; paused=false; play(); } else { console.warn('No steps prepared — nothing to run.'); } });
  clearStepsBtn?.addEventListener('click', ()=>{ clearSteps(); });

  window.__graph = graph;
  window.__renderer = renderer;
  window.__runner = { run(p){ prepareSteps(p||page); stepIndex=0; paused=false; play(); }, pause: pauseToggle, clear: clearSteps };

  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  document.addEventListener('keydown',(ev)=>{ if(ev.key==='e'){ mode = mode==='addEdge'?'addNode':'addEdge'; addEdgeBtn.classList.toggle('active'); addNodeBtn.classList.toggle('active'); } });

  // show initial total
  updateTotalCost();

})();
