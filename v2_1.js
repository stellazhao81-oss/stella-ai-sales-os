/* Stella AI Sales OS V2.1 — Daily Execution Engine
   Purpose:
   - Convert the full customer pool into a usable daily queue
   - Keep "today must follow" at 30 or fewer
   - Separate this week vs low-frequency nurture
   - Does not modify Supabase data automatically
*/
(function(){
  let triageMode = "today";

  function daysFrom(dateStr){
    if(!dateStr) return null;
    const d = new Date(dateStr + "T00:00:00");
    const t = new Date(today() + "T00:00:00");
    if(isNaN(d)) return null;
    return Math.round((d - t) / 86400000);
  }

  function customerTextV21(c){
    const ev = activities
      .filter(a=>a.customer_id===c.id)
      .map(a=>[a.activity_type,a.channel,a.note].join(" "));
    return [
      c.company,c.contact,c.country,c.role,c.source,c.product,c.status,
      c.blocker,c.notes,...(c.tags||[]),...ev
    ].join(" ").toLowerCase();
  }

  function triageScore(c){
    if(c.status==="Won") return -999;

    let score = ({A:35,B:18,C:5}[c.priority] || 0);
    score += ({
      Project:35,
      Quoted:32,
      Sample:30,
      Replied:24,
      "Waiting Reply":20,
      Developing:10,
      Nurture:-30
    }[c.status] || 0);

    const t = customerTextV21(c);
    const nextDelta = daysFrom(c.nextFollowup);
    const lastDelta = c.lastContact ? -daysFrom(c.lastContact) : null;

    // Due dates matter, but very old imported dates should not dominate forever.
    if(nextDelta !== null){
      if(nextDelta <= 0) score += 18;
      else if(nextDelta <= 3) score += 12;
      else if(nextDelta <= 7) score += 7;
      if(nextDelta < -14) score += 4;
    }else{
      score += 5;
    }

    if(lastDelta !== null){
      if(lastDelta >= 30) score += 8;
      else if(lastDelta >= 8) score += 5;
      else if(lastDelta <= 2 && !["Replied","Sample"].includes(c.status)) score -= 5;
    }

    if(/样品|sample/.test(t)) score += 8;
    if(/报价|quote|quotation|rfq/.test(t)) score += 7;
    if(/项目|project|hotel|tender|bid|award/.test(t)) score += 8;
    if(/采购|purchase|order|quantity|pcs|sqm|㎡|container/.test(t)) score += 8;
    if(/回复|replied|customer reply/.test(t)) score += 5;
    if(/已读|seen|未回复|no reply/.test(t)) score += 2;

    if(/低频|暂不投入|不匹配|not suitable|low frequency/.test(t)) score -= 18;
    if(/closed|不开发|放弃/.test(t)) score -= 60;

    return score;
  }

  function triageBuckets(){
    const active = customers
      .filter(c=>c.status!=="Won")
      .map(c=>({c,score:triageScore(c)}))
      .sort((a,b)=>b.score-a.score || (a.c.nextFollowup||"9999").localeCompare(b.c.nextFollowup||"9999"));

    const todayMust = active.filter(x=>x.score>=45).slice(0,30);
    const todayIds = new Set(todayMust.map(x=>x.c.id));

    const thisWeek = active
      .filter(x=>!todayIds.has(x.c.id))
      .filter(x=>{
        const d=daysFrom(x.c.nextFollowup);
        return x.score>=25 || (d!==null && d<=7);
      });

    const weekIds = new Set(thisWeek.map(x=>x.c.id));
    const nurture = active.filter(x=>!todayIds.has(x.c.id) && !weekIds.has(x.c.id));

    return {todayMust,thisWeek,nurture};
  }

  function ensureTriageUI(){
    const dash = $("dashboardView");
    if(!dash) return;

    if(!document.getElementById("v21Styles")){
      const st=document.createElement("style");
      st.id="v21Styles";
      st.textContent=`
        .v21-triage{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}
        .v21-card{border:1px solid var(--border);background:#fff;border-radius:14px;padding:14px 16px;box-shadow:var(--shadow);cursor:pointer;text-align:left}
        .v21-card.active{border-color:#75c6a5;box-shadow:0 0 0 3px rgba(11,122,83,.08)}
        .v21-card small{display:block;color:var(--muted);font-weight:800}
        .v21-card b{display:block;font-size:27px;margin:4px 0}
        .v21-card span{font-size:12px;color:#607082}
        .v21-score{font-size:11px;color:var(--muted);font-weight:800}
        .v21-mode-label{font-size:12px;color:var(--green);font-weight:900;margin-bottom:8px}
        @media(max-width:780px){.v21-triage{grid-template-columns:1fr}}
      `;
      document.head.appendChild(st);
    }

    if(!$("v21Triage")){
      const box=document.createElement("div");
      box.id="v21Triage";
      box.className="v21-triage";
      box.innerHTML=`
        <button class="v21-card active" data-v21="today">
          <small>今天必须跟进</small><b id="v21Today">0</b><span>最多 30 个，优先最接近成交</span>
        </button>
        <button class="v21-card" data-v21="week">
          <small>本周跟进</small><b id="v21Week">0</b><span>本周安排，不挤占今天</span>
        </button>
        <button class="v21-card" data-v21="nurture">
          <small>低频培育</small><b id="v21Nurture">0</b><span>降低频率，保留未来机会</span>
        </button>`;
      const grid=dash.querySelector(".grid-2");
      dash.insertBefore(box,grid);
      box.querySelectorAll("[data-v21]").forEach(btn=>btn.onclick=()=>{
        triageMode=btn.dataset.v21;
        box.querySelectorAll("[data-v21]").forEach(x=>x.classList.toggle("active",x===btn));
        renderPriority();
      });
    }
  }

  function renderTriageCounts(){
    ensureTriageUI();
    const b=triageBuckets();
    if($("v21Today")) $("v21Today").textContent=b.todayMust.length;
    if($("v21Week")) $("v21Week").textContent=b.thisWeek.length;
    if($("v21Nurture")) $("v21Nurture").textContent=b.nurture.length;
    return b;
  }

  // Override the "Today's Priority" list so it becomes the actual execution queue.
  renderPriority = function(){
    const b=renderTriageCounts();
    const host=$("priorityList");
    if(!host) return;
    host.innerHTML="";

    const map={
      today:["今天必须跟进",b.todayMust],
      week:["本周跟进",b.thisWeek],
      nurture:["低频培育",b.nurture]
    };
    const [label,list]=map[triageMode] || map.today;

    const labelEl=document.createElement("div");
    labelEl.className="v21-mode-label";
    labelEl.textContent=`${label} · ${list.length} 个`;
    host.appendChild(labelEl);

    if(!list.length){
      host.insertAdjacentHTML("beforeend",'<p class="muted">当前没有符合条件的客户。</p>');
      return;
    }

    const display = triageMode==="today" ? list.slice(0,30) : list.slice(0,60);
    display.forEach(({c,score})=>{
      const ai=nextStep(c);
      const d=document.createElement("div");
      d.className="priority";
      d.innerHTML=`
        <div>
          <div class="company">${esc(c.company)}</div>
          <div class="sub">${esc(c.contact||"—")} · ${esc(c.country||"")}</div>
          <div class="sub">${esc(ai.action)}</div>
        </div>
        <div>${badge(c.status)}</div>
        <div>${badge(c.priority,c.priority)}</div>
        <div>${c.nextFollowup||"未安排"}<br><span class="v21-score">优先分 ${score}</span></div>
        <div>›</div>`;
      d.onclick=()=>openCustomer(c.id);
      host.appendChild(d);
    });
  };

  // "今日需跟进" now reflects the smart daily queue, not every old overdue date.
  const oldRenderStatsV21 = renderStats;
  renderStats = function(){
    oldRenderStatsV21();
    const b=triageBuckets();
    if($("sDue")) $("sDue").textContent=b.todayMust.length;
  };

  renderStrategy = function(){
    const b=triageBuckets();
    const must=b.todayMust;
    const counts={
      A:must.filter(x=>x.c.priority==="A").length,
      project:must.filter(x=>x.c.status==="Project").length,
      quoted:must.filter(x=>x.c.status==="Quoted").length,
      sample:must.filter(x=>x.c.status==="Sample").length,
      waiting:must.filter(x=>x.c.status==="Waiting Reply").length
    };
    $("strategyBox").innerHTML=`
      <strong>今天的执行清单：</strong><br>
      系统从 ${customers.length} 条客户记录中筛出 <b>${must.length}</b> 个今天必须跟进客户。<br>
      A 类 ${counts.A} 个 · Project ${counts.project} 个 · Quoted ${counts.quoted} 个 · Sample ${counts.sample} 个 · Waiting Reply ${counts.waiting} 个。<br><br>
      <strong>建议顺序：</strong>先项目/报价/样品，再处理已回复客户，最后处理等待回复。<br><br>
      <strong>原则：</strong>每个客户只推进一个小动作；不要只问 “Any update?”。`;
  };

  // Wrap the existing V2 renderAll once more.
  const previousRenderAllV21 = renderAll;
  renderAll = function(){
    previousRenderAllV21();
    renderTriageCounts();
    renderPriority();
    renderStrategy();
  };

  // If the app is already loaded when this script arrives, render immediately.
  ensureTriageUI();
  if(typeof customers!=="undefined" && customers.length){
    renderTriageCounts();
    renderPriority();
    renderStrategy();
    renderStats();
  }
})();
