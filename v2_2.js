/* Stella AI Sales OS V2.2 — Contact Visibility
   Adds visible contact methods to customer detail without database migration.
   Reads Email / backup email / LinkedIn / phone / WhatsApp from imported notes.
*/
(function(){
  function extractContactInfo(c){
    const notes = String(c.notes || "");
    const blocker = String(c.blocker || "");
    const all = notes + "\n" + blocker;

    function grab(labelPattern){
      const re = new RegExp("(?:^|\\n)\\s*(?:" + labelPattern + ")\\s*[:：]\\s*([^\\n]+)", "i");
      const m = all.match(re);
      return m ? m[1].trim() : "";
    }

    // Email: support imported "Email:" and "备用Email:"
    let email = grab("Email|邮箱");
    let backupEmail = grab("备用Email|Backup\\s*Email|Secondary\\s*Email");

    // If labelled values are missing, pick likely email strings from notes.
    const emails = [...all.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(m=>m[0]);
    if(!email && emails.length) email = emails[0];
    if(!backupEmail && emails.length > 1) backupEmail = emails[1];

    let linkedin = grab("LinkedIn|领英");
    if(!linkedin){
      const m = all.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s]+/i);
      if(m) linkedin = m[0];
    }

    let phone = grab("电话\\/WhatsApp|WhatsApp|电话|Phone");
    if(!phone){
      const m = all.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
      if(m) phone = m[0].trim();
    }

    const source = String(c.source || "");
    const route = [];
    if(email) route.push("Email");
    if(phone) route.push(/whatsapp/i.test(all) ? "WhatsApp / Phone" : "Phone");
    if(linkedin) route.push("LinkedIn");
    if(!route.length && source) route.push(source);

    return {email, backupEmail, linkedin, phone, route:[...new Set(route)]};
  }

  function contactRow(label,value,type){
    if(!value) return "";
    let action = "";
    if(type==="email"){
      action = `<a class="btn ghost" href="mailto:${esc(value)}">发邮件</a>`;
    }else if(type==="linkedin" && /^https?:\/\//i.test(value)){
      action = `<a class="btn ghost" href="${esc(value)}" target="_blank" rel="noopener">打开</a>`;
    }else if(type==="phone"){
      const digits = value.replace(/[^\d+]/g,"");
      action = digits ? `<a class="btn ghost" href="tel:${esc(digits)}">拨号</a>` : "";
    }
    return `<div class="v22-contact-row">
      <div><small>${label}</small><b>${esc(value)}</b></div>
      ${action}
    </div>`;
  }

  if(!document.getElementById("v22Styles")){
    const st=document.createElement("style");
    st.id="v22Styles";
    st.textContent=`
      .v22-contact{display:flex;flex-direction:column;gap:8px}
      .v22-contact-row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--border);border-radius:10px;padding:10px;background:#fafcfd}
      .v22-contact-row small{display:block;color:var(--muted);margin-bottom:3px}
      .v22-contact-row b{font-size:13px;word-break:break-all}
      .v22-route{background:#eef8f3;border:1px solid #d3eadf;border-radius:10px;padding:10px;margin-top:8px}
      .v22-route strong{color:var(--green)}
      .v22-missing{color:#9a6a16;background:#fff8e6;border:1px solid #f1dfad;border-radius:10px;padding:10px;font-size:12px}
    `;
    document.head.appendChild(st);
  }

  openCustomer = function(id){
    const c=customers.find(x=>x.id===id); if(!c)return;
    activeCustomer=c;
    $("modal").classList.remove("hidden");
    $("modalTitle").textContent=c.company;
    $("modalSub").textContent=[c.contact,c.role,c.country].filter(Boolean).join(" · ");

    const ev=activities.filter(a=>a.customer_id===id);
    const ai=nextStep(c);
    const ci=extractContactInfo(c);

    const contactBlock = (ci.email || ci.backupEmail || ci.linkedin || ci.phone)
      ? `<div class="v22-contact">
          ${contactRow("Email",ci.email,"email")}
          ${contactRow("备用 Email",ci.backupEmail,"email")}
          ${contactRow("LinkedIn",ci.linkedin,"linkedin")}
          ${contactRow("电话 / WhatsApp",ci.phone,"phone")}
          <div class="v22-route"><strong>建议跟进渠道：</strong>${esc(ai.channel || ci.route.join(" / ") || c.source || "待确认")}</div>
        </div>`
      : `<div class="v22-missing">这个客户目前没有识别到可用的 Email / LinkedIn / 电话信息。建议先补联系方式；系统当前来源为：${esc(c.source||"未填写")}。</div>`;

    $("modalBody").innerHTML=`<div class="detail-grid"><div class="stack">
      <div class="card"><h3>客户概况</h3><div class="meta">
        ${meta("状态",c.status)}${meta("优先级",c.priority)}${meta("来源",c.source)}
        ${meta("产品",c.product||"—")}${meta("最后联系",c.lastContact||"—")}
        ${meta("下次跟进",c.nextFollowup||"—")}
      </div></div>

      <div class="card"><h3>联系方式</h3>${contactBlock}</div>

      <div class="card"><h3>V2 智能客户分析</h3><div class="strategy">
        <strong>当前判断：</strong>${esc(ai.judgement||"") || "根据现有记录判断下一步。"}<br><br>
        <strong>下一步动作：</strong>${esc(ai.action)}<br>
        <strong>为什么：</strong>${esc(ai.reason)}
        <div class="v2-analysis-grid">
          <div class="v2-analysis-cell"><small>建议渠道</small><b>${esc(ai.channel||ci.route.join(" / ")||c.source||"待确认")}</b></div>
          <div class="v2-analysis-cell"><small>建议跟进日期</small><b>${esc(ai.nextDate||c.nextFollowup||"未安排")}</b></div>
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
        <p class="hint">建议：${esc(ai.nextDate||"未安排")} · ${esc(ai.channel||ci.route.join(" / ")||c.source||"待确认")}</p>
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
})();
