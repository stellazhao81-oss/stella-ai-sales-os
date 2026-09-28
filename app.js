const $ = id => document.getElementById(id);
const CFG = window.STELLA_CONFIG || {};
const cfgReady = CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY &&
  !CFG.SUPABASE_URL.includes("PASTE_") && !CFG.SUPABASE_ANON_KEY.includes("PASTE_");

let sb = null, user = null, customers = [], activities = [], knowledge = [], importRows = [];
let activeCustomer = null, taskFilter = "due";

const today = () => new Date().toISOString().slice(0,10);
const plusDays = (s,n) => { const d=new Date((s||today())+"T00:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const showToast = msg => { const el=$("toast"); el.textContent=msg; el.classList.remove("hidden"); setTimeout(()=>el.classList.add("hidden"),2300); };

function init(){
  if(!cfgReady){ $("setupNotice").classList.remove("hidden"); $("loginBtn").disabled=true; $("registerBtn").disabled=true; return; }
  sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  bind();
  sb.auth.getSession().then(({data})=>{
    if(data.session){ user=data.session.user; enterApp(); }
  });
  sb.auth.onAuthStateChange((_event,session)=>{ if(session?.user){user=session.user; enterApp();} else {user=null; leaveApp();} });
}

function bind(){
  $("loginBtn").onclick=login; $("registerBtn").onclick=register; $("logoutBtn").onclick=()=>sb.auth.signOut();
  document.querySelectorAll(".nav").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));
  document.querySelectorAll("[data-goto]").forEach(b=>b.onclick=()=>go(b.dataset.goto));
  $("addCustomerBtn").onclick=()=>openCustomerForm();
  $("quickImportBtn").onclick=()=>go("import");
  $("search").oninput=renderCustomers; $("statusFilter").onchange=renderCustomers; $("priorityFilter").onchange=renderCustomers;
  document.querySelectorAll("[data-taskfilter]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-taskfilter]").forEach(x=>x.classList.remove("active"));b.classList.add("active");taskFilter=b.dataset.taskfilter;renderTasks();});
  $("addKnowledgeBtn").onclick=()=>openKnowledgeForm();
  $("chooseExcelBtn").onclick=()=>$("excelInput").click();
  $("dropzone").onclick=e=>{ if(e.target.id!=="chooseExcelBtn") $("excelInput").click(); };
  $("excelInput").onchange=e=>handleExcel(e.target.files[0]);
  $("dropzone").ondragover=e=>e.preventDefault();
  $("dropzone").ondrop=e=>{e.preventDefault();handleExcel(e.dataTransfer.files[0]);};
  $("confirmImportBtn").onclick=confirmImport;
  $("exportBtn").onclick=exportBackup;
  document.querySelectorAll("[data-close]").forEach(x=>x.onclick=closeModal);
}

async function login(){
  const email=$("loginEmail").value.trim(), password=$("loginPassword").value;
  const {error}=await sb.auth.signInWithPassword({email,password});
  $("authMsg").textContent=error ? error.message : "";
}
async function register(){
  const email=$("loginEmail").value.trim(), password=$("loginPassword").value;
  const {error}=await sb.auth.signUp({email,password});
  $("authMsg").textContent=error ? error.message : "注册成功。若开启邮箱验证，请先查收验证邮件。";
}
function leaveApp(){ $("app").classList.add("hidden"); $("authGate").classList.remove("hidden"); }
async function enterApp(){
  $("authGate").classList.add("hidden"); $("app").classList.remove("hidden");
  $("userEmail").textContent=user.email; $("settingsEmail").textContent=user.email;
  await refreshAll();
}
async function refreshAll(){
  const [c,a,k]=await Promise.all([
    sb.from("customers").select("*").order("created_at",{ascending:false}),
    sb.from("activities").select("*").order("activity_date",{ascending:false}),
    sb.from("knowledge_items").select("*").order("created_at",{ascending:false})
  ]);
  if(c.error||a.error||k.error){ showToast("读取云端数据失败，请检查 Supabase 表和 RLS。"); }
  customers=(c.data||[]).map(mapCustomer); activities=a.data||[]; knowledge=k.data||[];
  renderAll();
}
function mapCustomer(r){return {id:r.id,company:r.company||"",contact:r.contact||"",country:r.country||"",role:r.role||"",source:r.source||"",product:r.product||"",status:r.status||"Developing",priority:r.priority||"B",lastContact:r.last_contact||"",nextFollowup:r.next_followup||"",blocker:r.blocker||"",notes:r.notes||"",tags:r.tags||[]};}
function dbCustomer(c){return {id:c.id,user_id:user.id,company:c.company,contact:c.contact,country:c.country,role:c.role,source:c.source,product:c.product,status:c.status,priority:c.priority,last_contact:c.lastContact||null,next_followup:c.nextFollowup||null,blocker:c.blocker,notes:c.notes,tags:c.tags||[]};}

function go(name){
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  $(name+"View").classList.add("active"); document.querySelector(`.nav[data-view="${name}"]`)?.classList.add("active");
  const map={dashboard:["今日工作台","先处理最接近成交的客户。"],customers:["客户池","所有客户、状态与下一步动作。"],followups:["跟进任务","今天该跟谁，为什么跟。"],knowledge:["产品知识库","统一产品事实，避免回复时参数混乱。"],import:["Excel 导入","把现有客户池一次性迁移到云端。"],settings:["设置","账号与备份。"]};
  $("pageTitle").textContent=map[name][0]; $("pageSub").textContent=map[name][1];
}

function renderAll(){renderStats();renderPriority();renderCustomers();renderTasks();renderStrategy();renderKnowledge();}
function renderStats(){
  $("sDue").textContent=customers.filter(c=>c.nextFollowup&&c.nextFollowup<=today()&&c.status!=="Won").length;
  $("sA").textContent=customers.filter(c=>c.priority==="A"&&c.status!=="Won").length;
  $("sProject").textContent=customers.filter(c=>c.status==="Project").length;
  $("sQuoted").textContent=customers.filter(c=>c.status==="Quoted").length;
  $("sWaiting").textContent=customers.filter(c=>c.status==="Waiting Reply").length;
}
const pscore=p=>p==="A"?0:p==="B"?1:2;
function sortedCustomers(){return [...customers].sort((a,b)=>pscore(a.priority)-pscore(b.priority)||(a.nextFollowup||"9999").localeCompare(b.nextFollowup||"9999"));}
function badge(v,extra=""){return `<span class="badge ${extra}">${esc(v)}</span>`;}
function renderPriority(){
  const host=$("priorityList"), list=sortedCustomers().filter(c=>c.status!=="Won").slice(0,8); host.innerHTML="";
  if(!list.length){host.innerHTML='<p class="muted">暂无客户。点击右上角新增客户。</p>';return;}
  list.forEach(c=>{const d=document.createElement("div");d.className="priority";d.innerHTML=`<div><div class="company">${esc(c.company)}</div><div class="sub">${esc(c.contact||"—")} · ${esc(c.country||"")}</div></div><div>${badge(c.status)}</div><div>${badge(c.priority,c.priority)}</div><div>${c.nextFollowup||"未安排"}</div><div>›</div>`;d.onclick=()=>openCustomer(c.id);host.appendChild(d);});
}
function renderCustomers(){
  const q=$("search").value.trim().toLowerCase(),sf=$("statusFilter").value,pf=$("priorityFilter").value;
  const list=sortedCustomers().filter(c=>{const h=[c.company,c.contact,c.country,c.product,c.role,c.source,...c.tags].join(" ").toLowerCase();return(!q||h.includes(q))&&(!sf||c.status===sf)&&(!pf||c.priority===pf)});
  const tb=$("customerRows");tb.innerHTML="";
  list.forEach(c=>{const tr=document.createElement("tr");tr.innerHTML=`<td><div class="company">${esc(c.company)}</div><div class="sub">${esc(c.contact||"—")} · ${esc(c.role||"")}</div></td><td>${esc(c.country||"—")}</td><td>${esc(c.product||"—")}</td><td>${badge(c.status)}</td><td>${badge(c.priority,c.priority)}</td><td>${c.lastContact||"—"}</td><td>${c.nextFollowup||"—"}</td><td>›</td>`;tr.onclick=()=>openCustomer(c.id);tb.appendChild(tr);});
}
function renderTasks(){
  const h=$("taskList"),t=today(),week=plusDays(t,7);
  let list=sortedCustomers().filter(c=>c.nextFollowup&&c.status!=="Won");
  if(taskFilter==="due")list=list.filter(c=>c.nextFollowup<=t);
  if(taskFilter==="upcoming")list=list.filter(c=>c.nextFollowup>t&&c.nextFollowup<=week);
  h.innerHTML="";
  if(!list.length){h.innerHTML='<p class="muted">当前没有符合条件的任务。</p>';return;}
  list.forEach(c=>{const div=document.createElement("div");div.className="task";const late=c.nextFollowup<t;div.innerHTML=`<div><div class="company">${esc(c.company)}</div><div class="sub">${esc(nextStep(c).action)}</div></div><div>${badge(c.status)}</div><div>${badge(c.priority,c.priority)}</div><div class="${late?"overdue":""}">${c.nextFollowup}${late?" · 逾期":""}</div><div>处理 ›</div>`;div.onclick=()=>openCustomer(c.id);h.appendChild(div);});
}
function renderStrategy(){
  const due=customers.filter(c=>c.nextFollowup&&c.nextFollowup<=today()&&c.status!=="Won"),A=due.filter(c=>c.priority==="A").length,Q=due.filter(c=>c.status==="Quoted").length,W=due.filter(c=>c.status==="Waiting Reply").length;
  $("strategyBox").innerHTML=`<strong>今天建议：</strong><br>① 先处理 ${A} 个 A 类客户；② 再处理 ${Q} 个报价客户；③ 最后处理 ${W} 个等待回复客户。<br><br><strong>跟进原则：</strong>不要只问 “Any update?”。每次带一个新的信息点，只推进一个小动作。`;
}
function nextStep(c){
  if(c.status==="Project")return{action:"推进一个项目确认点",reason:"项目型客户一次只推进尺寸、材料、时间或责任人中的一个点。"};
  if(c.status==="Quoted")return{action:"确认真实卡点",reason:"先判断价格、规格、交期、运输、审批还是项目进度，不要直接降价。"};
  if(c.status==="Sample")return{action:"推进样品节点",reason:"围绕样品准备、运费、寄出、签收或评价中的下一个节点。"};
  if(c.status==="Waiting Reply")return{action:"带新信息再次触达",reason:"不要重复上一封内容，用一个新价值点换取回复。"};
  if(c.status==="Replied")return{action:"只问 1–2 个关键问题",reason:"确认应用、数量或尺寸中的关键变量，再进入报价。"};
  if(c.status==="Nurture")return{action:"低频培育",reason:"提供真正与客户业务相关的项目或材料信息，不机械催促。"};
  return{action:"建立相关性",reason:"从客户业务、产品线或项目场景切入，先证明为什么值得聊。"};
}

function openCustomerForm(c=null){
  activeCustomer=c;
  $("modal").classList.remove("hidden");$("modalTitle").textContent=c?"编辑客户":"新增客户";$("modalSub").textContent="客户资料与跟进状态";
  $("modalBody").innerHTML=`<form id="customerForm" class="stack"><div class="form-grid">
    ${field("公司名","fCompany",c?.company||"",true)}${field("联系人","fContact",c?.contact||"")}
    ${field("国家 / 地区","fCountry",c?.country||"")}${field("职位","fRole",c?.role||"")}
    ${selectField("来源","fSource",["LinkedIn","Email","WhatsApp","Alibaba","Exhibition","Google","Referral","Other"],c?.source||"LinkedIn")}
    ${field("产品兴趣","fProduct",c?.product||"")}
    ${selectField("状态","fStatus",["Developing","Replied","Waiting Reply","Quoted","Sample","Project","Won","Nurture"],c?.status||"Developing")}
    ${selectField("优先级","fPriority",["A","B","C"],c?.priority||"B")}
    ${field("最后联系","fLast",c?.lastContact||"","date")}${field("下次跟进","fNext",c?.nextFollowup||"","date")}
    ${field("标签（逗号分隔）","fTags",(c?.tags||[]).join(", "))}
  </div>
  <label>当前卡点<textarea id="fBlocker" class="input textarea">${esc(c?.blocker||"")}</textarea></label>
  <label>备注<textarea id="fNotes" class="input textarea">${esc(c?.notes||"")}</textarea></label>
  <div class="modal-actions">${c?'<button type="button" id="deleteBtn" class="btn ghost">删除</button>':""}<div class="spacer"></div><button type="button" class="btn ghost" data-close2>取消</button><button class="btn primary">保存</button></div></form>`;
  $("[x]")?.remove();
  document.querySelector("[data-close2]").onclick=closeModal;
  if(c)$("deleteBtn").onclick=()=>deleteCustomer(c.id);
  $("customerForm").onsubmit=saveCustomer;
}
function field(label,id,val,requiredOrType=false,type="text"){if(typeof requiredOrType==="string"){type=requiredOrType;requiredOrType=false}return `<label>${label}<input id="${id}" class="input" type="${type}" value="${esc(val)}" ${requiredOrType?"required":""}/></label>`}
function selectField(label,id,opts,val){return `<label>${label}<select id="${id}" class="input">${opts.map(x=>`<option ${x===val?"selected":""}>${x}</option>`).join("")}</select></label>`}
async function saveCustomer(e){
  e.preventDefault();
  const c={id:activeCustomer?.id||crypto.randomUUID(),company:$("fCompany").value.trim(),contact:$("fContact").value.trim(),country:$("fCountry").value.trim(),role:$("fRole").value.trim(),source:$("fSource").value,product:$("fProduct").value.trim(),status:$("fStatus").value,priority:$("fPriority").value,lastContact:$("fLast").value,nextFollowup:$("fNext").value,blocker:$("fBlocker").value.trim(),notes:$("fNotes").value.trim(),tags:$("fTags").value.split(",").map(x=>x.trim()).filter(Boolean)};
  const {error}=await sb.from("customers").upsert(dbCustomer(c)); if(error){showToast(error.message);return;}
  await refreshAll();closeModal();showToast("客户已保存");
}
async function deleteCustomer(id){if(!confirm("确认删除这个客户以及其沟通记录吗？"))return;const {error}=await sb.from("customers").delete().eq("id",id);if(error){showToast(error.message);return;}await refreshAll();closeModal();showToast("已删除");}

function openCustomer(id){
  const c=customers.find(x=>x.id===id);if(!c)return;activeCustomer=c;
  $("modal").classList.remove("hidden");$("modalTitle").textContent=c.company;$("modalSub").textContent=[c.contact,c.role,c.country].filter(Boolean).join(" · ");
  const ev=activities.filter(a=>a.customer_id===id);
  const ai=nextStep(c);
  $("modalBody").innerHTML=`<div class="detail-grid"><div class="stack">
    <div class="card"><h3>客户概况</h3><div class="meta">
      ${meta("状态",c.status)}${meta("优先级",c.priority)}${meta("来源",c.source)}${meta("产品",c.product||"—")}${meta("最后联系",c.lastContact||"—")}${meta("下次跟进",c.nextFollowup||"—")}
    </div></div>
    <div class="card"><h3>下一步建议</h3><div class="strategy"><strong>${esc(ai.action)}</strong><br>${esc(ai.reason)}${c.blocker?`<br><br><strong>当前卡点：</strong>${esc(c.blocker)}`:""}</div></div>
    <div class="card"><div class="panel-head"><div><h3>沟通时间线</h3><p>每次跟进都留下记录</p></div><button id="addActivityBtn" class="btn primary">＋ 记录沟通</button></div>
      <div class="timeline">${ev.length?ev.map(e=>`<div class="event"><div class="event-head"><span class="event-type">${esc(e.activity_type)} · ${esc(e.channel||"")}</span><span class="event-date">${e.activity_date}</span></div><div class="event-note">${esc(e.note||"")}</div></div>`).join(""):'<p class="muted">暂无沟通记录。</p>'}</div>
    </div>
    <div class="card"><h3>快速起草跟进</h3><div class="channel-row"><button class="chip" data-ch="Email">Email</button><button class="chip" data-ch="WhatsApp">WhatsApp</button><button class="chip" data-ch="LinkedIn">LinkedIn</button><button class="chip" data-ch="Call">电话脚本</button></div><textarea id="draftText" class="input textarea big" placeholder="点击渠道生成草稿"></textarea><div class="row"><button id="copyDraft" class="btn primary">复制内容</button></div></div>
  </div><div class="stack">
    <div class="card"><h3>当前动作</h3><div style="font-size:26px;font-weight:900">${c.nextFollowup||"未安排"}</div><p class="muted">下一次跟进</p><button id="logTodayBtn" class="btn primary" style="width:100%">记录今天已跟进</button><button id="editBtn" class="btn ghost" style="width:100%;margin-top:8px">编辑客户</button></div>
    <div class="card"><h3>备注</h3><div class="muted" style="white-space:pre-wrap;line-height:1.6">${esc(c.notes||"暂无备注")}</div></div>
  </div></div>`;
  $("editBtn").onclick=()=>openCustomerForm(c);$("addActivityBtn").onclick=()=>openActivityForm(c);
  $("logTodayBtn").onclick=()=>quickLog(c);
  document.querySelectorAll("[data-ch]").forEach(b=>b.onclick=()=>{$("draftText").value=draft(c,b.dataset.ch)});
  $("copyDraft").onclick=async()=>{await navigator.clipboard.writeText($("draftText").value||"");showToast("已复制");};
}
function meta(k,v){return `<div><small>${k}</small><b>${esc(v)}</b></div>`}
function draft(c,ch){
  const name=c.contact?c.contact.split(" ")[0]:"there", ai=nextStep(c);
  if(ch==="WhatsApp")return `Hi ${name}, just a quick follow-up regarding ${c.product||"the material"}.\n\nInstead of repeating my last message, I wanted to check one point: ${ai.action.toLowerCase()}.\n\nIf you can share the current stage on your side, I can keep my next update relevant and brief.`;
  if(ch==="LinkedIn")return `Hi ${name}, I wanted to follow up on ${c.product||"your current material needs"}. Rather than send a general introduction, I’d like to understand one thing first: what is the current project or sourcing stage on your side?`;
  if(ch==="Call")return `Hi ${name}, this is Stella from Chameleon Stone. Is now a bad time for a quick call?\n\nI’m calling about ${c.product||"the material we discussed"}. I don’t want to repeat the information I already sent. I just wanted to understand one point: ${ai.action.toLowerCase()}.\n\n[Listen]\n\nThat helps. I’ll keep the next step focused and send only the information relevant to that.`;
  return `Subject: Quick follow-up on ${c.product||"your project"}\n\nHi ${name},\n\nI wanted to follow up on ${c.product||"the material we discussed"}.\n\nRather than repeat the previous information, I’d like to focus on one point: ${ai.action.toLowerCase()}.\n\n${c.blocker?`From our last discussion, my understanding is that the current point is: ${c.blocker}. `:""}If you can share the current stage on your side, I can keep the next update relevant and concise.\n\nBest regards,\nStella`;
}
function openActivityForm(c){
  $("modalTitle").textContent="记录沟通 · "+c.company;$("modalSub").textContent="保存后自动进入客户时间线";
  $("modalBody").innerHTML=`<form id="activityForm" class="stack"><div class="form-grid">
  ${selectField("类型","aType",["Follow-up","Email Sent","WhatsApp","LinkedIn","Call","Quote","Sample","Logistics","Customer Reply","Meeting"],"Follow-up")}
  ${selectField("渠道","aChannel",["Email","WhatsApp","LinkedIn","Phone","Meeting","Other"],"Email")}
  ${field("日期","aDate",today(),"date")}${field("下次跟进","aNext",plusDays(today(),3),"date")}
  </div><label>沟通记录<textarea id="aNote" class="input textarea" placeholder="记录客户说了什么、你做了什么、下一步卡点"></textarea></label>
  <div class="modal-actions"><div class="spacer"></div><button type="button" class="btn ghost" data-back>返回</button><button class="btn primary">保存记录</button></div></form>`;
  document.querySelector("[data-back]").onclick=()=>openCustomer(c.id);
  $("activityForm").onsubmit=async e=>{e.preventDefault();const row={user_id:user.id,customer_id:c.id,activity_type:$("aType").value,channel:$("aChannel").value,activity_date:$("aDate").value,note:$("aNote").value.trim(),next_followup:$("aNext").value||null};let r=await sb.from("activities").insert(row);if(r.error){showToast(r.error.message);return;}await sb.from("customers").update({last_contact:$("aDate").value,next_followup:$("aNext").value||null}).eq("id",c.id);await refreshAll();openCustomer(c.id);showToast("沟通记录已保存");};
}
async function quickLog(c){
  const next=plusDays(today(),3);
  const {error}=await sb.from("activities").insert({user_id:user.id,customer_id:c.id,activity_type:"Follow-up",channel:"Other",activity_date:today(),note:"Marked as followed up.",next_followup:next});
  if(error){showToast(error.message);return;}await sb.from("customers").update({last_contact:today(),next_followup:next}).eq("id",c.id);await refreshAll();openCustomer(c.id);showToast("已记录；默认 3 天后再跟进");
}
function closeModal(){$("modal").classList.add("hidden");activeCustomer=null;}

function renderKnowledge(){
  const h=$("knowledgeList");h.innerHTML="";
  if(!knowledge.length){h.innerHTML='<p class="muted">暂无自定义知识。可添加常用报价、厚度限制、加工、包装、证书等。</p>';return;}
  knowledge.forEach(k=>{const d=document.createElement("div");d.className="knowledge-item";d.innerHTML=`<div class="knowledge-head"><div><div class="knowledge-title">${esc(k.title)}</div><div class="sub">${esc(k.category)}</div></div><button class="iconbtn" data-del="${k.id}">🗑</button></div><p style="white-space:pre-wrap">${esc(k.content)}</p>`;d.querySelector("[data-del]").onclick=()=>deleteKnowledge(k.id);h.appendChild(d);});
}
function openKnowledgeForm(){
  $("modal").classList.remove("hidden");$("modalTitle").textContent="新增产品知识";$("modalSub").textContent="只记录你确认过的真实数据";
  $("modalBody").innerHTML=`<form id="kForm" class="stack">${field("标题","kTitle","",true)}${field("分类","kCategory","General")}<label>内容<textarea id="kContent" class="input textarea big" required></textarea></label><div class="modal-actions"><div class="spacer"></div><button type="button" class="btn ghost" data-closek>取消</button><button class="btn primary">保存</button></div></form>`;
  document.querySelector("[data-closek]").onclick=closeModal;
  $("kForm").onsubmit=async e=>{e.preventDefault();const {error}=await sb.from("knowledge_items").insert({user_id:user.id,title:$("kTitle").value.trim(),category:$("kCategory").value.trim()||"General",content:$("kContent").value.trim()});if(error){showToast(error.message);return;}await refreshAll();closeModal();showToast("知识已保存");};
}
async function deleteKnowledge(id){if(!confirm("删除这条知识？"))return;await sb.from("knowledge_items").delete().eq("id",id);await refreshAll();}

function normalizeHeader(s){return String(s||"").trim().toLowerCase().replace(/\s+/g,"");}
const aliases={
  company:["公司","公司名","company","companyname"],contact:["联系人","姓名","contact","name"],country:["国家","地区","country","market"],role:["职位","title","role","position"],
  source:["来源","source","channel"],product:["产品","产品兴趣","product","interest"],status:["状态","status"],priority:["优先级","priority","grade"],
  lastContact:["最后联系","最后联系日期","lastcontact","lastcontactdate"],nextFollowup:["下次跟进","下次跟进日期","nextfollowup","followupdate"],
  blocker:["卡点","当前卡点","blocker","obstacle"],notes:["备注","notes","note"],tags:["标签","tags","tag"]
};
function pick(obj,key){for(const a of aliases[key]){const found=Object.keys(obj).find(k=>normalizeHeader(k)===normalizeHeader(a));if(found!==undefined)return obj[found]}return""}
function excelDate(v){
  if(!v)return""; if(typeof v==="number"){const d=XLSX.SSF.parse_date_code(v);if(d)return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`}
  const d=new Date(v);return isNaN(d)?String(v):d.toISOString().slice(0,10);
}
async function handleExcel(file){
  if(!file)return;const data=await file.arrayBuffer(),wb=XLSX.read(data),ws=wb.Sheets[wb.SheetNames[0]],raw=XLSX.utils.sheet_to_json(ws,{defval:""});
  importRows=raw.map(r=>({company:String(pick(r,"company")||"").trim(),contact:String(pick(r,"contact")||"").trim(),country:String(pick(r,"country")||"").trim(),role:String(pick(r,"role")||"").trim(),source:String(pick(r,"source")||"Excel").trim(),product:String(pick(r,"product")||"").trim(),status:String(pick(r,"status")||"Developing").trim(),priority:String(pick(r,"priority")||"B").trim().toUpperCase(),lastContact:excelDate(pick(r,"lastContact")),nextFollowup:excelDate(pick(r,"nextFollowup")),blocker:String(pick(r,"blocker")||"").trim(),notes:String(pick(r,"notes")||"").trim(),tags:String(pick(r,"tags")||"").split(/[,，;]/).map(x=>x.trim()).filter(Boolean)})).filter(x=>x.company);
  $("importPreview").classList.remove("hidden");$("importCount").textContent=`识别到 ${importRows.length} 条有效客户`;
  const cols=["company","contact","country","product","status","priority","nextFollowup"];$("previewHead").innerHTML="<tr>"+cols.map(c=>`<th>${c}</th>`).join("")+"</tr>";$("previewBody").innerHTML=importRows.slice(0,20).map(r=>"<tr>"+cols.map(c=>`<td>${esc(r[c]||"")}</td>`).join("")+"</tr>").join("");
}
async function confirmImport(){
  if(!importRows.length)return;const rows=importRows.map(c=>({...dbCustomer({...c,id:crypto.randomUUID()})}));
  const {error}=await sb.from("customers").insert(rows);if(error){showToast("导入失败："+error.message);return;}importRows=[];$("importPreview").classList.add("hidden");await refreshAll();showToast("Excel 已导入云端");
}
function exportBackup(){
  const payload={version:"cloud-v2",exportedAt:new Date().toISOString(),customers,activities,knowledge};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`stella_sales_cloud_backup_${today()}.json`;a.click();URL.revokeObjectURL(a.href);
}
init();
