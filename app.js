(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];

  const pageMeta = {
    dashboard:["IT operations","Dashboard"],
    tickets:["Ticket operations","Tickets"],
    "new-ticket":["Intake","New Ticket"],
    assets:["Configuration items","Assets"],
    knowledge:["Knowledge management","Knowledge Base"],
    team:["People & workload","Service Desk Team"],
    analytics:["Operational reporting","Analytics"],
    about:["Project architecture","About"]
  };

  const SLA = {
    P1:{response:1,resolution:2},
    P2:{response:2,resolution:8},
    P3:{response:4,resolution:24},
    P4:{response:8,resolution:72}
  };

  const state = {
    mode: localStorage.getItem("helpdesk_mode") || (location.port === "8790" ? "live" : "demo"),
    backendUrl: localStorage.getItem("helpdesk_backend_url") || (location.port === "8790" ? location.origin : "http://127.0.0.1:8790"),
    data:null,
    activePage:"dashboard",
    selectedTicket:null,
    lastRefresh:null
  };

  function esc(v){return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
  function slug(v){return String(v||"").toLowerCase().replaceAll(" ","-")}
  function fmtTime(iso){
    if(!iso)return "—";
    const d=new Date(iso), diff=Math.max(0,Date.now()-d.getTime());
    if(diff<60000)return "just now";
    if(diff<3600000)return Math.round(diff/60000)+"m ago";
    if(diff<86400000)return Math.round(diff/3600000)+"h ago";
    return Math.round(diff/86400000)+"d ago";
  }
  function fmtMinutes(min){
    if(!Number.isFinite(min))return "—";
    if(min<60)return Math.round(min)+"m";
    const h=min/60;
    return h<24?h.toFixed(h<10?1:0)+"h":(h/24).toFixed(1)+"d";
  }
  function fmtBytes(bytes){
    let n=Number(bytes)||0;const units=["B","KB","MB","GB"];let i=0;
    while(n>=1024&&i<units.length-1){n/=1024;i++}
    return n.toFixed(n>=10||i===0?0:1)+" "+units[i];
  }
  function toast(title,msg="",type="info"){
    const n=document.createElement("div");n.className="toast "+type;
    n.innerHTML="<strong>"+esc(title)+"</strong><span>"+esc(msg)+"</span>";
    $("toastRegion").appendChild(n);setTimeout(()=>n.remove(),4300);
  }
  async function fetchJson(path,options={}){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),options.timeout||9000);
    try{
      const r=await fetch(state.backendUrl.replace(/\/$/,"")+path,{...options,signal:controller.signal,headers:{"Content-Type":"application/json",...(options.headers||{})}});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.detail||data.error||"Request failed ("+r.status+")");
      return data;
    }finally{clearTimeout(timer)}
  }
  function cloneDemo(){
    const base=JSON.parse(JSON.stringify(window.HELPDESK_DEMO));
    const saved=sessionStorage.getItem("helpdesk_demo_state");
    if(saved){try{return JSON.parse(saved)}catch{}}
    return base;
  }
  function persistDemo(){if(state.mode==="demo")sessionStorage.setItem("helpdesk_demo_state",JSON.stringify(state.data))}
  function setModeStatus(kind,title,detail){
    $("modeDot").className="mode-dot"+(kind?" "+kind:"");$("modeTitle").textContent=title;$("modeDetail").textContent=detail;
  }

  async function loadData(showToast=false){
    if(state.mode==="demo"){
      state.data=cloneDemo();state.lastRefresh=new Date();setModeStatus("","Portfolio Demo","Representative ITSM data");renderAll();
      if(showToast)toast("Demo refreshed","Interactive service desk data loaded.");return;
    }
    setModeStatus("","Connecting…",state.backendUrl);
    try{
      state.data=await fetchJson("/api/bootstrap");state.lastRefresh=new Date();setModeStatus("live","Live backend",state.backendUrl.replace(/^https?:\/\//,""));renderAll();
      if(showToast)toast("Live data refreshed","Latest service desk records loaded.");
    }catch(e){
      setModeStatus("error","Backend unavailable",state.backendUrl.replace(/^https?:\/\//,""));toast("Could not reach backend",e.message,"error");
      if(!state.data){state.data=cloneDemo();renderAll()}
    }
  }

  function openPage(page){
    state.activePage=page;
    qsa("[data-page-panel]").forEach(p=>p.classList.toggle("active",p.dataset.pagePanel===page));
    qsa("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
    $("pageEyebrow").textContent=pageMeta[page][0];$("pageTitle").textContent=pageMeta[page][1];
    $("sidebar").classList.remove("open");
    if(page==="tickets")renderTickets();
    if(page==="new-ticket")populateNewTicketForm();
    if(page==="assets")renderAssets();
    if(page==="knowledge")renderKnowledge();
    if(page==="team")renderTeam();
    if(page==="analytics")renderAnalytics();
  }
  qsa("[data-page]").forEach(b=>b.addEventListener("click",()=>openPage(b.dataset.page)));
  qsa("[data-go]").forEach(b=>b.addEventListener("click",()=>openPage(b.dataset.go)));
  $("menuButton").addEventListener("click",()=> $("sidebar").classList.toggle("open"));

  function technicianUsers(){return (state.data?.users||[]).filter(u=>["Technician","Administrator"].includes(u.role))}
  function requesterUsers(){return (state.data?.users||[]).filter(u=>u.role==="Requester")}
  function activeTicket(t){return !["Resolved","Closed"].includes(t.status)}
  function slaState(t){
    const now=Date.now();
    const responseDue=new Date(t.response_due).getTime(), resolutionDue=new Date(t.resolution_due).getTime();
    const responseDone=t.first_response_at?new Date(t.first_response_at).getTime():null;
    const resolutionDone=t.resolved_at?new Date(t.resolved_at).getTime():null;
    const responseBreached=responseDone?responseDone>responseDue:activeTicket(t)&&now>responseDue;
    const resolutionBreached=resolutionDone?resolutionDone>resolutionDue:activeTicket(t)&&now>resolutionDue;
    if(responseBreached||resolutionBreached)return {level:"bad",label:"Breached"};
    if(activeTicket(t)){
      const remain=Math.min(responseDone?Infinity:responseDue-now,resolutionDue-now);
      if(remain<=2*3600000)return {level:"warn",label:"At risk"};
    }
    return {level:"good",label:activeTicket(t)?"On track":"Met"};
  }
  function slaCompliant(t){
    if(!["Resolved","Closed"].includes(t.status)||!t.resolved_at)return null;
    return new Date(t.resolved_at)<=new Date(t.resolution_due) && (!t.first_response_at || new Date(t.first_response_at)<=new Date(t.response_due));
  }
  function derive(){
    const tickets=state.data?.tickets||[], open=tickets.filter(activeTicket), resolved=tickets.filter(t=>["Resolved","Closed"].includes(t.status));
    const breached=open.filter(t=>slaState(t).level==="bad"), risk=open.filter(t=>slaState(t).level==="warn");
    const compliantResolved=resolved.filter(t=>slaCompliant(t)!==null);
    const compliance=compliantResolved.length?compliantResolved.filter(slaCompliant).length/compliantResolved.length*100:100;
    const responseMins=resolved.filter(t=>t.first_response_at).map(t=>(new Date(t.first_response_at)-new Date(t.created_at))/60000).filter(n=>n>=0);
    const avgResponse=responseMins.length?responseMins.reduce((a,b)=>a+b,0)/responseMins.length:NaN;
    const csatVals=resolved.map(t=>Number(t.csat)).filter(n=>n>0);
    const csat=csatVals.length?csatVals.reduce((a,b)=>a+b,0)/csatVals.length:NaN;
    const today=new Date().toDateString();
    const resolvedToday=resolved.filter(t=>t.resolved_at&&new Date(t.resolved_at).toDateString()===today).length;
    return {tickets,open,resolved,breached,risk,compliance,avgResponse,csat,resolvedToday};
  }

  function renderDashboard(){
    const d=derive();
    $("openTicketBadge").textContent=d.open.length;$("dashboardOpen").textContent=d.open.length;$("dashboardRisk").textContent=d.risk.length;$("dashboardBreached").textContent=d.breached.length;
    $("statOpen").textContent=d.open.length;$("statUnassigned").textContent=d.open.filter(t=>!t.assignee_id).length;$("statResponse").textContent=fmtMinutes(d.avgResponse);$("statResolved").textContent=d.resolvedToday;$("statCsat").textContent=Number.isFinite(d.csat)?d.csat.toFixed(1)+"/5":"—";
    $("slaCompliance").textContent=d.compliance.toFixed(0)+"%";$("slaRing").style.setProperty("--value",(d.compliance*3.6)+"deg");
    const title=$("serviceHealthTitle"),badge=$("serviceHealthBadge"),copy=$("serviceHealthCopy");badge.className="pill";
    if(d.breached.length){title.textContent="Attention Required";badge.textContent="SLA breach";badge.classList.add("bad");copy.textContent="One or more active tickets have breached response or resolution targets and require immediate service desk action."}
    else if(d.risk.length){title.textContent="Operational";badge.textContent="SLA risk present";badge.classList.add("warn");copy.textContent="Service desk operations are active, with tickets approaching their SLA response or resolution targets."}
    else{title.textContent="Operational";badge.textContent="Within SLA";badge.classList.add("good");copy.textContent="Tracking incidents, service requests, SLA risk, technician workload, and user support outcomes."}

    const priorities=["P1","P2","P3","P4"],max=Math.max(1,...priorities.map(p=>d.open.filter(t=>t.priority===p).length));
    $("priorityBars").innerHTML=priorities.map(p=>{const n=d.open.filter(t=>t.priority===p).length;return '<div class="bar-row"><span>'+p+' priority</span><div class="bar-track"><div class="bar-fill '+p.toLowerCase()+'" style="width:'+n/max*100+'%"></div></div><strong>'+n+'</strong></div>'}).join("");

    const attention=[...d.breached,...d.risk.filter(t=>!d.breached.includes(t))].slice(0,5);
    $("slaAttentionList").innerHTML=attention.length?attention.map(t=>'<div class="mini-item" data-ticket="'+t.id+'"><i class="'+(slaState(t).level==="bad"?"red":"amber")+'"></i><div><strong>'+esc(t.number+" · "+t.subject)+'</strong><small>'+esc(t.assignee||"Unassigned")+' · '+esc(t.priority)+'</small></div><b>'+slaState(t).label+'</b></div>').join(""):'<div class="empty">No tickets currently at SLA risk.</div>';

    const recent=[...d.tickets].sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at)).slice(0,5);
    $("recentTicketList").innerHTML=recent.map(t=>'<div class="mini-item" data-ticket="'+t.id+'"><i></i><div><strong>'+esc(t.number+" · "+t.subject)+'</strong><small>'+esc(t.status)+" · "+esc(t.requester)+'</small></div><time>'+fmtTime(t.updated_at)+'</time></div>').join("");

    const techs=technicianUsers();
    $("workloadList").innerHTML=techs.map(u=>{const n=d.open.filter(t=>t.assignee_id===u.id).length;return '<div class="mini-item"><i></i><div><strong>'+esc(u.name)+'</strong><small>'+esc(u.role)+'</small></div><b>'+n+' open</b></div>'}).join("");
    qsa("[data-ticket]",$("slaAttentionList")).concat(qsa("[data-ticket]",$("recentTicketList"))).forEach(n=>n.addEventListener("click",()=>openTicket(Number(n.dataset.ticket))));
  }

  function ticketMatches(t){
    const q=$("ticketSearch").value.trim().toLowerCase(),status=$("ticketStatusFilter").value,priority=$("ticketPriorityFilter").value,type=$("ticketTypeFilter").value;
    const hay=[t.number,t.subject,t.description,t.requester,t.category,t.assignee,t.asset].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(status==="all"||t.status===status)&&(priority==="all"||t.priority===priority)&&(type==="all"||t.type===type);
  }
  function renderTickets(){
    if(!state.data)return;
    const rows=[...(state.data.tickets||[])].filter(ticketMatches).sort((a,b)=>{const p={P1:1,P2:2,P3:3,P4:4};return p[a.priority]-p[b.priority]||new Date(b.updated_at)-new Date(a.updated_at)});
    $("ticketTableBody").innerHTML=rows.length?rows.map(t=>{const s=slaState(t);return '<tr data-id="'+t.id+'"><td><span class="ticket-id">'+esc(t.number)+'</span><br>'+esc(t.subject)+'</td><td><span class="type-badge">'+esc(t.type)+'</span></td><td><span class="priority-badge '+t.priority.toLowerCase()+'">'+t.priority+'</span></td><td><span class="status-badge '+slug(t.status)+'">'+esc(t.status)+'</span></td><td>'+esc(t.requester)+'</td><td>'+esc(t.category)+'</td><td>'+esc(t.assignee||"Unassigned")+'</td><td><span class="sla-text '+s.level+'">'+s.label+'</span></td><td>'+fmtTime(t.updated_at)+'</td></tr>'}).join(""):'<tr><td class="empty" colspan="9">No tickets match the current filters.</td></tr>';
    qsa("tr[data-id]",$("ticketTableBody")).forEach(r=>r.addEventListener("click",()=>openTicket(Number(r.dataset.id))));
  }

  function calculatePriority(impact,urgency){
    const score={Low:1,Medium:2,High:3,Critical:4}[impact]+{Low:1,Medium:2,High:3,Critical:4}[urgency];
    if(score>=7)return "P1";if(score>=5)return "P2";if(score>=3)return "P3";return "P4";
  }
  function updatePriorityPreview(){
    const p=calculatePriority($("newImpact").value,$("newUrgency").value),sla=SLA[p];$("priorityPreview").textContent=p;$("slaPreview").textContent="Response "+sla.response+"h · Resolution "+sla.resolution+"h";
  }
  function populateNewTicketForm(){
    if(!state.data)return;
    $("newRequester").innerHTML=requesterUsers().map(u=>'<option value="'+u.id+'">'+esc(u.name)+' · '+esc(u.department)+'</option>').join("");
    $("newAsset").innerHTML='<option value="">No linked asset</option>'+(state.data.assets||[]).map(a=>'<option value="'+a.id+'">'+esc(a.hostname+" · "+a.type)+'</option>').join("");
    updatePriorityPreview();
  }
  ["newImpact","newUrgency"].forEach(id=>$(id).addEventListener("change",updatePriorityPreview));

  $("newTicketForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const requesterId=Number($("newRequester").value),requester=(state.data.users||[]).find(u=>u.id===requesterId);
    const assetId=$("newAsset").value?Number($("newAsset").value):null,asset=(state.data.assets||[]).find(a=>a.id===assetId);
    const priority=calculatePriority($("newImpact").value,$("newUrgency").value),now=new Date(),sla=SLA[priority];
    const payload={type:$("newType").value,subject:$("newSubject").value.trim(),description:$("newDescription").value.trim(),requester_id:requesterId,category:$("newCategory").value,asset_id:assetId,impact:$("newImpact").value,urgency:$("newUrgency").value,priority};
    if(state.mode==="live"){
      try{const created=await fetchJson("/api/tickets",{method:"POST",body:JSON.stringify(payload)});toast("Ticket created",created.number+" added to the queue.");await loadData();openPage("tickets");e.target.reset();updatePriorityPreview()}catch(err){toast("Could not create ticket",err.message,"error")}return;
    }
    const max=Math.max(1000,...state.data.tickets.map(t=>t.id));const id=max+1;
    const ticket={...payload,id,number:"HD-"+id,requester:requester?.name||"Requester",asset:asset?.hostname||"",status:"New",assignee_id:null,assignee:"Unassigned",escalation:0,created_at:now.toISOString(),updated_at:now.toISOString(),response_due:new Date(now.getTime()+sla.response*3600000).toISOString(),resolution_due:new Date(now.getTime()+sla.resolution*3600000).toISOString(),first_response_at:null,resolved_at:null,csat:null,activities:[{at:now.toISOString(),actor:requester?.name||"Requester",action:"Created ticket",note:payload.description}]};
    state.data.tickets.unshift(ticket);persistDemo();renderAll();toast("Ticket created",ticket.number+" added to the demo queue.");e.target.reset();updatePriorityPreview();openPage("tickets");
  });
  $("resetTicketButton").addEventListener("click",()=>setTimeout(updatePriorityPreview));

  function renderAssets(){
    const assets=state.data?.assets||[],q=$("assetSearch").value.trim().toLowerCase(),filtered=assets.filter(a=>!q||[a.hostname,a.type,a.owner,a.serial,a.platform,a.status,a.location].join(" ").toLowerCase().includes(q));
    const types={};assets.forEach(a=>types[a.type]=(types[a.type]||0)+1);
    $("assetSummary").innerHTML=[["Total assets",assets.length],["In service",assets.filter(a=>a.status==="In Service").length],["Needs attention",assets.filter(a=>a.status==="Degraded").length],["Available",assets.filter(a=>a.status==="Available").length],["Infrastructure",assets.filter(a=>["Switch","Server","Access Point"].includes(a.type)).length]].map(x=>'<article class="stat"><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>Asset inventory</small></article>').join("");
    $("assetTableBody").innerHTML=filtered.length?filtered.map(a=>'<tr><td><strong>'+esc(a.hostname)+'</strong></td><td>'+esc(a.type)+'</td><td>'+esc(a.owner)+'</td><td><code>'+esc(a.serial)+'</code></td><td>'+esc(a.platform)+'</td><td><span class="asset-status">'+esc(a.status)+'</span></td><td>'+esc(a.location)+'</td></tr>').join(""):'<tr><td colspan="7" class="empty">No assets match the search.</td></tr>';
  }
  $("assetSearch").addEventListener("input",renderAssets);

  function renderKnowledge(){
    const q=$("kbSearch").value.trim().toLowerCase(),articles=(state.data?.knowledge||[]).filter(a=>!q||[a.title,a.category,a.summary,...(a.tags||[])].join(" ").toLowerCase().includes(q));
    $("kbGrid").innerHTML=articles.length?articles.map(a=>'<article class="kb-card" data-kb="'+a.id+'"><p class="eyebrow">'+esc(a.category)+'</p><h3>'+esc(a.title)+'</h3><p>'+esc(a.summary)+'</p><div class="tag-cloud">'+(a.tags||[]).map(t=>'<span>'+esc(t)+'</span>').join("")+'</div><div class="kb-meta"><span>'+a.views+' views</span><span>'+a.helpful+'% helpful</span></div><p class="kb-body" hidden>'+esc(a.body)+'</p></article>').join(""):'<div class="empty">No knowledge articles found.</div>';
    qsa(".kb-card").forEach(card=>card.addEventListener("click",()=>{const body=card.querySelector(".kb-body");body.hidden=!body.hidden}));
  }
  $("kbSearch").addEventListener("input",renderKnowledge);

  function renderTeam(){
    const d=derive(),techs=technicianUsers();
    $("teamGrid").innerHTML=techs.map(u=>{const assigned=d.open.filter(t=>t.assignee_id===u.id),resolved=d.resolved.filter(t=>t.assignee_id===u.id),cs=resolved.map(t=>Number(t.csat)).filter(n=>n>0);const avg=cs.length?(cs.reduce((a,b)=>a+b,0)/cs.length).toFixed(1):"—";return '<article class="team-card"><div class="avatar">'+esc(u.name.split(" ").map(x=>x[0]).slice(0,2).join(""))+'</div><h3>'+esc(u.name)+'</h3><span>'+esc(u.role)+'</span><div class="team-stats"><div><strong>'+assigned.length+'</strong><small>Open</small></div><div><strong>'+resolved.length+'</strong><small>Resolved</small></div><div><strong>'+avg+'</strong><small>CSAT</small></div></div></article>'}).join("");
  }

  function renderAnalytics(){
    const d=derive(),tickets=d.tickets;const renderBars=(id,map)=>{
      const entries=Object.entries(map).sort((a,b)=>b[1]-a[1]),max=Math.max(1,...entries.map(e=>e[1]));
      $(id).innerHTML=entries.map(([k,v])=>'<div class="bar-row"><span>'+esc(k)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+v/max*100+'%"></div></div><strong>'+v+'</strong></div>').join("");
    };
    const cats={},statuses={};tickets.forEach(t=>{cats[t.category]=(cats[t.category]||0)+1;statuses[t.status]=(statuses[t.status]||0)+1});renderBars("categoryChart",cats);renderBars("statusChart",statuses);
    const resolved=d.resolved,resMinutes=resolved.filter(t=>t.resolved_at).map(t=>(new Date(t.resolved_at)-new Date(t.created_at))/60000).filter(n=>n>=0),avgRes=resMinutes.length?resMinutes.reduce((a,b)=>a+b,0)/resMinutes.length:NaN;
    $("performanceMetrics").innerHTML=[["SLA compliance",d.compliance.toFixed(1)+"%"],["Average first response",fmtMinutes(d.avgResponse)],["Average resolution",fmtMinutes(avgRes)],["Open backlog",d.open.length],["SLA breaches",d.breached.length]].map(x=>'<div class="metric-row"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join("");
    $("outcomeMetrics").innerHTML=[["Resolved / closed",resolved.length],["Resolved today",d.resolvedToday],["Average CSAT",Number.isFinite(d.csat)?d.csat.toFixed(2)+"/5":"—"],["Incidents",tickets.filter(t=>t.type==="Incident").length],["Service requests",tickets.filter(t=>t.type==="Service Request").length]].map(x=>'<div class="metric-row"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join("");
  }

  async function openTicket(id){
    let t=(state.data?.tickets||[]).find(x=>x.id===id);if(!t)return;state.selectedTicket=id;
    $("detailTicketId").textContent=t.number;$("detailSubject").textContent=t.subject;$("detailDescription").textContent=t.description;
    $("detailMeta").innerHTML=[t.type,t.category,t.requester,t.asset||"No asset",t.impact+" impact",t.urgency+" urgency"].map(x=>"<span>"+esc(x)+"</span>").join("");
    $("detailStatus").value=t.status;$("detailPriority").value=t.priority;$("detailEscalation").value=String(t.escalation||0);
    $("detailAssignee").innerHTML='<option value="">Unassigned</option>'+technicianUsers().map(u=>'<option value="'+u.id+'">'+esc(u.name+" · "+u.role)+'</option>').join("");$("detailAssignee").value=t.assignee_id?String(t.assignee_id):"";
    const sla=slaState(t);$("detailSlaBox").innerHTML='<strong class="sla-text '+sla.level+'">'+sla.label+'</strong><span>Response due: '+new Date(t.response_due).toLocaleString()+'</span><span>Resolution due: '+new Date(t.resolution_due).toLocaleString()+'</span>';
    $("ticketTimeline").innerHTML=(t.activities||[]).slice().sort((a,b)=>new Date(b.at)-new Date(a.at)).map(a=>'<div class="timeline-item"><i></i><div><strong>'+esc(a.actor+" · "+a.action)+'</strong><p>'+esc(a.note||"")+'</p><small>'+new Date(a.at).toLocaleString()+'</small></div></div>').join("");
    const attachments=t.attachments||[];
    $("ticketAttachments").innerHTML=attachments.length?attachments.map(a=>{
      const download=state.mode==="live"&&a.id?'<a href="'+esc(state.backendUrl.replace(/\/$/,"")+"/api/attachments/"+a.id)+'" target="_blank" rel="noopener">Download</a>':'<span class="sla-text good">Demo file</span>';
      return '<div class="attachment-item"><div><strong>'+esc(a.filename)+'</strong><small>'+fmtBytes(a.size_bytes)+' · '+esc(a.uploaded_by||"Service Desk")+' · '+fmtTime(a.uploaded_at)+'</small></div>'+download+'</div>';
    }).join(""):'<div class="empty">No attachments on this ticket.</div>';
    $("newComment").value="";$("ticketAttachment").value="";$("ticketDialog").showModal();
  }
  $("addCommentButton").addEventListener("click",async()=>{
    const note=$("newComment").value.trim();if(!note||!state.selectedTicket)return;
    if(state.mode==="live"){try{await fetchJson("/api/tickets/"+state.selectedTicket+"/comments",{method:"POST",body:JSON.stringify({author_id:10,note})});await loadData();await openTicket(state.selectedTicket);toast("Work note added")}catch(e){toast("Could not add note",e.message,"error")}return}
    const t=state.data.tickets.find(x=>x.id===state.selectedTicket);t.activities.push({at:new Date().toISOString(),actor:"Jim Camus",action:"Work note",note});t.updated_at=new Date().toISOString();persistDemo();renderAll();openTicket(t.id);toast("Work note added","Saved to the demo ticket timeline.");
  });

  $("uploadAttachmentButton").addEventListener("click",async()=>{
    const input=$("ticketAttachment"),file=input.files?.[0],id=state.selectedTicket;
    if(!id||!file){toast("Choose a file","Select an attachment before uploading.","error");return}
    if(file.size>5*1024*1024){toast("Attachment too large","Maximum size is 5 MB.","error");return}

    if(state.mode==="demo"){
      const t=state.data.tickets.find(x=>x.id===id);
      t.attachments=t.attachments||[];
      t.attachments.push({id:Date.now(),filename:file.name,size_bytes:file.size,uploaded_at:new Date().toISOString(),uploaded_by:"Jim Camus"});
      t.activities.push({at:new Date().toISOString(),actor:"Jim Camus",action:"Attachment added",note:file.name});
      t.updated_at=new Date().toISOString();persistDemo();renderAll();openTicket(id);toast("Attachment added","Demo stores attachment metadata only.");return;
    }

    const form=new FormData();form.append("file",file);form.append("author_id","10");
    try{
      const response=await fetch(state.backendUrl.replace(/\/$/,"")+"/api/tickets/"+id+"/attachments",{method:"POST",body:form});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.detail||"Upload failed");
      await loadData();openTicket(id);toast("Attachment uploaded",result.filename||file.name);
    }catch(e){toast("Could not upload attachment",e.message,"error")}
  });

  $("saveTicketButton").addEventListener("click",async()=>{
    const id=state.selectedTicket;if(!id)return;
    const assigneeId=$("detailAssignee").value?Number($("detailAssignee").value):null,tech=technicianUsers().find(u=>u.id===assigneeId);
    const body={status:$("detailStatus").value,priority:$("detailPriority").value,assignee_id:assigneeId,escalation:Number($("detailEscalation").value)};
    if(state.mode==="live"){try{await fetchJson("/api/tickets/"+id,{method:"PUT",body:JSON.stringify(body)});$("ticketDialog").close();await loadData();toast("Ticket updated")}catch(e){toast("Could not update ticket",e.message,"error")}return}
    const t=state.data.tickets.find(x=>x.id===id),oldStatus=t.status;t.status=body.status;t.priority=body.priority;t.assignee_id=assigneeId;t.assignee=tech?.name||"Unassigned";t.escalation=body.escalation;t.updated_at=new Date().toISOString();
    if(!t.first_response_at&&assigneeId)t.first_response_at=new Date().toISOString();
    if(["Resolved","Closed"].includes(t.status)&&!t.resolved_at)t.resolved_at=new Date().toISOString();
    if(!["Resolved","Closed"].includes(t.status))t.resolved_at=null;
    t.activities.push({at:new Date().toISOString(),actor:"Jim Camus",action:"Ticket updated",note:"Status "+oldStatus+" → "+t.status+"; assignee "+t.assignee+"; escalation L"+t.escalation+"."});
    persistDemo();$("ticketDialog").close();renderAll();toast("Ticket updated",t.number+" saved.");
  });

  ["ticketSearch"].forEach(id=>$(id).addEventListener("input",renderTickets));
  ["ticketStatusFilter","ticketPriorityFilter","ticketTypeFilter"].forEach(id=>$(id).addEventListener("change",renderTickets));
  $("refreshButton").addEventListener("click",()=>loadData(true));

  const conn=$("connectionDialog");
  $("connectionButton").addEventListener("click",()=>{qsa('input[name="mode"]').forEach(r=>r.checked=r.value===state.mode);$("backendUrlInput").value=state.backendUrl;conn.showModal()});
  $("saveConnectionButton").addEventListener("click",()=>{
    const mode=qsa('input[name="mode"]').find(r=>r.checked)?.value||"demo",url=$("backendUrlInput").value.trim().replace(/\/$/,"");
    if(mode==="live"&&!/^https?:\/\//i.test(url)){toast("Invalid backend URL","Use a URL such as http://127.0.0.1:8790","error");return}
    state.mode=mode;state.backendUrl=url||"http://127.0.0.1:8790";localStorage.setItem("helpdesk_mode",mode);localStorage.setItem("helpdesk_backend_url",state.backendUrl);conn.close();state.data=null;loadData(true);
  });

  function renderAll(){
    if(!state.data)return;$("lastRefresh").textContent=(state.lastRefresh||new Date()).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"});
    renderDashboard();renderTickets();populateNewTicketForm();renderAssets();renderKnowledge();renderTeam();renderAnalytics();
  }
  setInterval(()=>{if(state.mode==="live"&&document.visibilityState==="visible")loadData(false)},45000);
  loadData();
})();