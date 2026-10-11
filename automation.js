(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const html = (value) => String(value == null ? "" : value)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
  const stamp = (value) => {
    const date = new Date(value);
    return value && !Number.isNaN(date.valueOf()) ? date.toLocaleString() : "—";
  };
  let snapshot = {settings:null,alerts:[],runs:[]};
  let snapshotWorkspace = null;
  let busy = false;
  const cloud = () => window.OpsFusionCloud;
  const connected = () => !!cloud()?.isCloudActive?.()
    && $("workspaceModeLabel")?.textContent?.trim() === "CLOUD WORKSPACE";
  const owner = () => connected() && cloud()?.getRole?.() === "admin";
  const status = (message) => { if ($("automationStatus")) $("automationStatus").textContent = message; };

  function render() {
    const ready = connected() && snapshotWorkspace === cloud().getWorkspaceId();
    const data = ready ? snapshot : {settings:null,alerts:[],runs:[]};
    const s = data.settings;
    const alerts = data.alerts || [], runs = data.runs || [];
    $("automationOpenCount").textContent=ready?String(alerts.filter(a=>a.status==="open").length):"—";
    $("automationNewCount").textContent=ready&&runs.length?String(runs[0].created):"—";
    $("automationSourceLabel").textContent=ready&&runs.length?runs[0].source:"—";
    $("automationRunCount").textContent=ready?String(runs.length):"—";
    if(s) {
      $("automationSlaEnabled").checked=!!s.ticket_sla_enabled;
      $("automationWarrantyEnabled").checked=!!s.warranty_enabled;
      $("automationMaintenanceEnabled").checked=!!s.maintenance_enabled;
      $("automationWarrantyDays").value=s.warranty_days;
      $("automationMaintenanceDays").value=s.maintenance_days;
    }
    for(const id of ["automationSlaEnabled","automationWarrantyEnabled","automationMaintenanceEnabled",
      "automationWarrantyDays","automationMaintenanceDays"]) $(id).disabled=!owner()||busy;
    $("automationRunBtn").disabled=!connected()||cloud().getRole()==="viewer"||busy;
    $("automationSaveRulesBtn").disabled=!owner()||busy;
    $("automationRefreshBtn").disabled=!connected()||busy;
    $("automationAlertRows").innerHTML=!ready
      ? '<div class="empty">Sign in to Cloud Workspace to view verified alerts.</div>'
      : alerts.length ? alerts.map(a =>
        '<div class="stack-row"><div><strong>'+html(a.title)+'</strong><small>'+
        html(a.detail+" · "+a.severity.toUpperCase()+" · "+a.category+
        " · first detected "+stamp(a.first_detected))+
        '</small></div><div><span class="badge '+(a.status==="open"?"amber":"blue")+'">'+html(a.status)+'</span>'+
        (a.status==="open"&&owner()?' <button class="mini-btn" data-alert-ack="'+html(a.event_key)+'">Acknowledge</button>':"")+
        '</div></div>').join("")
      : '<div class="empty">No alerts. Add a maintenance task or a due-soon warranty, then Run Checks Now.</div>';
    $("automationRunRows").innerHTML=!ready
      ? '<div class="empty">Sign in to Cloud Workspace to view execution history.</div>'
      : runs.length ? runs.map(r=>'<div class="stack-row"><div><strong>'+
        html(r.source+" scan · "+stamp(r.executed_at))+'</strong><small>'+
        html(r.checked+" qualifying conditions · "+r.created+" new alerts · "+r.active+" open")+
        '</small></div></div>').join("")
      : '<div class="empty">No scans yet. Start one manually or wait for the hourly scheduler.</div>';
    $("automationAlertRows").querySelectorAll("[data-alert-ack]").forEach(b=>b.addEventListener("click",async()=>{
      b.disabled=true;
      try {
        await cloud().acknowledgeAutomation(b.dataset.alertAck);
        await refresh();
      }catch(e){status("Could not acknowledge alert: "+e.message);b.disabled=false;}
    }));
  }

  async function refresh() {
    if(!connected()) {
      snapshotWorkspace=null; snapshot={settings:null,alerts:[],runs:[]};
      status("Sign in to Cloud Workspace to see real Supabase automation. Portfolio Demo is separate.");
      render(); return;
    }
    const requested=cloud().getWorkspaceId();
    status("Loading verified cloud automation records...");
    try {
      const result=await cloud().loadAutomations();
      if(!connected()||cloud().getWorkspaceId()!==requested) return;
      snapshotWorkspace=requested;
      snapshot=result;
      render();
      status("Cloud scheduler: hourly · Manual checks: available · "+result.alerts.filter(a=>a.status==="open").length+" open alerts. Results are read from Supabase.");
    }catch(e){status("Unable to load automation results: "+e.message);render();}
  }

  async function doTask(button,action) {
    if(busy||!connected())return;
    busy=true;render();
    try {await action();}
    catch(e){status("Automation operation failed: "+e.message);}
    finally {busy=false;render();}
  }

  $("automationRefreshBtn").addEventListener("click",()=>doTask($("automationRefreshBtn"),refresh));
  $("automationRunBtn").addEventListener("click",()=>doTask($("automationRunBtn"),async()=>{
    status("Checking latest saved data and running Supabase automation...");
    await window.OpsFusionFlushSaves();
    const result=await cloud().runAutomations();
    await refresh();
    status("Cloud check complete: "+result.checked+" matching conditions, "+result.created+" new alerts, "+result.active+" open.");
  }));
  $("automationSaveRulesBtn").addEventListener("click",()=>doTask($("automationSaveRulesBtn"),async()=>{
    if(!owner())throw new Error("Only the workspace owner can change automation settings.");
    await cloud().saveAutomationRules({
      ticket_sla_enabled:$("automationSlaEnabled").checked,
      warranty_enabled:$("automationWarrantyEnabled").checked,
      maintenance_enabled:$("automationMaintenanceEnabled").checked,
      warranty_days:Number($("automationWarrantyDays").value),
      maintenance_days:Number($("automationMaintenanceDays").value)
    });
    await refresh();
    status("Cloud automation rules saved. Future hourly and manual scans will use them.");
  }));

  const link=document.querySelector('[data-page="automation"]');
  if(link)link.addEventListener("click",()=>refresh());
  window.addEventListener("opsfusion-session-ended",()=>{
    snapshotWorkspace=null;snapshot={settings:null,alerts:[],runs:[]};render();
  });
  render();
})();