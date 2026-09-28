
/* Stella AI Sales OS V2.0
   Adds:
   - customer totals
   - duplicate detection
   - smarter client analysis based on status + notes + activity history
   - recommended channel
   - automatic follow-up date suggestion
   - more context-aware drafting
   No database schema changes required.
*/

(function(){
  function normCompany(s){
    return String(s||"")
      .toLowerCase()
      .replace(/&/g,"and")
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g," ")
      .trim()
      .replace(/\s+/g," ");
  }

  function dupGroups(){
    const m = new Map();
    customers.forEach(c=>{
      const k = normCompany(c.company);
      if(!k) return;
      if(!m.has(k)) m.set(k,[]);
      m.get(k).push(c);
    });
    return [...m.values()].filter(g=>g.length>1).sort((a,b)=>b.length-a.length);
  }

  function allClientText(c){
    const ev = activities
      .filter(a=>a.customer_id===c.id)
      .map(a=>[a.activity_type,a.channel,a.note].join(" "));
    return [
      c.company,c.contact,c.country,c.role,c.source,c.product,c.status,
      c.blocker,c.notes,...(c.tags||[]),...ev
    ].join(" ").toLowerCase();
  }

  function suggestedChannel(c){
    const t = allClientText(c);
    if(c.source==="Alibaba" || /alibaba/.test(t)) return "Alibaba";
    if(c.source==="WhatsApp" || /whatsapp/.test(t)) return "WhatsApp";
    if(c.source==="LinkedIn" || /linkedin/.test(t)) return "LinkedIn";
    if(/电话|phone|call/.test(t)) return "Phone";
    return "Email";
  }

  function scheduleDays(c){
    const t = allClientText(c);
    if(c.status==="Nurture") return 30;
    if(c.status==="Project"){
      if(/中标|tender|bid|award|招标/.test(t)) return 14;
      return 7;
    }
    if(c.status==="Quoted") return 3;
    if(c.status==="Sample"){
      if(/签收|delivered|received|已寄|shipped/.test(t)) return 2;
      return 3;
    }
    if(c.status==="Waiting Reply"){
      if(/已读|seen|read/.test(t)) return 5;
      return 4;
    }
    if(c.status==="Replied") return 2;
    return 5;
  }

  function v2Analysis(c){
    const t = allClientText(c);
    let judgement="", action="", reason="";

    if(/样品/.test(t) && /(不好看|不喜欢|not like|不回复|未回复|已读)/.test(t)){
      judgement="客户曾对样品产生过兴趣，但样品/图片之后停滞。当前更像是产品匹配度或项目优先级下降，而不是完全没有需求。";
      action="不要继续追同一款样品。换 2–3 个更接近客户审美或项目应用的替代方案重新切入，并只问一个选择问题。";
      reason="给客户新的选择，比重复询问原样品更容易重新激活沟通。";
    } else if(/样品费|运费|freight|shipping fee|courier/.test(t)){
      judgement="客户已经进入样品阶段，当前阻力集中在拿样成本、运费或拿样时点。";
      action="先确认是什么让客户延后拿样，再根据原因提供一个可执行选项，不要只重复收费条款。";
      reason="先找到延迟原因，才能判断是预算、项目时间还是内部审批问题。";
    } else if(c.status==="Quoted"){
      judgement="客户已经拿到报价，当前真正要确认的是报价之后卡在哪里。";
      action="确认客户卡在价格、规格、交期、运输、审批还是项目进度中的哪一个点。暂时不要主动降价。";
      reason="报价后的有效跟进应该减少一个不确定性，而不是机械催单。";
    } else if(c.status==="Project" && /中标|tender|bid|award|招标/.test(t)){
      judgement="这是项目型机会，客户是否推进主要取决于项目节点，而不是跟进频率。";
      action="围绕项目是否中标、何时定材或下一次决策节点推进一个问题，同时准备匹配的材料备选。";
      reason="项目客户更适合事件驱动式跟进，避免高频打扰。";
    } else if(c.status==="Sample"){
      judgement="客户已经进入样品验证阶段，购买意向通常高于普通开发客户。";
      action="只推进样品的下一个节点：准备、运费、寄出、签收或评价，不要一次问多个问题。";
      reason="样品阶段最重要的是消除单一阻力并保持节奏。";
    } else if(c.status==="Waiting Reply" || /未回复|已读|seen|no reply/.test(t)){
      judgement="信息已经触达，但客户目前缺少再次回复的新理由。";
      action="换一个切入点，提供与客户业务相关的新信息、替代方案或项目应用，不要只问 “Any update?”。";
      reason="重复上一封内容通常不会改变客户行为。";
    } else if(c.status==="Replied"){
      judgement="客户已经产生过互动，可以从开发阶段进入需求确认阶段。";
      action="一次只问 1–2 个关键问题，优先确认应用、数量、尺寸或项目时间中的关键变量。";
      reason="问题越少越容易得到有效回复，也更方便进入报价。";
    } else if(c.status==="Nurture"){
      judgement="这个客户暂时不属于短期成交对象，需要控制销售时间投入。";
      action="低频培育，每 30 天左右提供一次真正相关的新信息，不做高频催促。";
      reason="保留未来机会，同时把精力留给更接近成交的客户。";
    } else {
      judgement="当前仍处于建立相关性的阶段，尚未形成明确采购信号。";
      action="从客户业务、产品线或项目场景切入，证明为什么值得继续聊，然后只推进一个小动作。";
      reason="早期开发的目标不是立刻成交，而是获得下一步沟通许可。";
    }

    return {
      judgement,
      action,
      reason,
      channel: suggestedChannel(c),
      nextDate: plusDays(today(), scheduleDays(c))
    };
  }

  function ensureV2UI(){
    if(!$("customersView")) return;

    if(!$("customerSummaryV2")){
      const wrap = document.createElement("div");
      wrap.id = "customerSummaryV2";
      wrap.className = "v2-summary";
      wrap.innerHTML = `
        <div class="v2-mini"><span>客户记录</span><b id="v2Total">0</b></div>
        <div class="v2-mini"><span>公司数</span><b id="v2Companies">0</b></div>
        <div class="v2-mini"><span>疑似重复记录</span><b id="v2DupRecords">0</b></div>
        <div class="v2-mini"><span>未安排跟进</span><b id="v2NoFollow">0</b></div>
      `;
      $("customersView").insertBefore(wrap, $("customersView").firstChild);
    }

    const toolbar = $("search")?.closest(".toolbar");
    if(toolbar && !$("v2DuplicateBtn")){
      const btn = document.createElement("button");
      btn.id = "v2DuplicateBtn";
      btn.className = "btn ghost";
      btn.textContent = "重复检测";
      btn.onclick = openDuplicateReviewV2;
      toolbar.insertBefore(btn, toolbar.firstChild);
    }

    if(!document.getElementById("v2Styles")){
      const st = document.createElement("style");
      st.id = "v2Styles";
      st.textContent = `
        .v2-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
        .v2-mini{background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px 16px;box-shadow:var(--shadow)}
        .v2-mini span{display:block;color:var(--muted);font-size:12px;font-weight:800}
        .v2-mini b{display:block;font-size:28px;margin-top:5px}
        .v2-analysis-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
        .v2-analysis-cell{background:#fff;border:1px solid #d9eee4;border-radius:10px;padding:10px}
        .v2-analysis-cell small{display:block;color:var(--muted);margin-bottom:3px}
        .v2-dup{border:1px solid var(--border);border-radius:12px;padding:12px;margin:10px 0;background:#fbfcfd}
        .v2-dup h4{margin:0 0 7px}
        .v2-dup p{margin:4px 0;color:#566476;font-size:13px}
        @media(max-width:780px){.v2-summary{grid-template-columns:1fr 1fr}.v2-analysis-grid{grid-template-columns:1fr}}
      `;
      document.head.appendChild(st);
    }
  }

  function renderV2Summary(){
    ensureV2UI();
    if(!$("v2Total")) return;
    const groups = dupGroups();
    const uniqueCompanies = new Set(customers.map(c=>normCompany(c.company)).filter(Boolean)).size;
    const dupRecords = groups.reduce((n,g)=>n+g.length,0);
    $("v2Total").textContent = customers.length;
    $("v2Companies").textContent = uniqueCompanies;
    $("v2DupRecords").textContent = dupRecords;
    $("v2NoFollow").textContent = customers.filter(c=>!c.nextFollowup && c.status!=="Won").length;
  }

  function openDuplicateReviewV2(){
    const groups = dupGroups();
    $("modal").classList.remove("hidden");
    $("modalTitle").textContent = "重复客户检测";
    $("modalSub").textContent = groups.length
      ? `发现 ${groups.length} 组同名/近似同名公司。系统不会自动删除，请人工确认。`
      : "当前没有检测到明显重复。";

    $("modalBody").innerHTML = groups.length ? groups.map(g=>`
      <div class="v2-dup">
        <h4>${esc(g[0].company)} · ${g.length} 条记录</h4>
        ${g.map(c=>`
          <p><b>${esc(c.contact||"未填联系人")}</b>
          · ${esc(c.country||"未填国家")}
          · ${esc(c.status)}
          · ${esc(c.source||"")}</p>`).join("")}
      </div>
    `).join("") : `<div class="strategy"><strong>很好：</strong>当前没有发现明显重复公司。</div>`;
  }

  // Preserve original functions where useful.
  const originalRenderAll = renderAll;
  renderAll = function(){
    originalRenderAll();
    renderV2Summary();
  };

  const originalGo = go;
  go = function(name){
    originalGo(name);
    if(name==="customers"){
      $("pageSub").textContent = `所有客户、状态与下一步动作。当前共 ${customers.length} 条客户记录。`;
      renderV2Summary();
    }
  };

  nextStep = function(c){
    const a = v2Analysis(c);
    return {action:a.action, reason:a.reason, judgement:a.judgement, channel:a.channel, nextDate:a.nextDate};
  };

  // Replace customer detail with V2 analysis panel.
  openCustomer = function(id){
    const c=customers.find(x=>x.id===id); if(!c)return;
    activeCustomer=c;
    $("modal").classList.remove("hidden");
    $("modalTitle").textContent=c.company;
    $("modalSub").textContent=[c.contact,c.role,c.country].filter(Boolean).join(" · ");

    const ev=activities.filter(a=>a.customer_id===id);
    const ai=v2Analysis(c);

    $("modalBody").innerHTML=`<div class="detail-grid"><div class="stack">
      <div class="card"><h3>客户概况</h3><div class="meta">
        ${meta("状态",c.status)}${meta("优先级",c.priority)}${meta("来源",c.source)}
        ${meta("产品",c.product||"—")}${meta("最后联系",c.lastContact||"—")}
        ${meta("下次跟进",c.nextFollowup||"—")}
      </div></div>

      <div class="card"><h3>V2 智能客户分析</h3><div class="strategy">
        <strong>当前判断：</strong>${esc(ai.judgement)}<br><br>
        <strong>下一步动作：</strong>${esc(ai.action)}<br>
        <strong>为什么：</strong>${esc(ai.reason)}
        <div class="v2-analysis-grid">
          <div class="v2-analysis-cell"><small>建议渠道</small><b>${esc(ai.channel)}</b></div>
          <div class="v2-analysis-cell"><small>建议跟进日期</small><b>${esc(ai.nextDate)}</b></div>
        </div>
        ${c.blocker?`<br><strong>当前卡点：</strong>${esc(c.blocker)}`:""}
      </div></div>

      <div class="card"><div class="panel-head">
        <div><h3>沟通时间线</h3><p>每次跟进都留下记录</p></div>
        <button id="addActivityBtn" class="btn primary">＋ 记录沟通</button>
      </div>
      <div class="timeline">${ev.length?ev.map(e=>`
        <div class="event">
          <div class="event-head">
            <span class="event-type">${esc(e.activity_type)} · ${esc(e.channel||"")}</span>
            <span class="event-date">${e.activity_date}</span>
          </div>
          <div class="event-note">${esc(e.note||"")}</div>
        </div>`).join(""):'<p class="muted">暂无沟通记录。</p>'}
      </div></div>

      <div class="card"><h3>快速起草跟进</h3>
        <div class="channel-row">
          <button class="chip" data-ch="Email">Email</button>
          <button class="chip" data-ch="WhatsApp">WhatsApp</button>
          <button class="chip" data-ch="LinkedIn">LinkedIn</button>
          <button class="chip" data-ch="Call">电话脚本</button>
        </div>
        <textarea id="draftText" class="input textarea big" placeholder="点击渠道生成草稿"></textarea>
        <div class="row"><button id="copyDraft" class="btn primary">复制内容</button></div>
      </div>
    </div>

    <div class="stack">
      <div class="card"><h3>当前动作</h3>
        <div style="font-size:26px;font-weight:900">${c.nextFollowup||"未安排"}</div>
        <p class="muted">当前系统中的下一次跟进</p>
        <p class="hint">V2 建议：${esc(ai.nextDate)} · ${esc(ai.channel)}</p>
        <button id="logTodayBtn" class="btn primary" style="width:100%">记录今天已跟进</button>
        <button id="editBtn" class="btn ghost" style="width:100%;margin-top:8px">编辑客户</button>
      </div>
      <div class="card"><h3>备注</h3>
        <div class="muted" style="white-space:pre-wrap;line-height:1.6">${esc(c.notes||"暂无备注")}</div>
      </div>
    </div></div>`;

    $("editBtn").onclick=()=>openCustomerForm(c);
    $("addActivityBtn").onclick=()=>openActivityForm(c);
    $("logTodayBtn").onclick=()=>quickLog(c);
    document.querySelectorAll("[data-ch]").forEach(b=>b.onclick=()=>{
      $("draftText").value=draft(c,b.dataset.ch);
    });
    $("copyDraft").onclick=async()=>{
      await navigator.clipboard.writeText($("draftText").value||"");
      showToast("已复制");
    };
  };

  draft = function(c,ch){
    const name=c.contact?c.contact.split(" ")[0]:"there";
    const ai=v2Analysis(c);
    const product=c.product||"the material we discussed";

    if(ch==="WhatsApp"){
      return `Hi ${name}, just a quick follow-up regarding ${product}.

I don't want to repeat my previous message. Based on where things stand, I wanted to focus on one point: ${ai.action}

Would it make sense for me to send the next useful option, or is the timing not right on your side yet?`;
    }

    if(ch==="LinkedIn"){
      return `Hi ${name}, I wanted to follow up on ${product}. Rather than repeat the previous information, I’d like to keep this relevant: ${ai.action}

If you can share the current stage on your side, I’ll keep the next message focused.`;
    }

    if(ch==="Call"){
      return `Hi ${name}, this is Stella from Chameleon Stone. Is now a bad time for a quick call?

I’m calling about ${product}. I don’t want to repeat what I already sent. I just want to understand one point on your side.

${ai.action}

[Listen]

That helps. I’ll keep the next step focused and send only the information relevant to that.`;
    }

    return `Subject: Quick follow-up on ${product}

Hi ${name},

I wanted to follow up on ${product}.

Rather than repeat the previous information, I’d like to focus on one point: ${ai.action}

${c.blocker?`From our last discussion, my understanding is that the current point is: ${c.blocker}. `:""}If you can share the current stage on your side, I can keep the next update relevant and concise.

Best regards,
Stella`;
  };

  quickLog = async function(c){
    const ai=v2Analysis(c);
    const next=ai.nextDate;
    const {error}=await sb.from("activities").insert({
      user_id:user.id,
      customer_id:c.id,
      activity_type:"Follow-up",
      channel:ai.channel,
      activity_date:today(),
      note:"Marked as followed up.",
      next_followup:next
    });
    if(error){showToast(error.message);return;}
    await sb.from("customers")
      .update({last_contact:today(),next_followup:next})
      .eq("id",c.id);
    await refreshAll();
    openCustomer(c.id);
    showToast(`已记录；V2 建议下次跟进 ${next}`);
  };

  // Update the activity form default next-followup date without changing the database schema.
  const originalOpenActivityForm = openActivityForm;
  openActivityForm = function(c){
    originalOpenActivityForm(c);
    const ai=v2Analysis(c);
    const nextInput=$("aNext");
    if(nextInput) nextInput.value=ai.nextDate;
  };

  ensureV2UI();
})();
