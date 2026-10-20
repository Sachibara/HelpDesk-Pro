(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const now = () => new Date().toISOString();
  const uid = (prefix) => prefix + "-" + (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)).toUpperCase();

  const pageMeta = {
    overview: ["Unified operations", "Overview"],
    endpoints: ["Shared source of truth", "Endpoints"],
    assets: ["Asset lifecycle", "Assets"],
    identity: ["Directory operations", "Identity & Access"],
    troubleshooting: ["Network diagnostics", "Troubleshooting"],
    remote: ["Endpoint operations", "Remote Support"],
    documentation: ["Network records", "Documentation"],
    knowledge: ["Support reference", "Knowledge Base"],
    compliance: ["Endpoint posture", "Compliance"],
    incidents: ["IT service management", "Service Desk"],
    audit: ["Governance", "Audit Log"],
    automation: ["Cloud workflow engine", "Automation Center"],
    settings: ["Configuration", "Settings"]
  };

  // Configuration templates do not create employees or memberships.
  function cloudRoleTemplates() {
    return [
      {id:"TPL-STD",name:"Standard Employee",department:"Corporate",groups:[],description:"Record-only standard user profile"},
      {id:"TPL-IT",name:"IT Support",department:"IT",groups:[],description:"Record-only IT support profile"},
      {id:"TPL-ADMIN",name:"IT Administrator",department:"IT",groups:[],description:"Record-only administrator profile"}
    ];
  }

  function emptyCloudState() {
    const stamp = now();
    return {
      meta: { version: 2, workspaceName: "OpsFusion Unified", createdAt: stamp, updatedAt: stamp },
      settings: { autoTicketCompliance: false, autoTicketDiagnostic: false },
      complianceRules: { maxMissingUpdates: 0, maxRebootAge: 14, requireFirewall: true, requireBitlocker: true, requireAv: true },
      endpoints: [], vlans: [], ports: [], docChanges: [], diagnostics: [],
      remoteActions: [], identities: [], groups: [], templates: cloudRoleTemplates(),
      technicians: [], assets: [], maintenance: [], software: [],
      knowledge: [], incidents: [], audit: []
    };
  }

  let state = emptyCloudState();
  let cloudRole = "signed-out";

  let cloudSaveTimer = null;
  let cloudSavePending = false;
  let cloudSavePromise = Promise.resolve();
  let workspaceCommitQueue = Promise.resolve();
  let workspaceSessionEpoch = 0;

  function showSaveStatus(message, problem = false) {
    const el = $("cloudSaveStatus");
    if (el) {
      el.textContent = message;
      el.setAttribute("aria-label", problem ? "Cloud save error: " + message : message);
      el.style.color = problem ? "var(--coral)" : "";
    }
  }

  function migrateUnifiedState() {
    const base = (emptyCloudState());
    ["identities","groups","templates","technicians","assets","maintenance","software","knowledge","endpoints","vlans","ports","docChanges","diagnostics","remoteActions","incidents","audit"].forEach((key) => {
      if (!Array.isArray(state[key])) state[key] = base[key];
    });
    // Upgrade older empty workspaces with configuration-only templates.
    if (!state.templates.length) state.templates = cloudRoleTemplates();
    state.incidents = (state.incidents || []).map(normalizeTicket);
    state.assets.forEach((asset) => {
      const endpoint = endpointById(asset.endpointId);
      const user = identityById(asset.assignedUserId);
      if (endpoint && user && asset.status === "Assigned") endpoint.owner = user.displayName;
    });
  }

  let currentEndpointId = state.endpoints[0] ? state.endpoints[0].id : null;
  let selectedDiagnosticId = null;

  function saveState() {
    state.meta.updatedAt = now();
    // Persist records only through an authenticated cloud session.

    if (window.OpsFusionCloud?.isCloudActive?.() && cloudRole !== "viewer") {
      clearTimeout(cloudSaveTimer);
      cloudSavePending = true;
      showSaveStatus("Unsaved changes");
      cloudSaveTimer = setTimeout(() => {
        cloudSavePending = false;
        cloudSaveTimer = null;
        const snapshot = JSON.parse(JSON.stringify(state));
        showSaveStatus("Saving to Supabase...");
        cloudSavePromise = window.OpsFusionCloud.saveWorkspace(snapshot).then(() => {
          if (!cloudSavePending) showSaveStatus("Saved to Supabase");
        }).catch((error) => {
          console.error("Cloud save failed:", error);
          showSaveStatus("Not saved — " + (error.message || "connection error"), true);
          toast("Cloud save failed", error.message || "Your change was NOT saved to Supabase. Please retry.");
          throw error;
        });
        // Failure remains observable to Refresh/Sign Out without an unhandled promise.
        cloudSavePromise.catch(() => {});
      }, 350);
    }
  }

  // Commit a validated change before changing the visible Cloud Workspace.
  // A rejected/conflicted Supabase write cannot masquerade as a saved asset.
  async function commitWorkspaceChange(buildNext) {
    // Capture session identity when the user clicks, not when a queued edit starts.
    const epoch = workspaceSessionEpoch;
    const targetWorkspace = window.OpsFusionCloud?.getWorkspaceId?.();
    // Serialize state-building, not just HTTP requests. Two quick edits must
    // never copy the same older snapshot and erase each other's changes.
    const operation = workspaceCommitQueue.then(async () => {
      if (epoch !== workspaceSessionEpoch) {
        throw new Error("Workspace session changed during this action.");
      }

        if (!window.OpsFusionCloud?.isCloudActive?.() || cloudRole === "viewer") {
          throw new Error("An editor cloud session is required.");
        }
        if (cloudSavePending) {
          clearTimeout(cloudSaveTimer);
          cloudSaveTimer = null;
          cloudSavePending = false;
          await cloudSavePromise;
          await window.OpsFusionCloud.saveWorkspace(state);
          showSaveStatus("Saved to Supabase");
        } else {
          await cloudSavePromise;
        }

      if (epoch !== workspaceSessionEpoch) throw new Error("Workspace session changed during this action.");
      const proposed = JSON.parse(JSON.stringify(state));
      buildNext(proposed);
      validateUniqueRecords(proposed, state);
      proposed.meta.updatedAt = now();

        showSaveStatus("Saving to Supabase...");
        try {
          await window.OpsFusionCloud.saveWorkspace(proposed);
        } catch (error) {
          showSaveStatus("Not saved — " + (error.message || "database rejected change"), true);
          throw error;
        }

      if (epoch !== workspaceSessionEpoch || 
          (window.OpsFusionCloud?.getWorkspaceId?.() !== targetWorkspace)) {
        throw new Error("Workspace changed while saving; refresh the current account.");
      }
      state = proposed;
      showSaveStatus("Saved to Supabase");
      return state;
    });
    workspaceCommitQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtDate(value) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  }

  function toast(title, message) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = "<strong>" + esc(title) + "</strong><span>" + esc(message || "") + "</span>";
    $("toastRegion").appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  function audit(module, action, target, detail) {
    const event = {
      id: uid("AUD"),
      actorId: window.OpsFusionCloud?.getUser?.()?.id || "",
      module: String(module || "System"),
      action: String(action || "Action"),
      target: String(target || ""),
      detail: String(detail || ""),
      createdAt: now()
    };
    state.audit.unshift(event);
    state.audit = state.audit.slice(0, 500);
    if (window.OpsFusionCloud?.isCloudActive?.() && cloudRole !== "viewer") {
      window.OpsFusionCloud.pushAudit(event).catch((error) => console.error("Server audit write failed:", error));
    }
  }

  function endpointById(id) {
    return state.endpoints.find((item) => item.id === id) || null;
  }

  function incidentById(id) {
    return state.incidents.find((item) => item.id === id) || null;
  }
  function identityById(id) {
    return (state.identities || []).find((item) => item.id === id) || null;
  }

  function assetById(id) {
    return (state.assets || []).find((item) => item.id === id) || null;
  }

  function assetByEndpointId(id) {
    return (state.assets || []).find((item) => item.endpointId === id) || null;
  }

  function groupById(id) {
    return (state.groups || []).find((item) => item.id === id) || null;
  }

  function availableRoleTemplates() {
    const existing = Array.isArray(state.templates)
      ? state.templates.filter((t) => t && t.id && t.name) : [];

    const merged = new Map(cloudRoleTemplates().map((t) => [t.id, t]));
    existing.forEach((t) => merged.set(t.id, {
      ...t, groups: Array.isArray(t.groups) ? t.groups : []
    }));
    return [...merged.values()];
  }

  function templateById(id) {
    return availableRoleTemplates().find((t) => t.id === id) || null;
  }

  function availableTechnicians() {
    const known = Array.isArray(state.technicians) ? state.technicians : [];
    const ids = new Set(known.map((t) => t.id));
    const identityTechs = (state.identities || []).filter((u) => {
      const template = templateById(u.templateId);
      return u.status === "Active" && (template?.department === "IT" || u.department === "IT");
    }).filter((u) => !ids.has(u.id)).map((u) => ({
      id: u.id, name: u.displayName, role: u.title || "IT Support",
      specialty: "Workspace identity record; no external directory connection"
    }));
    const staff = typeof window !== "undefined" ? window.OpsFusionStaff?.members() || [] : [];
    const staffTechs = staff.filter(m => m.role !== "viewer").map(m => ({id:m.user_id,name:m.name || m.email,role:m.role,specialty:"Authorized workspace staff"}));
    return [...staffTechs, ...known, ...identityTechs].filter((t,i,all)=>all.findIndex(x=>x.id===t.id)===i);
  }

  function technicianById(id) {
    return availableTechnicians().find((t) => t.id === id) || null;
  }

  const SLA = {
    P1: { response: 1, resolution: 2 },
    P2: { response: 2, resolution: 8 },
    P3: { response: 4, resolution: 24 },
    P4: { response: 8, resolution: 72 }
  };

  function addHours(iso, hours) {
    return new Date(new Date(iso).getTime() + Number(hours || 0) * 3600000).toISOString();
  }

  function priorityFromImpactUrgency(impact, urgency) {
    const level = { Low: 1, Medium: 2, High: 3 };
    const score = (level[impact] || 2) + (level[urgency] || 2);
    if (score >= 6) return "P1";
    if (score === 5) return "P2";
    if (score === 4) return "P3";
    return "P4";
  }

  function normalizeTicket(ticket) {
    const createdAt = ticket.createdAt || ticket.created_at || now();
    const priority = ticket.priority || "P3";
    const sla = SLA[priority] || SLA.P3;
    const status = ticket.status || "New";
    return {
      id: ticket.id || uid("INC"),
      type: ticket.type || "Incident",
      endpointId: ticket.endpointId || "",
      assetId: ticket.assetId || "",
      requesterId: ticket.requesterId || "",
      assigneeId: ticket.assigneeId || "",
      category: ticket.category || ticket.source || "General",
      title: ticket.title || ticket.subject || "Service desk ticket",
      description: ticket.description || "",
      impact: ticket.impact || (priority === "P1" ? "High" : "Medium"),
      urgency: ticket.urgency || (["P1","P2"].includes(priority) ? "High" : "Medium"),
      priority,
      status,
      source: ticket.source || "Manual",
      escalation: Number(ticket.escalation || 0),
      createdAt,
      updatedAt: ticket.updatedAt || ticket.updated_at || createdAt,
      responseDue: ticket.responseDue || ticket.response_due || addHours(createdAt, sla.response),
      resolutionDue: ticket.resolutionDue || ticket.resolution_due || addHours(createdAt, sla.resolution),
      firstResponseAt: ticket.firstResponseAt || ticket.first_response_at || null,
      resolvedAt: ticket.resolvedAt || ticket.resolved_at || (["Resolved","Closed"].includes(status) ? ticket.updatedAt || createdAt : null),
      portalUserId: ticket.portalUserId || "",
      employeeMessages: Array.isArray(ticket.employeeMessages) ? ticket.employeeMessages : [],
      activities: Array.isArray(ticket.activities) ? ticket.activities : []
    };
  }

  function ticketSlaState(ticket) {
    const t = normalizeTicket(ticket);
    const open = !["Resolved","Closed"].includes(t.status);
    const nowMs = Date.now();
    const responseDue = new Date(t.responseDue).getTime();
    const resolutionDue = new Date(t.resolutionDue).getTime();
    const responseDone = t.firstResponseAt ? new Date(t.firstResponseAt).getTime() : null;
    const resolved = t.resolvedAt ? new Date(t.resolvedAt).getTime() : null;
    const responseBreached = responseDone ? responseDone > responseDue : open && nowMs > responseDue;
    const resolutionBreached = resolved ? resolved > resolutionDue : open && nowMs > resolutionDue;
    if (responseBreached || resolutionBreached) return { level:"bad", label:"Breached" };
    if (open) {
      const remain = Math.min(responseDone ? Infinity : responseDue - nowMs, resolutionDue - nowMs);
      if (remain <= 2 * 3600000) return { level:"warn", label:"At risk" };
    }
    return { level:"good", label: open ? "On track" : "Met" };
  }

  function warrantyInfo(asset) {
    if (!asset || !asset.warrantyExpiry) return { days:null, label:"No warranty date", tone:"purple" };
    const days = Math.ceil((new Date(asset.warrantyExpiry + "T23:59:59").getTime() - Date.now()) / 86400000);
    if (days < 0) return { days, label:"Expired", tone:"red" };
    if (days <= 45) return { days, label:days + "d left", tone:"amber" };
    return { days, label:days + "d left", tone:"green" };
  }

  function expiringIdentity(user) {
    if (!user || !user.expiry || user.status !== "Active") return false;
    const diff = new Date(user.expiry + "T23:59:59").getTime() - Date.now();
    return diff >= 0 && diff <= 30 * 86400000;
  }

  function recordKey(value) {
    return String(value || "").normalize("NFKC").trim().replace(/\s+/g," ").toLowerCase();
  }

  function validateUniqueRecords(next, previous = {}) {
    const rules={identities:["id","displayName","username","upn"],assets:["id","tag","hostname","serial","endpointId"]};
    for(const [collection,fields] of Object.entries(rules)) {
      const records=next[collection]||[],old=previous[collection]||[];
      for(const field of fields) {
        const seen=new Map();
        for(const record of records) {
          const key=recordKey(record[field]);
          if(!key || (field==="serial" && ["—","-","n/a","unknown"].includes(key)))continue;
          const other=seen.get(key);
          if(other) {
            const legacy=field!=="id" && record.id!==other.id && [record,other].every(r=>old.some(o=>o.id===r.id && recordKey(o[field])===key));
            if(!legacy)throw new Error((collection==="identities"?"Identity":"Asset")+" already exists: duplicate "+({displayName:"full name",upn:"email identifier",hostname:"name",endpointId:"linked endpoint"}[field]||field)+". Open the existing record instead.");
          }
          seen.set(key,record);
        }
      }
    }
    for(const asset of next.assets||[]) {
      const old=(previous.assets||[]).find(a=>a.id===asset.id);
      if(old?.status==="Assigned" && asset.status==="Assigned" && old.assignedUserId!==asset.assignedUserId)
        throw new Error("Asset is already assigned. Release it to Available and save before assigning it to another person.");
    }
  }

  function usernameFor(first, last) {
    const base = ((first || "").trim().slice(0,1) + (last || "").trim()).toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
    return base;
  }

  function badge(text, tone) {
    return '<span class="badge ' + esc(tone || "") + '">' + esc(text) + "</span>";
  }

  function agentBadge(agent) {
    return agent === "online" ? badge("Online", "green") : badge("Offline", "red");
  }

  function priorityTone(priority) {
    if (priority === "P1") return "red";
    if (priority === "P2") return "amber";
    if (priority === "P3") return "blue";
    return "purple";
  }

  function statusTone(status) {
    if (status === "Resolved" || status === "Closed") return "green";
    if (status === "Pending") return "amber";
    if (status === "New" || status === "Active") return "blue";
    return "purple";
  }

  function evaluateEndpoint(endpoint) {
    if (!endpoint || endpoint.complianceManaged === false) {
      return { status: "not-applicable", failures: [], checks: [] };
    }
    const rules = state.complianceRules;
    const checks = [
      { key: "updates", label: "Missing updates", pass: Number(endpoint.updatesMissing || 0) <= Number(rules.maxMissingUpdates || 0), value: Number(endpoint.updatesMissing || 0) },
      { key: "av", label: "Antivirus / EDR", pass: !rules.requireAv || endpoint.av === "healthy", value: endpoint.av },
      { key: "firewall", label: "Endpoint firewall", pass: !rules.requireFirewall || endpoint.firewall === true, value: endpoint.firewall ? "Enabled" : "Disabled" },
      { key: "bitlocker", label: "Disk encryption", pass: !rules.requireBitlocker || endpoint.bitlocker === true, value: endpoint.bitlocker ? "Enabled" : "Disabled" },
      { key: "reboot", label: "Reboot age", pass: Number(endpoint.rebootAge || 0) <= Number(rules.maxRebootAge || 14), value: String(endpoint.rebootAge || 0) + " days" }
    ];
    const failures = checks.filter((check) => !check.pass);
    return { status: failures.length ? "noncompliant" : "compliant", failures, checks };
  }

  function fleetStats() {
    const managed = state.endpoints.filter((e) => e.complianceManaged !== false);
    const compliant = managed.filter((e) => evaluateEndpoint(e).status === "compliant").length;
    const online = state.endpoints.filter((e) => e.agent === "online").length;
    const openIncidents = state.incidents.filter((i) => !["Resolved", "Closed"].includes(i.status)).length;
    const complianceRate = managed.length ? Math.round((compliant / managed.length) * 100) : 100;
    const onlineRate = state.endpoints.length ? Math.round((online / state.endpoints.length) * 100) : 100;
    const incidentPenalty = Math.min(35, openIncidents * 6);
    const health = Math.max(0, Math.round(complianceRate * 0.5 + onlineRate * 0.35 + (100 - incidentPenalty) * 0.15));
    return { managed, compliant, online, openIncidents, complianceRate, onlineRate, health };
  }

  function openPage(page) {
    qsa("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === page));
    qsa("[data-page]").forEach((button) => {
      const active = button.dataset.page === page;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (pageMeta[page]) {
      $("pageEyebrow").textContent = pageMeta[page][0];
      $("pageTitle").textContent = pageMeta[page][1];
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    renderPage(page);
  }

  qsa("[data-page]").forEach((button) => button.addEventListener("click", () => openPage(button.dataset.page)));
  qsa("[data-go]").forEach((button) => button.addEventListener("click", () => openPage(button.dataset.go)));

  function renderPage(page) {
    if (page === "overview") renderOverview();
    if (page === "endpoints") renderEndpoints();
    if (page === "assets") renderAssets();
    if (page === "identity") renderIdentity();
    if (page === "troubleshooting") renderTroubleshooting();
    if (page === "remote") renderRemote();
    if (page === "documentation") renderDocumentation();
    if (page === "knowledge") renderKnowledge();
    if (page === "compliance") renderCompliance();
    if (page === "incidents") renderIncidents();
    if (page === "audit") renderAudit();
    if (page === "settings") renderSettings();
  }

  function renderOverview() {
    const stats = fleetStats();
    $("kpiEndpoints").textContent = state.endpoints.length;
    $("kpiOnline").textContent = ("—");
    $("kpiCompliance").textContent = ("N/A");
    $("kpiIncidents").textContent = stats.openIncidents;
    $("kpiDiagnostics").textContent = state.diagnostics.length;
    $("healthScoreHero").textContent = ("—");
    $("healthLabelHero").textContent = ("No connected endpoint telemetry");
    $("healthBar").style.width = ("0%");

    const attention = state.endpoints
      .map((endpoint) => ({ endpoint, compliance: evaluateEndpoint(endpoint) }))
      .filter((row) => row.endpoint.agent !== "online" || row.compliance.status === "noncompliant")
      .slice(0, 6);

    $("attentionQueue").innerHTML = attention.length ? attention.map((row) => {
      const reasons = [];
      if (row.endpoint.agent !== "online") reasons.push("agent offline");
      reasons.push(...row.compliance.failures.map((f) => f.label));
      return '<div class="stack-row"><div><strong>' + esc(row.endpoint.hostname) + '</strong><small>' +
        esc(row.endpoint.ip + " · " + row.endpoint.site + " · " + reasons.join(", ")) +
        '</small></div><button class="mini-btn" data-open-endpoint="' + esc(row.endpoint.id) + '">Open</button></div>';
    }).join("") : '<div class="empty">No endpoints require attention.</div>';

    const incidents = state.incidents.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
    $("recentIncidents").innerHTML = incidents.length ? incidents.map((incident) => {
      const ep = endpointById(incident.endpointId);
      return '<div class="stack-row"><div><strong>' + esc(incident.id + " · " + incident.title) + '</strong><small>' +
        esc((ep ? ep.hostname : "Unassigned") + " · " + incident.source) +
        '</small></div>' + badge(incident.status, statusTone(incident.status)) + '</div>';
    }).join("") : '<div class="empty">No incidents yet.</div>';

    $("overviewAudit").innerHTML = renderAuditEntries(state.audit.slice(0, 8));

      $("attentionQueue").innerHTML = '<div class="empty">No live endpoint monitoring agent is connected. Inventory entries do not report device health.</div>';

    renderOpsVisuals(stats);
    bindOpenEndpointButtons();
  }

  function renderOpsVisuals(stats) {
    if (!$("healthTrendChart")) return;
    if ($("healthTrendEmpty")) $("healthTrendEmpty").hidden = false;

      // A user-entered inventory record is not an agent heartbeat. Never
      // manufacture telemetry, historical measurements or risk indices.
      $("healthTrendLine").setAttribute("points", "");
      $("healthTrendArea").setAttribute("d", "");
      $("healthTrendPoints").innerHTML = "";
      $("healthTrendDates").innerHTML = "";
      $("riskScoreValue").textContent = "—";
      $("riskKey").innerHTML = '<div class="empty">No measured risk signals.</div>';
      $("riskDonut").style.background = "none";
      if ($("fabricTickets")) $("fabricTickets").textContent = stats.openIncidents + " recorded";
      if ($("fabricAssets")) $("fabricAssets").textContent = state.assets.length + " recorded";
      if ($("fabricUsers")) $("fabricUsers").textContent = state.identities.length + " recorded";
      if ($("fabricEndpoints")) $("fabricEndpoints").textContent = state.endpoints.length + " registered";
      if ($("fabricDiagnostics")) $("fabricDiagnostics").textContent = "No live probes";
      if ($("fabricCompliance")) $("fabricCompliance").textContent = "Not measured";
      $("siteVisual").innerHTML = state.endpoints.length
        ? '<div class="empty">Registered inventory only; no live device status is available.</div>'
        : '<div class="empty">No endpoints registered. Add inventory records to begin.</div>';
      return;

  }

  function uniqueSites() {
    return Array.from(new Set(state.endpoints.map((e) => e.site).filter(Boolean))).sort();
  }

  function setFilterOptions(select, label, values) {
    const previous = select.value;
    const items = [...new Set(values.filter((v) => typeof v === "string" && v.trim()))].sort();
    select.innerHTML = '<option value="">' + esc(label) + '</option>' +
      items.map((v) => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join("");
    select.value = items.includes(previous) ? previous : "";
  }

  function fillEndpointSelect(select, selectedId, includeNetwork = true) {
    if (!select) return;
    const current = selectedId || select.value || currentEndpointId;
    const list = includeNetwork ? state.endpoints : state.endpoints.filter((e) => e.complianceManaged !== false);
    select.innerHTML = list.length
      ? list.map((e) => '<option value="' + esc(e.id) + '">' + esc(e.hostname + " · " + e.ip) + "</option>").join("")
      : '<option value="">No endpoints — add an endpoint first</option>';
    if (list.some((e) => e.id === current)) select.value = current;
    else if (list.length) select.value = list[0].id;
    select.disabled = !list.length;
  }

  function renderEndpoints() {
    const siteFilter = $("endpointSiteFilter");
    setFilterOptions(siteFilter, "All sites", uniqueSites());
    const agentFilter = $("endpointStateFilter");
    const agents = state.endpoints.map((e) => e.agent).filter(Boolean);
    if (agentFilter.value && !agents.includes(agentFilter.value)) agentFilter.value = "";

    const search = $("endpointSearch").value.trim().toLowerCase();
    const site = siteFilter.value;
    const agent = $("endpointStateFilter").value;

    const rows = state.endpoints.filter((e) => {
      const haystack = [e.hostname, e.ip, e.owner, e.site, e.os, e.type].join(" ").toLowerCase();
      return (!search || haystack.includes(search)) && (!site || e.site === site) && (!agent || e.agent === agent);
    });

    $("endpointRows").innerHTML = rows.length ? rows.map((e) => {
      const comp = evaluateEndpoint(e);
      const compBadge = comp.status === "not-applicable" ? badge("N/A", "purple") :
        comp.status === "compliant" ? badge("Compliant", "green") : badge("Needs action", "amber");
      return "<tr>" +
        '<td><span class="cell-title">' + esc(e.hostname) + '</span><span class="cell-sub">' + esc(e.type + " · " + e.model) + "</span></td>" +
        "<td>" + esc(e.ip) + "</td><td>" + esc(e.site) + "</td><td>" + esc(e.owner || "—") + "</td><td>" + esc(e.os) + "</td>" +
        "<td>" + agentBadge(e.agent) + "</td><td>" + compBadge + '</td><td><button class="mini-btn" data-open-endpoint="' + esc(e.id) + '">Open</button></td></tr>';
    }).join("") : '<tr><td colspan="8" class="empty">No endpoints match the current filters.</td></tr>';

    bindOpenEndpointButtons();
  }

  function bindOpenEndpointButtons() {
    qsa("[data-open-endpoint]").forEach((button) => {
      button.onclick = () => openEndpointModal(button.dataset.openEndpoint);
    });
  }

  function showModal(title, bodyHtml, setup) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = bodyHtml;
    $("modalBackdrop").hidden = false;
    if (typeof setup === "function") setup($("modalBody"));
    applyRoleAccess();
  }

  function closeModal() {
    $("modalBackdrop").hidden = true;
    $("modalBody").innerHTML = "";
  }

  $("modalCloseBtn").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", (event) => {
    if (event.target === $("modalBackdrop")) closeModal();
  });

  function updateEndpointRecord(draft, id, input) {
    const record = draft.endpoints.find((e) => e.id === id);
    if (!record) throw new Error("Endpoint no longer exists. Refresh Cloud Data.");
    const text = (value, limit) => { const result=String(value || "").trim(); if(result.length>limit) throw new Error("Inventory field exceeds its maximum length of "+limit+" characters."); return result; };
    const values = {hostname:text(input.hostname,128),ip:text(input.ip,32),site:text(input.site,120),
      type:input.type,owner:text(input.owner,160)||"Unassigned",os:text(input.os,160)||"Unknown",model:text(input.model,160)||"Unknown"};
    if (!values.hostname || !values.site || !validEndpointIp(values.ip)) throw new Error("Hostname, site and an assignable IPv4 address are required.");
    if (!["Workstation","Laptop","Server","Router","Switch","Access Point"].includes(values.type)) throw new Error("Choose a valid endpoint type.");
    if (draft.endpoints.some((e)=>e.id!==id && (e.hostname.toLowerCase()===values.hostname.toLowerCase() || e.ip===values.ip))) throw new Error("Hostname and IPv4 address must be unique.");
    const mappings = draft.ports.filter((p)=>p.switch===record.hostname);
    if (mappings.length && values.type!=="Switch") throw new Error("Remove this switch's port mappings before changing its type.");
    const assigned = draft.assets.filter((a)=>a.endpointId===id && a.status==="Assigned");
    if (assigned.length) {
      const owner = draft.identities.find((u)=>u.id===assigned[0].assignedUserId && u.status==="Active");
      if (!owner) throw new Error("Linked asset has no active owner. Review its assignment first.");
      values.owner = owner.displayName;
    }
    mappings.forEach((p)=>{p.switch=values.hostname;});
    Object.assign(record, values); // Inventory fields only: never accept agent status or telemetry from the form.
    draft.assets.filter((a)=>a.endpointId===id).forEach((a)=>{a.specs=values.model+" · "+values.os;});
    return record;
  }

  function updateAssetEndpoint(draft, assetId, endpointId) {
    const asset = draft.assets.find((a)=>a.id===assetId);
    if (!asset) throw new Error("Asset no longer exists.");
    const endpoint = endpointId ? draft.endpoints.find((e)=>e.id===endpointId) : null;
    if (endpointId && !endpoint) throw new Error("Selected endpoint no longer exists.");
    if (endpointId && endpointId!==asset.endpointId && draft.assets.some((a)=>a.id!==assetId && a.endpointId===endpointId)) throw new Error("This endpoint is already linked to another asset.");
    const previous = draft.endpoints.find((e)=>e.id===asset.endpointId);
    const owner = draft.identities.find((u)=>u.id===asset.assignedUserId);
    if (previous && previous.id!==endpointId && owner && previous.owner===owner.displayName &&
      !draft.assets.some((a)=>a.id!==assetId && a.endpointId===previous.id && a.status==="Assigned")) previous.owner="Unassigned";
    asset.endpointId=endpointId;
    asset.specs=endpoint ? endpoint.model+" · "+endpoint.os : "User-managed asset inventory";
    return endpoint;
  }

  function saveKnowledgeRecord(draft, id, input, stamp) {
    const existing=draft.knowledge.find((k)=>k.id===id);
    if (input.isNew ? !!existing : !existing) throw new Error("Article changed or no longer exists. Refresh Cloud Data.");
    const title=String(input.title||"").trim(),category=String(input.category||"").trim(),
      summary=String(input.summary||"").trim(),content=String(input.content||"").trim();
    if (!title || title.length>160 || !category || category.length>80 || !summary || summary.length>300 || !content || content.length>20000)
      throw new Error("Enter a title (up to 160 characters), category (80), summary (300) and article text (20,000).");
    if (draft.knowledge.some((k)=>k.id!==id && k.title.toLowerCase()===title.toLowerCase())) throw new Error("An article with this title already exists.");
    const article={...existing,id,title,category,summary,content,archived:!!input.archived,
      createdAt:existing?.createdAt||stamp,updatedAt:stamp};
    if(existing)draft.knowledge[draft.knowledge.indexOf(existing)]=article;
    else draft.knowledge.unshift(article);
    return article;
  }

  function openEndpointEdit(id) {
    if (cloudRole==="viewer") return;
    const e=endpointById(id);if(!e)return;
    const assigned=state.assets.some((a)=>a.endpointId===id && a.status==="Assigned");
    const field=(label,key,value)=>'<label class="field"><span>'+label+'</span><input id="'+key+'" value="'+esc(value||"")+'"></label>';
    showModal("Edit Endpoint · "+e.hostname,
      '<div class="form-grid">'+field("Hostname","mEditHost",e.hostname)+field("IPv4 address","mEditIp",e.ip)+field("Site","mEditSite",e.site)+
      '<label class="field"><span>Type</span><select id="mEditType">'+["Workstation","Laptop","Server","Router","Switch","Access Point"].map(t=>'<option'+(t===e.type?' selected':'')+'>'+t+'</option>').join("")+'</select></label>'+
      field("Owner","mEditOwner",e.owner)+field("OS / platform","mEditOs",e.os)+field("Model","mEditModel",e.model)+'</div>'+
      (assigned?'<p class="cell-sub">Owner follows the linked asset assignment. Change it in Assets.</p>':"")+
      '<p id="mEndpointEditError" role="alert" class="cell-sub" hidden></p><div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mEndpointEditSave">Save Endpoint</button></div>',()=>{
        $("mEditOwner").disabled=assigned;
        $("mCancel").onclick=()=>openEndpointModal(id);
        $("mEndpointEditSave").onclick=async()=>{
          const button=$("mEndpointEditSave"),errorBox=$("mEndpointEditError");
          const input={hostname:$("mEditHost").value,ip:$("mEditIp").value,site:$("mEditSite").value,type:$("mEditType").value,
            owner:$("mEditOwner").value,os:$("mEditOs").value,model:$("mEditModel").value};
          button.disabled=true;errorBox.hidden=true;
          try {
            await commitWorkspaceChange(draft=>updateEndpointRecord(draft,id,input));
            audit("Inventory","Endpoint updated",input.hostname,input.ip+" · "+input.site);
            renderAll();openEndpointModal(id);toast("Endpoint saved",input.hostname);
          } catch(error){errorBox.textContent=error.message;errorBox.hidden=false;button.disabled=false;}
        };
      });
  }

  function openEndpointModal(id) {
    const e = endpointById(id);
    if (!e) return;
    currentEndpointId = e.id;
    const comp = evaluateEndpoint(e);
    const failures = comp.failures.length ? comp.failures.map((f) => f.label).join(", ") : "None";
    showModal("Endpoint · " + e.hostname,
      '<div class="endpoint-card"><h3>' + esc(e.hostname) + '</h3><p>' + esc(e.ip + " · " + e.site + " · " + e.type) + '</p>' +
      '<div class="endpoint-meta">' +
      '<div><span>Owner</span><strong>' + esc(e.owner || "—") + '</strong></div>' +
      '<div><span>Agent</span><strong>' + esc(e.agent) + '</strong></div>' +
      '<div><span>OS</span><strong>' + esc(e.os) + '</strong></div>' +
      '<div><span>Model</span><strong>' + esc(e.model) + '</strong></div>' +
      '<div><span>Gateway</span><strong>' + esc(e.gateway || "—") + '</strong></div>' +
      '<div><span>DNS</span><strong>' + esc(e.dns || "—") + '</strong></div>' +
      '<div><span>Compliance</span><strong>' + esc(comp.status) + '</strong></div>' +
      '<div><span>Failures</span><strong>' + esc(failures) + '</strong></div>' +
      '</div></div>' +
      '<div class="modal-actions">' +
      (cloudRole!=="viewer"?'<button class="btn secondary" id="mEndpointEdit">Edit Endpoint</button>':"") +
      '<button class="btn secondary" data-modal-page="documentation">Documentation</button>' +
      '<button class="btn secondary" data-modal-page="compliance">Compliance</button>' +
      '<button class="btn secondary" data-modal-page="remote">Remote Support</button>' +
      '<button class="btn primary" data-modal-page="troubleshooting">Troubleshoot</button>' +
      '</div>',
      (root) => {
        if($("mEndpointEdit"))$("mEndpointEdit").onclick=()=>openEndpointEdit(id);
        qsa("[data-modal-page]", root).forEach((button) => button.addEventListener("click", () => {
          closeModal();
          openPage(button.dataset.modalPage);
          if (button.dataset.modalPage === "troubleshooting") {
            $("diagEndpoint").value = e.id;
            currentEndpointId = e.id;
          }
          if (button.dataset.modalPage === "remote") {
            $("remoteEndpoint").value = e.id;
            currentEndpointId = e.id;
            renderRemote();
          }
        }));
      }
    );
  }

  $("endpointSearch").addEventListener("input", renderEndpoints);
  $("endpointSiteFilter").addEventListener("change", renderEndpoints);
  $("endpointStateFilter").addEventListener("change", renderEndpoints);

  $("addEndpointBtn").addEventListener("click", () => {
    const sites = uniqueSites();
    showModal("Add Endpoint",
      '<div class="form-grid">' +
      '<label class="field"><span>Hostname</span><input id="mHostname" required placeholder="HQ-WS-05"></label>' +
      '<label class="field"><span>IPv4 address</span><input id="mIp" type="text" inputmode="decimal" required autocomplete="off" spellcheck="false" aria-describedby="mIpHint" placeholder="10.20.10.50"></label>' +
      '<label class="field"><span>Site</span><input id="mSite" list="siteList" required placeholder="HQ"><datalist id="siteList">' + sites.map((s) => '<option value="' + esc(s) + '"></option>').join("") + '</datalist></label>' +
      '<label class="field"><span>Type</span><select id="mType"><option>Workstation</option><option>Laptop</option><option>Server</option><option>Router</option><option>Switch</option><option>Access Point</option></select></label>' +
      '<label class="field"><span>Owner</span><input id="mOwner" placeholder="Department / user"></label>' +
      '<label class="field"><span>OS / platform</span><input id="mOs" placeholder="Windows 11 24H2"></label>' +
      '<label class="field"><span>Model</span><input id="mModel" placeholder="Dell OptiPlex"></label>' +
      '<label class="field"><span>Agent</span><select id="mAgent"'+((' disabled'))+'>'+
      '<option value="unverified">Not connected — requires an authorized endpoint agent</option>'+
      '</select></label>' +
      '</div><p id="mIpHint" class="cell-sub" aria-live="polite" hidden></p><div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Add Endpoint</button></div>',
      (root) => {
        $("mCancel").onclick = closeModal;
        const updateIpValidity = () => {
          const value = $("mIp").value.trim();
          const valid = validEndpointIp(value);
          $("mIp").setCustomValidity(valid ? "" : "An assignable, canonical IPv4 address is required.");
          $("mIp").setAttribute("aria-invalid", value && !valid ? "true" : "false");
          $("mIpHint").hidden = !value || valid;
          $("mIpHint").textContent = value && !valid
            ? "Invalid or non-assignable IPv4 address. Check range, octets and leading zeros."
            : "";
          $("mSave").disabled = !valid || !$("mHostname").value.trim() || !$("mSite").value.trim() || (cloudRole === "viewer");
        };
        ["mIp","mHostname","mSite"].forEach((id) => $(id).addEventListener("input", updateIpValidity));
        updateIpValidity();
        $("mSave").onclick = async () => {
          const hostname = $("mHostname").value.trim();
          const ip = $("mIp").value.trim();
          const site = $("mSite").value.trim();
          if (!hostname || !validEndpointIp(ip) || !site) {
            toast("Invalid endpoint", "Hostname, site, and a canonical assignable IPv4 address are required.");
            updateIpValidity();
            return;
          }
          if (state.endpoints.some((e) => e.hostname.toLowerCase() === hostname.toLowerCase() || e.ip === ip)) {
            toast("Duplicate endpoint", "Hostname and IP address must be unique.");
            return;
          }
          const type = $("mType").value;
          const managed = ["Workstation", "Laptop", "Server"].includes(type);
          const endpoint = {
            id: uid(managed ? "EP" : "NET"), hostname, ip, mac: "—", site, type,
            os: $("mOs").value.trim() || "Unknown", model: $("mModel").value.trim() || "Unknown",
            owner: $("mOwner").value.trim() || "Unassigned",
            agent: "unverified",
            lastSeen: null, gateway: "", dns: "",
            updatesMissing: null, av: "unknown",
            firewall: null, bitlocker: null,
            rebootAge: null,
            cpu: null, memory: null, disk: null,
            complianceManaged: false, issue: "unknown"
          };
          const button = $("mSave");
          button.disabled = true;

            // Only show "Endpoint added" once Supabase has accepted the record.
            try {
              showSaveStatus("Validating endpoint in Supabase...");
              if (cloudSavePending) {
                clearTimeout(cloudSaveTimer);
                cloudSavePending = false;
                cloudSaveTimer = null;
                await cloudSavePromise;
                await window.OpsFusionCloud.saveWorkspace(state);
              } else {
                await cloudSavePromise;
              }
              const proposed = { ...state, endpoints: [...state.endpoints, endpoint],
                meta: { ...state.meta, updatedAt: now() } };
              await window.OpsFusionCloud.saveWorkspace(proposed);
              state = proposed;
              showSaveStatus("Saved to Supabase");
            } catch (error) {
              showSaveStatus("Endpoint rejected or not saved", true);
              toast("Endpoint not saved", error.message || "Supabase rejected this endpoint. Check the IPv4 address.");
              updateIpValidity();
              return;
            }

          currentEndpointId = endpoint.id;
          audit("Inventory", "Endpoint added", endpoint.hostname, endpoint.ip + " · " + endpoint.site);
          saveState();
          closeModal();
          renderAll();
          toast("Endpoint added", endpoint.hostname);
        };
      }
    );
  });

  function renderAssets() {
    const statusFilter = $("assetStatusFilter");
    const typeFilter = $("assetTypeFilter");
    setFilterOptions(statusFilter, "All lifecycle states", state.assets.map((a) => a.status));
    setFilterOptions(typeFilter, "All asset types", state.assets.map((a) => a.type));

    const search = $("assetSearch").value.trim().toLowerCase();
    const rows = state.assets.filter((a) => {
      const user = identityById(a.assignedUserId);
      const hay = [a.tag,a.hostname,a.serial,a.type,a.status,a.department,a.location,user ? user.displayName : ""].join(" ").toLowerCase();
      return (!search || hay.includes(search)) && (!statusFilter.value || a.status === statusFilter.value) && (!typeFilter.value || a.type === typeFilter.value);
    });

    $("assetTotal").textContent = state.assets.length;
    $("assetAssigned").textContent = state.assets.filter((a) => a.status === "Assigned").length;
    $("assetAvailable").textContent = state.assets.filter((a) => a.status === "Available").length;
    $("assetRepair").textContent = state.assets.filter((a) => a.status === "In Repair").length;
    $("assetWarrantyRisk").textContent = state.assets.filter((a) => {
      const w = warrantyInfo(a); return w.days !== null && w.days <= 45;
    }).length;

    $("assetRows").innerHTML = rows.length ? rows.map((a) => {
      const user = identityById(a.assignedUserId);
      const endpoint = endpointById(a.endpointId);
      const w = warrantyInfo(a);
      const statusTone = a.status === "Assigned" ? "green" : a.status === "Available" ? "blue" : a.status === "In Repair" ? "amber" : "purple";
      return "<tr>" +
        '<td><span class="cell-title">' + esc(a.tag + " · " + a.hostname) + '</span><span class="cell-sub">' + esc(a.serial) + "</span></td>" +
        "<td>" + esc(a.type) + "</td><td>" + badge(a.status,statusTone) + "</td><td>" + esc(user ? user.displayName : "Unassigned") + "</td>" +
        "<td>" + esc(endpoint ? endpoint.hostname : "Not linked") + "</td><td>" + esc(a.location) + "</td><td>" + badge(w.label,w.tone) + '</td>' +
        '<td><button class="mini-btn" data-open-asset="' + esc(a.id) + '">Open</button></td></tr>';
    }).join("") : '<tr><td colspan="8" class="empty">No assets match the current filters.</td></tr>';

    const openMaintenance = state.maintenance.filter((m) => !["Completed","Closed","Cancelled"].includes(m.status));
    $("maintenanceRows").innerHTML = openMaintenance.length ? openMaintenance.map((m) => {
      const asset = assetById(m.assetId);
      return '<div class="stack-row"><div><strong>' + esc(m.type + " · " + (asset ? asset.tag : m.assetId)) +
        '</strong><small>' + esc(m.detail + " · Owner " + m.owner + " · Due " + m.dueDate) +
        '</small></div><div>' + badge(m.status,m.status === "In Progress" ? "amber" : "blue") +
        ' <button class="mini-btn" data-maint-complete="' + esc(m.id) + '">Complete</button></div></div>';
    }).join("") : '<div class="empty">No open maintenance records.</div>';

    const softwareByAsset = {};
    state.software.forEach((s) => {
      if (!softwareByAsset[s.assetId]) softwareByAsset[s.assetId] = [];
      softwareByAsset[s.assetId].push(s);
    });
    $("softwareRows").innerHTML = Object.keys(softwareByAsset).length ? Object.entries(softwareByAsset).slice(0,10).map(([assetId, items]) => {
      const asset = assetById(assetId);
      const review = items.some((i) => i.status === "Review");
      return '<div class="stack-row"><div><strong>' + esc(asset ? asset.tag + " · " + asset.hostname : assetId) +
        '</strong><small>' + esc(items.map((i) => i.name + " " + i.version).join(" · ")) +
        '</small></div>' + badge(review ? "Review" : "Healthy",review ? "amber" : "green") + '</div>';
    }).join("") : '<div class="empty">No software inventory records.</div>';

    qsa("[data-open-asset]").forEach((b) => b.onclick = () => openAssetModal(b.dataset.openAsset));
    qsa("[data-maint-complete]").forEach((b) => b.onclick = async () => {
      const taskId = b.dataset.maintComplete;
      const task = state.maintenance.find((m) => m.id === taskId);
      if (!task || cloudRole === "viewer") return;
      b.disabled = true;
      try {
        await commitWorkspaceChange((draft) => {
          const next = draft.maintenance.find((m) => m.id === taskId);
          if (!next || ["Completed","Closed","Cancelled"].includes(next.status)) {
            throw new Error("Maintenance task is already closed or missing.");
          }
          next.status = "Completed";
          next.completedAt = now();
        });
        audit("Assets","Maintenance completed",task.id,task.detail);
        renderAssets();
        toast("Maintenance completed",task.type);
      } catch(error) {
        toast("Maintenance not saved",error.message || "Cloud save failed.");
        b.disabled = false;
      }
    });
  }

  function openAssetModal(id) {
    const asset = assetById(id);
    if (!asset) return;
    const w = warrantyInfo(asset);
    const endpoint = endpointById(asset.endpointId);
    const user = identityById(asset.assignedUserId);
    showModal("Asset · " + asset.tag,
      '<div class="endpoint-card"><h3>' + esc(asset.tag + " · " + asset.hostname) + '</h3><p>' + esc(asset.type + " · " + asset.serial) + '</p>' +
      '<div class="endpoint-meta"><div><span>Assigned to</span><strong>' + esc(user ? user.displayName : "Unassigned") + '</strong></div>' +
      '<div><span>Endpoint</span><strong>' + esc(endpoint ? endpoint.hostname : "Not linked") + '</strong></div>' +
      '<div><span>Department</span><strong>' + esc(asset.department) + '</strong></div><div><span>Location</span><strong>' + esc(asset.location) + '</strong></div>' +
      '<div><span>Warranty</span><strong>' + esc(w.label) + '</strong></div><div><span>Specs</span><strong>' + esc(asset.specs) + '</strong></div></div></div>' +
      '<div class="form-grid"><label class="field"><span>Lifecycle status</span><select id="mAssetStatus">' +
      ["Assigned","Available","In Repair","Retired","Lost"].map((s) => '<option' + (s===asset.status ? " selected" : "") + '>' + s + '</option>').join("") +
      '</select></label><label class="field"><span>Assigned user</span><select id="mAssetUser"><option value="">' +
      (state.identities.some((u)=>u.status==="Active") ? "Choose an active identity" : "No active identities — add one in Identity & Access") +
      '</option>' +
      state.identities.filter((u) => u.status === "Active").map((u) => '<option value="' + esc(u.id) + '"' + (u.id===asset.assignedUserId ? " selected" : "") + '>' + esc(u.displayName) + '</option>').join("") +
      '</select></label><label class="field span-2"><span>Link endpoint</span><select id="mAssetLinkEndpoint"><option value="">No endpoint</option>'+
      state.endpoints.map(e=>'<option value="'+esc(e.id)+'"'+(e.id===asset.endpointId?' selected':'')+'>'+esc(e.hostname)+'</option>').join("")+
      '</select></label></div><div class="modal-actions"><button class="btn secondary" id="mAssetTicket">Create Ticket</button><button class="btn primary" id="mAssetSave">Save Asset</button></div>',
      () => {
        const updateAssignment = () => {
          const assigning = $("mAssetStatus").value === "Assigned";
          const hasActive = state.identities.some((u) => u.status === "Active");
          $("mAssetUser").disabled = !assigning || !hasActive;

        };
        $("mAssetStatus").addEventListener("change", updateAssignment);
        updateAssignment();
        $("mAssetSave").onclick = async () => {
          const selectedStatus = $("mAssetStatus").value;
          const selectedUser = selectedStatus === "Assigned" ? $("mAssetUser").value : "";
          const selectedEndpoint = $("mAssetLinkEndpoint").value;
          const owner = selectedUser ? identityById(selectedUser) : null;
          if (selectedStatus === "Assigned" && (!owner || owner.status !== "Active")) {
            toast("Assignment required", "Choose an active identity record before assigning the asset.");
            return;
          }
          const oldStatus = asset.status;
          const button = $("mAssetSave");
          button.disabled = true;
          try {
            await commitWorkspaceChange((draft) => {
              const item = draft.assets.find((a) => a.id === id);
              if (!item) throw new Error("Asset was not found. Refresh Cloud Data.");
              updateAssetEndpoint(draft,id,selectedEndpoint);
              item.status = selectedStatus;
              item.assignedUserId = selectedUser;
              const endpoint = draft.endpoints.find((e) => e.id === item.endpointId);
              if (endpoint) endpoint.owner = owner ? owner.displayName : "Unassigned";
            });
            audit("Assets", "Asset updated", asset.tag, oldStatus + " → " + selectedStatus +
              (owner ? " · " + owner.displayName : "")+" · endpoint "+(selectedEndpoint||"Not linked"));
            closeModal(); renderAssets(); renderEndpoints(); renderIdentity(); renderOverview();
            toast("Asset updated", asset.tag);
          } catch (error) {
            toast("Asset not saved", error.message || "Unable to save asset lifecycle change.");
            button.disabled = false;
          }
        };
        $("mAssetTicket").onclick = async () => {
          const button=$("mAssetTicket");
          const input={type:"Incident",assetId:asset.id,endpointId:asset.endpointId,
            requesterId:asset.assignedUserId,title:"Asset support required: " + asset.tag + " · " + asset.hostname,
            category:"Hardware / Asset",impact:"Medium",urgency:"Medium",source:"Asset Management"};
          button.disabled=true;
          try {
            await commitNewTicket(input);
            closeModal();
            toast("Ticket created",asset.tag);
          } catch(error) {
            button.disabled=false;
            toast("Ticket not saved",error.message||"Unable to save ticket.");
          }
        };
      }
    );
  }

  $("assetSearch").addEventListener("input",renderAssets);
  $("assetStatusFilter").addEventListener("change",renderAssets);
  $("assetTypeFilter").addEventListener("change",renderAssets);

  $("addAssetBtn").addEventListener("click",() => {
    showModal("Add Asset",
      '<div class="form-grid"><label class="field"><span>Asset tag</span><input id="mAssetTag" placeholder="AST-1010"></label>' +
      '<label class="field"><span>Hostname / name</span><input id="mAssetHost" placeholder="HQ-LT-010"></label>' +
      '<label class="field"><span>Type</span><select id="mAssetType"><option>Laptop</option><option>Workstation</option><option>Server</option><option>Printer</option><option>Switch</option><option>Router</option><option>Access Point</option></select></label>' +
      '<label class="field"><span>Serial</span><input id="mAssetSerial"></label>' +
      '<label class="field"><span>Location</span><input id="mAssetLocation" placeholder="HQ · IT Stockroom"></label>' +
      '<label class="field"><span>Department</span><input id="mAssetDepartment" placeholder="IT"></label>' +
      '<label class="field"><span>Warranty expiry</span><input id="mAssetWarranty" type="date"></label>' +
      '<label class="field"><span>Link endpoint</span><select id="mAssetEndpoint"><option value="">No endpoint</option>' + state.endpoints.map((e) => '<option value="' + esc(e.id) + '">' + esc(e.hostname) + '</option>').join("") + '</select></label>' +
      '</div><div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Add Asset</button></div>',
      () => {
        $("mCancel").onclick=closeModal;
        $("mSave").onclick = async () => {
          const tag = $("mAssetTag").value.trim();
          const host = $("mAssetHost").value.trim();
          if (!tag || !host) { toast("Missing details", "Asset tag and hostname/name are required."); return; }
          if (state.assets.some((a) => String(a.tag).toLowerCase() === tag.toLowerCase())) {
            toast("Duplicate tag", tag);
            return;
          }
          const endpointId = $("mAssetEndpoint").value;
          const ep = endpointById(endpointId);
          if (endpointId && !ep) { toast("Invalid endpoint", "Choose a saved endpoint or No endpoint."); return; }
          const record = {id:tag,tag,hostname:host,type:$("mAssetType").value,
            serial:$("mAssetSerial").value.trim()||"—",status:"Available",assignedUserId:"",endpointId,
            department:$("mAssetDepartment").value.trim()||"IT",
            location:$("mAssetLocation").value.trim()||"Unspecified",
            purchaseDate:new Date().toISOString().slice(0,10),
            warrantyExpiry:$("mAssetWarranty").value,
            specs:ep ? ep.model+" · "+ep.os : "User-managed asset inventory"};
          const button = $("mSave");
          button.disabled = true;
          try {
            await commitWorkspaceChange((draft) => {
              if (draft.assets.some((a) => String(a.tag).toLowerCase() === tag.toLowerCase())) {
                throw new Error("Asset tag already exists.");
              }
              draft.assets.push(record);
            });
            audit("Assets", "Asset added", tag, host + (ep ? " · linked to "+ep.hostname : ""));
            closeModal(); renderAssets(); renderOverview();
            toast("Asset added", tag);
          } catch (error) {
            toast("Asset not saved", error.message || "Unable to save asset.");
            button.disabled = false;
          }
        };
      }
    );
  });

  $("addMaintenanceTaskBtn").addEventListener("click", () => {
    if (cloudRole === "viewer") return;
    if (!state.assets.length) {
      toast("Asset required", "Add an asset before scheduling maintenance.");
      return;
    }
    showModal("Schedule Asset Maintenance",
      '<div class="form-grid">'+
      '<label class="field"><span>Asset</span><select id="mMaintAsset">' +
      state.assets.map((a)=>'<option value="'+esc(a.id)+'">'+esc(a.tag+" · "+a.hostname)+'</option>').join("")+
      '</select></label>'+
      '<label class="field"><span>Maintenance type</span><select id="mMaintType"><option>Routine Inspection</option><option>Hardware Repair</option><option>Patch Review</option><option>Warranty Claim</option></select></label>'+
      '<label class="field"><span>Due date</span><input id="mMaintDue" type="date" required></label>'+
      '<label class="field"><span>Owner / Technician</span><input id="mMaintOwner" placeholder="IT Support"></label>'+
      '<label class="field span-2"><span>Work details</span><textarea id="mMaintDetail" placeholder="Explain the scheduled maintenance task"></textarea></label>'+
      '</div><div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Schedule Maintenance</button></div>',
      () => {
        $("mCancel").onclick=closeModal;
        $("mSave").onclick = async () => {
          const assetId=$("mMaintAsset").value;
          const dueDate=$("mMaintDue").value;
          const detail=$("mMaintDetail").value.trim();
          if (!assetById(assetId) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !detail) {
            toast("Missing maintenance details","Choose an asset, a due date and work details.");
            return;
          }
          const task={id:uid("MNT"),assetId,type:$("mMaintType").value,
            detail,owner:$("mMaintOwner").value.trim()||"IT Support",dueDate,
            status:"Open",createdAt:now()};
          const button=$("mSave");
          button.disabled=true;
          try {
            await commitWorkspaceChange((draft) => {
              if (!draft.assets.some((a) => a.id === assetId)) {
                throw new Error("Linked asset is no longer available.");
              }
              draft.maintenance.unshift(task);
            });
            audit("Assets","Maintenance scheduled",task.id,assetId+" · "+detail);
            closeModal();renderAssets();
            toast("Maintenance scheduled",task.id);
          } catch(error) {
            toast("Maintenance not saved",error.message || "Unable to schedule maintenance.");
            button.disabled=false;
          }
        };
      });
  });

  window.OpsFusionFlushSaves = async () => {
    if (!window.OpsFusionCloud?.isCloudActive?.()) throw new Error("Sign in to Cloud Workspace.");
    if (cloudSavePending) {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer=null;
      cloudSavePending=false;
      await cloudSavePromise;
      await window.OpsFusionCloud.saveWorkspace(state);
      showSaveStatus("Saved to Supabase");
    } else {
      await cloudSavePromise;
    }
  };

  function identityAccountEmail(identity) {
    return window.OpsFusionEmployeeAccounts?.emailFor(identity.id) || "";
  }

  window.addEventListener("opsfusion:employee-access-updated", () => renderIdentity());

  function renderIdentity() {
    const sf=$("identityStatusFilter"), df=$("identityDepartmentFilter");
    setFilterOptions(sf,"All identity states",state.identities.map((u)=>u.status));
    setFilterOptions(df,"All departments",state.identities.map((u)=>u.department));
    const q=$("identitySearch").value.trim().toLowerCase();
    const rows=state.identities.filter((u)=>{
      const hay=[u.displayName,identityAccountEmail(u),u.department,u.title,u.manager].join(" ").toLowerCase();
      return(!q||hay.includes(q))&&(!sf.value||u.status===sf.value)&&(!df.value||u.department===df.value);
    });
    $("idUsers").textContent=state.identities.length;
    $("idActive").textContent=state.identities.filter((u)=>u.status==="Active").length;
    $("idDisabled").textContent=state.identities.filter((u)=>u.status==="Disabled").length;
    $("idExpiring").textContent=state.identities.filter(expiringIdentity).length;
    $("idPrivileged").textContent=state.identities.filter((u)=>(u.groups||[]).includes("GRP-ADMIN")).length;
    $("identityRows").innerHTML=rows.length?rows.map((u)=>{
      const tpl=templateById(u.templateId);
      const assets=state.assets.filter((a)=>a.assignedUserId===u.id);
      const tone=u.status==="Active"?"green":u.status==="Disabled"?"red":u.status==="Offboarded"?"purple":"amber";
      return "<tr><td><span class=\"cell-title\">"+esc(u.displayName)+"</span><span class=\"cell-sub\">"+esc(identityAccountEmail(u) || "No linked portal account")+"</span></td>"+
        "<td>"+esc(u.department)+"</td><td>"+esc(u.title)+"</td><td>"+badge(u.status,tone)+"</td><td>"+esc(tpl?tpl.name:"Custom")+"</td><td>"+esc((u.groups||[]).length)+"</td><td>"+esc(assets.length)+"</td>"+
        '<td><button class="mini-btn" data-open-identity="'+esc(u.id)+'">Open</button></td></tr>';
    }).join(""):'<tr><td colspan="8" class="empty">No identities match the current filters.</td></tr>';
    $("templateRows").innerHTML=state.templates.map((t)=>'<div class="stack-row"><div><strong>'+esc(t.name)+'</strong><small>'+esc(t.department+" · "+t.description)+'</small></div>'+badge(t.groups.length+" groups","blue")+'</div>').join("");
    $("groupRows").innerHTML=state.groups.map((g)=>{
      const members=state.identities.filter((u)=>(u.groups||[]).includes(g.id)&&u.status!=="Offboarded").length;
      return '<div class="stack-row"><div><strong>'+esc(g.name)+'</strong><small>'+esc(g.permission+" · Owner "+g.owner)+'</small></div>'+badge(members+" members · "+g.risk,g.risk==="High"?"red":g.risk==="Medium"?"amber":"green")+'</div>';
    }).join("");
    qsa("[data-open-identity]").forEach((b)=>b.onclick=()=>openIdentityModal(b.dataset.openIdentity));
  }

  function releaseIdentityAssets(draft, identityId) {
    let count=0;
    draft.assets.forEach((asset)=>{
      if(asset.assignedUserId!==identityId)return;
      asset.assignedUserId="";
      asset.status="Available";
      const endpoint=draft.endpoints.find((e)=>e.id===asset.endpointId);
      if(endpoint)endpoint.owner="Unassigned";
      count++;
    });
    return count;
  }

  function openIdentityModal(id) {
    const user=identityById(id);if(!user)return;
    const tpl=templateById(user.templateId);
    const assets=state.assets.filter((item)=>item.assignedUserId===user.id);
    const groups=(user.groups||[]).map(groupById).filter(Boolean);
    showModal("Identity · "+user.displayName,
      '<div class="endpoint-card"><h3>'+esc(user.displayName)+'</h3><p>'+esc([identityAccountEmail(user),user.title].filter(Boolean).join(" · "))+'</p><div class="endpoint-meta">'+
      '<div><span>Status</span><strong>'+esc(user.status)+'</strong></div><div><span>Department</span><strong>'+esc(user.department)+'</strong></div>'+
      '<div><span>Template</span><strong>'+esc(tpl?tpl.name:"Custom")+'</strong></div><div><span>Manager</span><strong>'+esc(user.manager||"—")+'</strong></div>'+
      '<div><span>Groups</span><strong>'+esc(groups.map((g)=>g.name).join(", ")||"None")+'</strong></div><div><span>Assigned assets</span><strong>'+esc(assets.map((a)=>a.tag).join(", ")||"None")+'</strong></div></div></div>'+
      '<p class="cell-sub">These actions update this workspace identity record only. They do not disable a Supabase Auth account or reset an external password.</p>'+
      '<div class="modal-actions"><button class="btn secondary" id="mIdPassword">Flag Credential Review</button>'+
      '<button class="btn secondary" id="mIdToggle">'+(user.enabled?"Disable":"Enable")+' Workspace Identity</button>'+
      (user.status!=="Offboarded"?'<button class="btn danger" id="mIdOffboard">Offboard Record</button>':"")+'</div>',
      ()=>{
        $("mIdPassword").onclick=async()=>{
          const button=$("mIdPassword");button.disabled=true;
          try{
            await commitWorkspaceChange((draft)=>{
              const record=draft.identities.find((u)=>u.id===id);
              if(!record)throw new Error("Identity record not found.");
              record.mustResetPassword=true;
            });
            audit("Identity","Credential review flagged",user.displayName,"Workspace reminder only; no real account password was changed.");
            closeModal();renderIdentity();toast("Credential review flagged",user.displayName);
          }catch(error){button.disabled=false;toast("Identity not saved",error.message);}
        };
        $("mIdToggle").onclick=async()=>{
          const button=$("mIdToggle");button.disabled=true;
          let released=0;
          try{
            await commitWorkspaceChange((draft)=>{
              const record=draft.identities.find((u)=>u.id===id);
              if(!record || record.status==="Offboarded")throw new Error("Offboarded identities cannot be reenabled.");
              const enable=!record.enabled;
              record.enabled=enable;
              record.status=enable?"Active":"Disabled";
              if(!enable) released=releaseIdentityAssets(draft,id);
            });
            audit("Identity",user.enabled?"Identity disabled":"Identity enabled",user.displayName,
              user.displayName+" · "+released+" asset(s) released");
            closeModal();renderIdentity();renderAssets();renderEndpoints();renderOverview();renderIncidents();
            toast("Workspace identity updated",user.displayName+(released?" · "+released+" asset(s) released":""));
          }catch(error){button.disabled=false;toast("Identity not saved",error.message);}
        };
        if($("mIdOffboard"))$("mIdOffboard").onclick=()=>offboardIdentity(user);
      }
    );
  }

  async function offboardIdentity(user) {
    if(!confirm("Offboard "+user.displayName+" in the workspace and release assigned assets? This does not disable an external login."))return;
    const button=$("mIdOffboard");if(button)button.disabled=true;
    let released=0;
    try{
      await commitWorkspaceChange((draft)=>{
        const record=draft.identities.find((item)=>item.id===user.id);
        if(!record || record.status==="Offboarded")throw new Error("Identity already offboarded or missing.");
        released=releaseIdentityAssets(draft,user.id);
        record.enabled=false;record.status="Offboarded";record.groups=[];record.mustResetPassword=false;
        if(released){
          const ticket=buildTicketForDraft(draft,{type:"Service Request",
            title:"Validate returned assets for "+record.displayName,category:"Offboarding",
            impact:"Low",urgency:"Medium",source:"Identity",
            description:"Review "+released+" asset(s) released after workspace identity offboarding."});
          draft.incidents.unshift(ticket);
        }
      });
      audit("Identity","Identity record offboarded",user.displayName,
        user.displayName+" · "+released+" asset(s) released. External directory not connected.");
      closeModal();renderIdentity();renderAssets();renderEndpoints();renderIncidents();renderOverview();
      toast("Workspace identity offboarded",user.displayName);
    }catch(error){if(button)button.disabled=false;toast("Offboarding not saved",error.message);}
  }

  $("identitySearch").addEventListener("input",renderIdentity);
  $("identityStatusFilter").addEventListener("change",renderIdentity);
  $("identityDepartmentFilter").addEventListener("change",renderIdentity);

  $("provisionUserBtn").addEventListener("click",()=>{
    showModal("Add Identity Record (workspace only)",
      '<div class="form-grid"><label class="field"><span>First name</span><input id="mIdFirst"></label><label class="field"><span>Last name</span><input id="mIdLast"></label>'+
      '<label class="field"><span>Role template</span><select id="mIdTemplate" required><option value="" selected disabled>Select a role template</option>'+
      availableRoleTemplates().map((t)=>'<option value="'+esc(t.id)+'">'+esc(t.name+" · "+t.department)+'</option>').join("")+
      '</select></label>'+
      '<label class="field"><span>Job title</span><input id="mIdTitle" placeholder="Analyst"></label><label class="field"><span>Manager</span><input id="mIdManager"></label>'+
      '<label class="field"><span>Expiry (optional)</span><input id="mIdExpiry" type="date"></label></div>'+
      '<div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Add Identity Record</button></div>',
      ()=>{
        $("mCancel").onclick=closeModal;
        const updateIdentityForm = () => {
          const tpl = templateById($("mIdTemplate").value);

          $("mSave").disabled = cloudRole === "viewer" || !tpl ||
            !$("mIdFirst").value.trim() || !$("mIdLast").value.trim();
        };
        ["mIdFirst","mIdLast","mIdTemplate"].forEach((key) =>
          $(key).addEventListener(key === "mIdTemplate" ? "change" : "input", updateIdentityForm));
        updateIdentityForm();
        $("mSave").onclick=async()=>{
          const first=$("mIdFirst").value.trim(),last=$("mIdLast").value.trim(),tpl=templateById($("mIdTemplate").value);
          if(!first||!last||!tpl){toast("Missing details","First name, last name, and template are required.");return;}
          const user={id:uid("USR"),firstName:first,lastName:last,displayName:first+" "+last,username:"",upn:"",department:tpl.department==="Corporate"?"General":tpl.department,title:$("mIdTitle").value.trim()||"Employee",manager:$("mIdManager").value.trim()||"Unassigned",status:"Active",enabled:true,templateId:tpl.id,groups:[...tpl.groups],expiry:$("mIdExpiry").value,mustResetPassword:false,createdAt:now()};
          const button=$("mSave");
          button.disabled=true;
          try {
            await commitWorkspaceChange((draft) => {
              draft.templates = availableRoleTemplates().map((t) => ({
                ...t, groups: Array.isArray(t.groups) ? t.groups : []
              }));
              draft.identities.push(user);
              const review=buildTicketForDraft(draft,{type:"Service Request",requesterId:user.id,
                title:"Review new identity record: "+user.displayName,category:"Onboarding",
                impact:"Low",urgency:"Medium",source:"Identity",
                description:"Confirm organizational approvals and external directory actions separately."});
              draft.incidents.unshift(review);
            });
            audit("Identity","Identity record created",user.displayName,user.displayName+" · "+tpl.name);
            closeModal();renderIdentity();renderIncidents();renderOverview();
            toast("Identity record saved",user.displayName+" · Link a confirmed portal account in Settings.");
          } catch(error) {
            toast("Identity not saved",error.message||"Unable to save identity record.");
            button.disabled=false;
          }
        };
      }
    );
  });

  function renderTroubleshooting() {

      $("diagTerminal").textContent = "Live diagnostics unavailable: no authorized endpoint agent is connected. Saved inventory is not proof of network reachability.";

    fillEndpointSelect($("diagEndpoint"), null, true);
    if ($("diagEndpoint").value) currentEndpointId = $("diagEndpoint").value;
    renderDiagnosticSummary();
  }

  $("diagEndpoint").addEventListener("change", () => {
    currentEndpointId = $("diagEndpoint").value;
  });

  function runDiagnostic() {

      $("diagTerminal").textContent = "No live diagnostic agent is connected. This cloud workspace does not generate simulated ping, DNS, port or route results.";
      toast("Diagnostics unavailable", "Connect an authorized backend before running real probes.");
      return;

  }

  $("runDiagBtn").addEventListener("click", runDiagnostic);

  function renderDiagnosticSummary() {
    const record = selectedDiagnosticId ? state.diagnostics.find((d) => d.id === selectedDiagnosticId) : state.diagnostics[0];
    if (!record) {
      $("diagSummary").className = "detail-empty";
      $("diagSummary").textContent = "No diagnostic selected yet.";
      $("diagCreateIncidentBtn").disabled = true;
      $("diagOpenEndpointBtn").disabled = true;
      return;
    }
    selectedDiagnosticId = record.id;
    const endpoint = endpointById(record.endpointId);
    $("diagSummary").className = "diag-card";
    $("diagSummary").innerHTML =
      "<h4>" + esc((endpoint ? endpoint.hostname : record.endpointId) + " · " + record.status.toUpperCase()) + "</h4>" +
      "<p>" + esc(record.summary) + "</p>" +
      '<div class="diag-lines">' +
      record.results.map((r) => '<div class="diag-line"><span>' + esc(r.name) + '</span>' + badge(r.pass ? "Pass" : "Fail", r.pass ? "green" : "red") + "</div>").join("") +
      "</div>";
    $("diagCreateIncidentBtn").disabled = false;
    $("diagOpenEndpointBtn").disabled = !endpoint;
  }

  $("diagCreateIncidentBtn").addEventListener("click", async () => {
    const record = state.diagnostics.find((d) => d.id === selectedDiagnosticId);
    if (!record) return;
    const button = $("diagCreateIncidentBtn");
    button.disabled = true;
    try {
      const ticket = await commitNewTicket({
        endpointId: record.endpointId,
        title: "Diagnostic follow-up: " + record.summary,
        description: record.summary,
        source: "Troubleshooting"
      });
      toast("Incident created", ticket.id);
    } catch (error) {
      toast("Incident not saved", error.message || "Unable to save ticket.");
    } finally {
      renderDiagnosticSummary();
      applyRoleAccess();
    }
  });

  $("diagOpenEndpointBtn").addEventListener("click", () => {
    const record = state.diagnostics.find((d) => d.id === selectedDiagnosticId);
    if (record) openEndpointModal(record.endpointId);
  });

  function ipToInt(ip) {
    return ip.split(".").reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0) >>> 0;
  }

  function intToIp(value) {
    return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
  }

  function validIp(ip) {
    const parts = String(ip || "").split(".");
    return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
  }

  // A documented CIDR network may contain reserved addresses; a managed endpoint
  // must instead have a canonical unicast host address. Keep these distinct.
  function validEndpointIp(ip) {
    if (!validIp(ip)) return false;
    const parts = String(ip).split(".");
    // Exact string matching and canonicalization agree with the database.
    if (parts.some((part) => part.length > 1 && part[0] === "0")) return false;
    const [a, b, c] = parts.map(Number);
    // No unspecified, loopback, CGNAT, link-local, test, documentation,
    // multicast or reserved ranges for a managed endpoint record.
    if (a === 0 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 192 && ((b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) return false;
    if (a === 198 && ((b === 18 || b === 19) || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  function calculateCidr(value) {
    const parts = String(value || "").trim().split("/");
    const ip = parts[0];
    const prefix = Number(parts[1]);
    if (!validIp(ip) || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error("Enter a valid IPv4 CIDR, e.g. 192.168.10.25/24.");
    const ipInt = ipToInt(ip);
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (ipInt & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const total = Math.pow(2, 32 - prefix);
    const usable = prefix >= 31 ? total : Math.max(0, total - 2);
    const first = prefix >= 31 ? network : network + 1;
    const last = prefix >= 31 ? broadcast : broadcast - 1;
    return {
      network: intToIp(network) + "/" + prefix,
      mask: intToIp(mask),
      broadcast: intToIp(broadcast),
      usable: usable,
      range: intToIp(first >>> 0) + " – " + intToIp(last >>> 0)
    };
  }

  $("cidrCalcBtn").addEventListener("click", () => {
    try {
      const result = calculateCidr($("cidrInput").value);
      $("cidrOutput").innerHTML =
        '<div><span>Network</span><strong>' + esc(result.network) + '</strong></div>' +
        '<div><span>Subnet mask</span><strong>' + esc(result.mask) + '</strong></div>' +
        '<div><span>Broadcast</span><strong>' + esc(result.broadcast) + '</strong></div>' +
        '<div><span>Usable hosts</span><strong>' + esc(result.usable) + '</strong></div>' +
        '<div style="grid-column:1/-1"><span>Host range</span><strong>' + esc(result.range) + "</strong></div>";
    } catch (error) {
      $("cidrOutput").innerHTML = '<div style="grid-column:1/-1"><span>Error</span><strong class="text-red">' + esc(error.message) + "</strong></div>";
    }
  });

  function renderRemote() {
    fillEndpointSelect($("remoteEndpoint"), null, true);
    const endpoint = endpointById($("remoteEndpoint").value);
    if (endpoint) currentEndpointId = endpoint.id;
    renderRemoteEndpointCard();
    renderRemoteActions();
  }

  $("remoteEndpoint").addEventListener("change", () => {
    currentEndpointId = $("remoteEndpoint").value;
    renderRemoteEndpointCard();
  });

  function renderRemoteEndpointCard() {
    const endpoint = endpointById($("remoteEndpoint").value);

      $("remoteEndpointCard").innerHTML = endpoint
        ? '<h3>' + esc(endpoint.hostname) + '</h3><p>' + esc(endpoint.ip + " · " + endpoint.site) + '</p><div class="empty">No authorized agent connected. Live CPU, memory, disk, heartbeat and remote-action results are unavailable.</div>'
        : '<div class="empty">No endpoint selected. Remote support requires a connected agent.</div>';
      qsa("[data-remote-action]").forEach((button) => { button.disabled = true; });
      $("remoteConsole").textContent = "Real remote-support functions require a connected, authenticated endpoint agent. No simulated results are available in Cloud Workspace.";
      return;

  }

  qsa("[data-remote-action]").forEach((button) => button.addEventListener("click", () => {

      toast("Agent required", "Live remote support is not available without a connected endpoint agent.");
      return;

  }));

  function renderRemoteActions() {
    const rows = state.remoteActions.slice(0, 12);
    $("remoteActionRows").innerHTML = rows.length ? rows.map((row) => {
      const ep = endpointById(row.endpointId);
      return '<div class="stack-row"><div><strong>' + esc(row.action + " · " + (ep ? ep.hostname : row.endpointId)) +
        '</strong><small>' + esc(fmtDate(row.createdAt) + (row.reference ? " · " + row.reference : "")) +
        '</small></div>' + badge(row.status, "green") + "</div>";
    }).join("") : '<div class="empty">No remote actions recorded yet.</div>';
  }

  function renderDocumentation() {
    $("docDevices").textContent = state.endpoints.length;
    $("docSites").textContent = uniqueSites().length;
    $("docVlans").textContent = state.vlans.length;
    $("docPorts").textContent = state.ports.length;

    const grouped = {};
    state.endpoints.forEach((e) => {
      if (!grouped[e.site]) grouped[e.site] = [];
      grouped[e.site].push(e);
    });
    $("topology").innerHTML = Object.keys(grouped).length ? Object.keys(grouped).sort().map((site) =>
      '<div class="topology-site"><strong>' + esc(site) + '</strong><div class="topology-nodes">' +
      grouped[site].map((e) => '<div class="topology-node"><b>' + esc(e.hostname) + '</b><span>' + esc(e.type + " · " + e.ip) + "</span></div>").join("") +
      "</div></div>"
    ).join("") : '<div class="empty">No documented sites or devices.</div>';

    $("vlanRows").innerHTML = state.vlans.length ? state.vlans.map((v) =>
      '<div class="stack-row"><div><strong>' + esc(v.site + " · VLAN " + v.vlan + " · " + v.name) +
      '</strong><small>' + esc(v.cidr + " · GW " + v.gateway + " · DNS " + v.dns) +
      '</small></div><button class="mini-btn danger" data-remove-vlan="' + esc(v.id) + '">Remove</button></div>'
    ).join("") : '<div class="empty">No VLAN plans documented.</div>';

    $("docDeviceRows").innerHTML = state.endpoints.length ? state.endpoints.map((e) =>
      "<tr><td>" + esc(e.hostname) + "</td><td>" + esc(e.type) + "</td><td>" + esc(e.ip) + "</td><td>" + esc(e.site) +
      "</td><td>" + esc(e.model + " · " + e.os) + "</td><td>" + esc(e.owner) + "</td></tr>"
    ).join("") : '<tr><td colspan="6" class="empty">No devices documented.</td></tr>';

    $("portRows").innerHTML = state.ports.length ? state.ports.map((p) => {
      const e = endpointById(p.endpointId);
      return '<div class="stack-row"><div><strong>' + esc(p.switch + " · " + p.port) +
        '</strong><small>' + esc((e ? e.hostname : p.endpointId) + " · VLAN " + p.vlan) +
        '</small></div><button class="mini-btn danger" data-remove-port="' + esc(p.id) + '">Remove</button></div>';
    }).join("") : '<div class="empty">No switch port mappings documented.</div>';

    $("docChangeRows").innerHTML = state.docChanges.slice(0, 12).map((c) =>
      '<div class="stack-row"><div><strong>' + esc(c.detail) + '</strong><small>' + esc(fmtDate(c.createdAt)) + "</small></div></div>"
    ).join("") || '<div class="empty">No documentation changes yet.</div>';

    qsa("[data-remove-vlan]").forEach((button) => button.onclick = () => {
      const row = state.vlans.find((v) => v.id === button.dataset.removeVlan);
      state.vlans = state.vlans.filter((v) => v.id !== button.dataset.removeVlan);
      audit("Documentation", "VLAN removed", row ? row.site + " VLAN " + row.vlan : button.dataset.removeVlan, row ? row.cidr : "");
      saveState();
      renderDocumentation();
      renderOverview();
    });

    qsa("[data-remove-port]").forEach((button) => button.onclick = () => {
      const row = state.ports.find((p) => p.id === button.dataset.removePort);
      state.ports = state.ports.filter((p) => p.id !== button.dataset.removePort);
      audit("Documentation", "Port mapping removed", row ? row.switch + " " + row.port : button.dataset.removePort, row ? row.endpointId : "");
      saveState();
      renderDocumentation();
      renderOverview();
    });
  }

  $("printDocsBtn").addEventListener("click", () => {
    audit("Documentation", "Documentation printed", state.meta.workspaceName, "Generated printable network documentation from unified state.");
    saveState();
    window.print();
  });

  $("addVlanBtn").addEventListener("click", () => {
    showModal("Add VLAN / IP Plan",
      '<div class="form-grid">' +
      '<label class="field"><span>Site</span><input id="mVlanSite" placeholder="HQ"></label>' +
      '<label class="field"><span>VLAN ID</span><input id="mVlanId" type="number" min="1" max="4094"></label>' +
      '<label class="field"><span>Name</span><input id="mVlanName" placeholder="Users"></label>' +
      '<label class="field"><span>CIDR</span><input id="mVlanCidr" placeholder="10.20.40.0/24"></label>' +
      '<label class="field"><span>Gateway</span><input id="mVlanGateway" placeholder="10.20.40.1"></label>' +
      '<label class="field"><span>DNS</span><input id="mVlanDns" placeholder="10.20.10.53"></label>' +
      '</div><div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Add VLAN</button></div>',
      () => {
        $("mCancel").onclick = closeModal;
        $("mSave").onclick = () => {
          const site = $("mVlanSite").value.trim();
          const vlan = Number($("mVlanId").value);
          const name = $("mVlanName").value.trim();
          const cidr = $("mVlanCidr").value.trim();
          const gateway = $("mVlanGateway").value.trim();
          const dns = $("mVlanDns").value.trim();
          try { calculateCidr(cidr); } catch (error) { toast("Invalid CIDR", error.message); return; }
          if (!site || !name || !vlan || vlan < 1 || vlan > 4094 || !validIp(gateway)) {
            toast("Invalid VLAN record", "Site, VLAN ID, name, CIDR, and valid gateway are required.");
            return;
          }
          const row = { id: uid("VLAN"), site, vlan, name, cidr, gateway, dns: validIp(dns) ? dns : "" };
          state.vlans.push(row);
          state.docChanges.unshift({ id: uid("DOC"), detail: "Added " + site + " VLAN " + vlan + " (" + name + ").", createdAt: now() });
          audit("Documentation", "VLAN added", site + " VLAN " + vlan, cidr);
          saveState();
          closeModal();
          renderDocumentation();
          renderOverview();
          toast("VLAN documented", site + " · VLAN " + vlan);
        };
      }
    );
  });

  $("addPortBtn").addEventListener("click", () => {
    const switches = state.endpoints.filter((e) => /switch/i.test(e.type));
    showModal("Add Switch Port Mapping",
      '<div class="form-grid">' +
      '<label class="field"><span>Switch</span><select id="mPortSwitch">' +
      (switches.length ? switches.map((e) => '<option value="' + esc(e.hostname) + '">' + esc(e.hostname) + "</option>").join("") :
        '<option value="">No switches — add a Switch endpoint first</option>') + '</select></label>' +
      '<label class="field"><span>Port</span><input id="mPortName" placeholder="Gi1/0/12"></label>' +
      '<label class="field"><span>Endpoint</span><select id="mPortEndpoint">' +
      (state.endpoints.length ? state.endpoints.map((e) => '<option value="' + esc(e.id) + '">' + esc(e.hostname) + "</option>").join("") :
        '<option value="">No endpoints — add an endpoint first</option>') + '</select></label>' +
      '<label class="field"><span>VLAN</span><input id="mPortVlan" type="number" min="1" max="4094"></label>' +
      '</div><div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Add Mapping</button></div>',
      () => {
        $("mCancel").onclick = closeModal;
        $("mPortSwitch").disabled = !switches.length;
        $("mPortEndpoint").disabled = !state.endpoints.length;
        $("mSave").disabled = !switches.length || !state.endpoints.length || cloudRole === "viewer";
        $("mSave").onclick = () => {
          const sw = $("mPortSwitch").value;
          const port = $("mPortName").value.trim();
          const endpointId = $("mPortEndpoint").value;
          const vlan = Number($("mPortVlan").value);
          if (!sw || !port || !endpointId || !vlan) {
            toast("Missing details", "Switch, port, endpoint, and VLAN are required.");
            return;
          }
          state.ports.push({ id: uid("PORT"), switch: sw, port, endpointId, vlan });
          const ep = endpointById(endpointId);
          state.docChanges.unshift({ id: uid("DOC"), detail: "Mapped " + sw + " " + port + " to " + (ep ? ep.hostname : endpointId) + ".", createdAt: now() });
          audit("Documentation", "Port mapping added", sw + " " + port, (ep ? ep.hostname : endpointId) + " · VLAN " + vlan);
          saveState();
          closeModal();
          renderDocumentation();
          renderOverview();
        };
      }
    );
  });

  $("addChangeNoteBtn").addEventListener("click", () => {
    const detail = $("changeNoteInput").value.trim();
    if (!detail) return;
    state.docChanges.unshift({ id: uid("DOC"), detail, createdAt: now() });
    $("changeNoteInput").value = "";
    audit("Documentation", "Change note added", "Network documentation", detail);
    saveState();
    renderDocumentation();
    renderOverview();
    toast("Change note added", detail);
  });

  function renderCompliance() {

      $("complianceScore").textContent = "N/A";
      $("complianceBreakdown").innerHTML = '<div class="empty">No authenticated endpoint compliance feed is connected.</div>';
      $("complianceRows").innerHTML = '<tr><td colspan="8" class="empty">No verified compliance readings available. Inventory entries alone cannot establish device compliance.</td></tr>';
      return;

  }

  function evaluateFleet(recordAudit = true) {

      toast("Compliance feed unavailable", "Connect verified endpoint telemetry to evaluate live compliance.");
      return;

  }

  $("evaluateComplianceBtn").addEventListener("click", () => evaluateFleet(true));

  // Build a ticket against an isolated draft. Shared by cloud-confirmed create paths.
  function buildTicketForDraft(draft, input) {
    const createdAt = now();
    const impact = input.impact || "Medium";
    const urgency = input.urgency || "Medium";
    const priority = input.priority || priorityFromImpactUrgency(impact, urgency);
    const sla = SLA[priority] || SLA.P3;
    const asset = (draft.assets || []).find((a) => a.id === input.assetId);
    const requesterId = input.requesterId || "";
    if (input.assetId && !asset) throw new Error("The selected asset is no longer available.");
    if (requesterId && !(draft.identities || []).some((u) => u.id === requesterId && u.status === "Active")) {
      throw new Error("Select an active requester.");
    }
    const assigneeId = input.assigneeId || "";
    if (assigneeId) {
      const techIds = new Set((draft.technicians || []).map((t) => t.id));
      const activeIT = (draft.identities || []).some((u) => {
        const t = (draft.templates || []).find((tpl) => tpl.id === u.templateId);
        return u.id === assigneeId && u.status === "Active" && (t?.department === "IT" || u.department === "IT");
      });
      if (!techIds.has(assigneeId) && !activeIT) throw new Error("Select a valid active technician.");
    }
    const id = (() => {
      let next = 1001;
      for (const item of draft.incidents || []) {
        const match = /^INC-(\d+)$/.exec(String(item.id || ""));
        if (match) next = Math.max(next, Number(match[1]) + 1);
      }
      while ((draft.incidents || []).some((item) => item.id === "INC-" + next)) next += 1;
      return "INC-" + next;
    })();
    return normalizeTicket({
      id,type:input.type || "Incident",
      endpointId:input.endpointId || (asset ? asset.endpointId : ""),
      assetId:input.assetId || "",requesterId,assigneeId,
      category:input.category || input.source || "General",
      title:String(input.title || "New service desk ticket").trim(),
      description:input.description || "",impact,urgency,priority,
      status:input.status || "New",source:input.source || "Manual",
      createdAt,responseDue:addHours(createdAt,sla.response),
      resolutionDue:addHours(createdAt,sla.resolution),
      activities:[{at:createdAt,actor:"OpsFusion",action:"Ticket created",
        note:input.description || input.source || "Service Desk intake"}]
    });
  }

  async function commitNewTicket(input) {
    let created;
    await commitWorkspaceChange((draft) => {
      created = buildTicketForDraft(draft,input);
      draft.incidents.unshift(created);
    });
    audit("Service Desk","Ticket created",created.id,created.title);
    renderIncidents();renderOverview();
    return created;
  }

  function wireTicketTools(ticketId) {
    const panel=$("mTicketToolPanel"), propose=$("mTicketToolPropose"), pending=$("mTicketToolPending");
    if (!panel || !propose || !pending) return;
    const epoch=workspaceSessionEpoch;
    const current=()=>$("mTicketToolPanel")===panel && epoch===workspaceSessionEpoch;
    const render=(rows)=>{
      if(!current())return;
      panel.hidden=false;
      panel.innerHTML=rows.length ? rows.map((p)=>
        '<article class="ai-ticket-panel"><h3>Pending tool: '+esc(p.tool_name)+'</h3>'+
        '<p>Ticket: '+esc(p.ticket_id)+' · Model: '+esc(p.model)+'</p>'+
        '<p>Expires: '+esc(fmtDate(p.expires_at))+'</p><p>Exact note to append:</p>'+
        '<div style="white-space:pre-wrap">'+esc(p.arguments?.note||"")+'</div>'+
        '<p>No action has run. Approval saves this exact note; it does not perform the proposed checks.</p>'+
        '<button class="btn primary" data-tool-approve="'+esc(p.id)+'">Approve &amp; Add Note</button> '+
        '<button class="btn secondary" data-tool-reject="'+esc(p.id)+'">Reject</button></article>'
      ).join("") : '<p>No pending proposals for this ticket.</p>';
      panel.querySelectorAll("[data-tool-approve],[data-tool-reject]").forEach((button)=>button.onclick=async()=>{
        const id=button.dataset.toolApprove||button.dataset.toolReject;
        const decision=button.dataset.toolApprove?"approve":"reject";
        panel.querySelectorAll("button").forEach(b=>b.disabled=true);
        propose.disabled=true;pending.disabled=true;
        try {
          // Serialize execution with ordinary workspace edits. Refresh the authoritative version before another local edit can run.
          const operation=workspaceCommitQueue.then(async()=>{
            if(!current())throw new Error("Session or ticket view changed. Reopen the ticket.");
            await window.OpsFusionFlushSaves();
            const result=await window.OpsFusionCloud.ticketToolRequest(ticketId,decision,id);
            if(epoch!==workspaceSessionEpoch)throw new Error("Session changed.");
            if(result.status==="executed"){
              const latest=await window.OpsFusionCloud.refreshWorkspace();
              if(epoch!==workspaceSessionEpoch)throw new Error("Session changed.");
              state=latest.state;state.audit=latest.audit||[];migrateUnifiedState();renderAll();
            }
            return result;
          });
          workspaceCommitQueue=operation.catch(()=>{});
          const result=await operation;
          if(!current())return;
          panel.textContent=result.status==="executed" ? "Executed: the approved note was saved once. Reopen Details to see its activity." :
            result.status==="rejected" ? "Rejected. No ticket change." :
            "Not executed: "+result.status+". Refresh cloud data and request a new proposal.";
          toast("AI tool decision",result.status);
        } catch(error) {if(current())panel.textContent="Decision could not be confirmed: "+error.message+". Refresh and check ticket history before retrying.";}
        finally {if(current()){propose.disabled=false;pending.disabled=false;}}
      });
    };
    const run=async(mode)=>{
      propose.disabled=true;pending.disabled=true;panel.hidden=false;
      panel.textContent=mode==="propose"?"Requesting a Gemini tool proposal. Nothing will execute without approval.":"Loading pending proposals...";
      try {
        await workspaceCommitQueue;
        await window.OpsFusionFlushSaves();
        const result=await window.OpsFusionCloud.ticketToolRequest(ticketId,mode);
        render(mode==="propose"?[result.proposal]:result);
      }catch(error){if(current())panel.textContent=error.message;}
      finally{if(current()){propose.disabled=false;pending.disabled=false;}}
    };
    propose.onclick=()=>run("propose");pending.onclick=()=>run("list");
  }

  function openTicketModal(id) {
    const t=incidentById(id);if(!t)return;
    const ticket=normalizeTicket(t),ep=endpointById(ticket.endpointId),asset=assetById(ticket.assetId),requester=identityById(ticket.requesterId),tech=technicianById(ticket.assigneeId),sla=ticketSlaState(ticket);
    const canAnalyze = window.OpsFusionCloud?.isCloudActive?.() && cloudRole !== "viewer";
    showModal("Ticket · "+ticket.id,
      '<div class="endpoint-card"><h3>'+esc(ticket.title)+'</h3><p>'+esc(ticket.type+" · "+ticket.category+" · "+ticket.source)+'</p><div class="endpoint-meta">'+
      '<div><span>Requester</span><strong>'+esc(requester?requester.displayName:"Unassigned")+'</strong></div><div><span>Assignee</span><strong>'+esc(tech?tech.name:"Unassigned")+'</strong></div>'+
      '<div><span>Endpoint</span><strong>'+esc(ep?ep.hostname:"None")+'</strong></div><div><span>Asset</span><strong>'+esc(asset?asset.tag:"None")+'</strong></div>'+
      '<div><span>Priority</span><strong>'+esc(ticket.priority+" · "+sla.label)+'</strong></div><div><span>Resolution due</span><strong>'+esc(fmtDate(ticket.resolutionDue))+'</strong></div></div></div>'+
      '<p style="font-size:.58rem;color:var(--muted);line-height:1.55">'+esc(ticket.description||"No additional description.")+'</p>'+
      '<div class="stack">'+ticket.activities.slice().reverse().map((a)=>'<div class="stack-row"><div><strong>'+esc(a.action+" · "+a.actor)+'</strong><small>'+esc(fmtDate(a.at)+" · "+a.note)+'</small></div></div>').join("")+'</div>'+
      (ticket.portalUserId ? '<h3>Employee conversation</h3><div>'+ticket.employeeMessages.map(m=>'<p><strong>'+esc(m.author)+'</strong> · '+esc(fmtDate(m.at))+'<br>'+esc(m.body)+'</p>').join('')+'</div><label class="field"><span>Reply visible to employee</span><textarea id="mEmployeeReply" maxlength="2000"></textarea></label><button class="btn secondary" id="mEmployeeReplySave">Send Employee Reply</button>' : '')+
      '<label class="field" style="margin-top:12px"><span>Work note</span><textarea id="mTicketNote" placeholder="Add troubleshooting or resolution note"></textarea></label>'+
      (canAnalyze?'<div class="ai-ticket-privacy">AI is optional: clicking Analyze sends this ticket\'s limited text, recent work notes, and relevant active Knowledge Base excerpts to Google Gemini. Free-tier content may be used to improve Google products. Never analyze confidential data or credentials. Technician review is required.</div>'+
        '<section id="mTicketAiPanel" class="ai-ticket-panel" aria-live="polite" hidden></section>'+ 
      '<div class="modal-actions"><button class="btn secondary" id="mTicketToolPropose">AI Propose Work Note</button><button class="btn secondary" id="mTicketToolPending">Pending Tool Proposals</button></div>'+ 
      '<section id="mTicketToolPanel" aria-live="polite" hidden></section>':"")+
      '<div class="modal-actions">'+(canAnalyze?'<button class="btn secondary" id="mTicketAiAnalyze">AI Analyze Ticket</button>':"")+
      (!ticket.firstResponseAt?'<button class="btn secondary" id="mTicketRespond">Record First Response</button>':"")+'<button class="btn primary" id="mTicketNoteSave">Add Work Note</button></div>',
      ()=>{
        wireTicketTools(id);
        if($("mEmployeeReplySave"))$("mEmployeeReplySave").onclick=async()=>{
          const button=$("mEmployeeReplySave"),body=$("mEmployeeReply").value.trim();
          if(!body)return;button.disabled=true;
          try{await commitWorkspaceChange(draft=>{
            const target=draft.incidents.find(t=>t.id===id);if(!target?.portalUserId)throw new Error("Employee ticket no longer available.");
            if(["Resolved","Closed"].includes(target.status))throw new Error("Reopen the ticket before replying.");
            target.employeeMessages=target.employeeMessages||[];
            if(target.employeeMessages.length>=100)throw new Error("Conversation limit reached.");
            target.employeeMessages.push({author:"IT Support",body:body.slice(0,2000),at:now()});target.updatedAt=now();
            if(!target.firstResponseAt)target.firstResponseAt=now();
          });audit("Service Desk","Employee reply sent",id,"Public response saved");openTicketModal(id);}
          catch(e){toast("Reply not saved",e.message);button.disabled=false;}
        };
        if ($("mTicketAiAnalyze")) $("mTicketAiAnalyze").onclick=async()=>{
          const button=$("mTicketAiAnalyze"),panel=$("mTicketAiPanel");
          if(!panel)return;
          button.disabled=true;
          panel.hidden=false;
          panel.textContent="Analyzing ticket using the external AI provider. No ticket will be changed.";
          try {
            const result=await window.OpsFusionCloud.analyzeTicket(id);
            if($("mTicketAiPanel")!==panel)return;
            const data=result.analysis;
            const items=(values)=>Array.isArray(values)&&values.length
              ? '<ol>'+values.map((value)=>'<li>'+esc(value)+'</li>').join("")+'</ol>'
              : '<p>Insufficient evidence available.</p>';
            panel.innerHTML='<h3>AI Service Desk Assistance · '+esc(result.ticket_id)+'</h3>'+
              '<p><strong>Provider</strong> '+esc(result.provider||"Google Gemini")+' · '+esc(result.model||"Gemini")+'</p>'+
              '<p><strong>Summary</strong> '+esc(data.summary)+'</p>'+
              '<p><strong>Possible causes (not verified)</strong></p>'+items(data.likely_causes)+
              '<p><strong>Recommended checks for a technician</strong></p>'+items(data.recommended_checks)+
              '<p><strong>Suggested classification</strong> '+esc(data.recommended_category)+' · '+esc(data.recommended_priority)+'</p>'+
              '<p><strong>Draft work note (not saved)</strong></p>'+
              '<div class="ai-ticket-draft">'+esc(data.draft_work_note)+'</div>'+
              '<button class="btn secondary" id="mTicketAiInsert">Insert Draft Into Work Note</button>'+
              '<p><strong>Knowledge Base references</strong></p>'+((result.knowledge_sources||[]).length ? (result.knowledge_sources||[]).map(k=>'<p><strong>'+esc(k.id+' · '+k.title)+'</strong> · '+(k.cited?'Cited by AI':'Retrieved reference')+'<br>'+esc(k.summary)+'</p>').join('') : '<p>No relevant active articles found. Suggestions are not grounded in your Knowledge Base.</p>')+
              '<p><strong>Evidence limitations</strong> '+esc(data.limitations)+'</p>'+
              '<small>'+esc(result.disclosure||"AI-generated suggestions require technician approval.")+'</small>';
            const insert=$("mTicketAiInsert");
            if(insert)insert.onclick=()=>{
              const note=$("mTicketNote");
              if(!note)return;
              if(note.value.trim()&&!confirm("Replace the current unsaved work note with the AI draft?"))return;
              note.value=String(data.draft_work_note||"");
              note.focus();
              toast("AI draft inserted","Review and edit this note, then click Add Work Note to save.");
            };
          }catch(error){
            if($("mTicketAiPanel")===panel){
              panel.innerHTML='<p role="alert"><strong>AI analysis unavailable:</strong> '+esc(error.message||"Unknown error")+'</p>';
            }
          }finally{if($("mTicketAiAnalyze")===button)button.disabled=false;}
        };
        if($("mTicketRespond"))$("mTicketRespond").onclick=async()=>{
          const button=$("mTicketRespond");button.disabled=true;
          try{
            await commitWorkspaceChange((draft)=>{
              const record=draft.incidents.find((row)=>row.id===id);
              if(!record || record.firstResponseAt)throw new Error("First response already recorded or ticket missing.");
              record.firstResponseAt=now();record.updatedAt=now();
              record.activities=Array.isArray(record.activities)?record.activities:[];
              record.activities.push({at:now(),actor:window.OpsFusionCloud?.getUser?.()?.email || "IT staff",action:"First response",note:"First-response timestamp recorded."});
            });
            audit("Service Desk","First response recorded",id,t.title);
            closeModal();renderIncidents();toast("First response recorded",id);
          }catch(error){button.disabled=false;toast("First response not saved",error.message||"Cloud update failed.");}
        };
        $("mTicketNoteSave").onclick=async()=>{
          const note=$("mTicketNote").value.trim();if(!note)return;
          const button=$("mTicketNoteSave");button.disabled=true;
          try{
            await commitWorkspaceChange((draft)=>{
              const record=draft.incidents.find((row)=>row.id===id);
              if(!record)throw new Error("Ticket was not found.");
              record.updatedAt=now();record.activities=Array.isArray(record.activities)?record.activities:[];
              record.activities.push({at:now(),actor:window.OpsFusionCloud?.getUser?.()?.email || "IT staff",action:"Work note",note});
            });
            audit("Service Desk","Work note added",id,note);
            closeModal();renderIncidents();toast("Work note added",id);
          }catch(error){button.disabled=false;toast("Work note not saved",error.message||"Cloud update failed.");}
        };
      }
    );
  }

  function renderIncidents() {
    state.incidents=state.incidents.map(normalizeTicket);
    const open=state.incidents.filter((i)=>!["Resolved","Closed"].includes(i.status));
    const risk=open.filter((i)=>ticketSlaState(i).level==="warn").length;
    const breached=open.filter((i)=>ticketSlaState(i).level==="bad").length;
    $("incNew").textContent=open.length;$("incActive").textContent=risk;$("incPending").textContent=breached;$("incResolved").textContent=state.incidents.length-open.length;

    const sf=$("ticketStatusFilter");
    setFilterOptions(sf,"All statuses",state.incidents.map((i)=>i.status));
    const q=$("ticketSearch").value.trim().toLowerCase(),pf=$("ticketPriorityFilter").value;
    const incidents=state.incidents.filter((i)=>{
      const ep=endpointById(i.endpointId),asset=assetById(i.assetId),req=identityById(i.requesterId),tech=technicianById(i.assigneeId);
      const hay=[i.id,i.title,i.type,i.category,i.source,ep?ep.hostname:"",asset?asset.tag:"",req?req.displayName:"",tech?tech.name:""].join(" ").toLowerCase();
      return(!q||hay.includes(q))&&(!sf.value||i.status===sf.value)&&(!pf||i.priority===pf);
    }).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));

    $("incidentRows").innerHTML=incidents.length?incidents.map((i)=>{
      const ep=endpointById(i.endpointId),asset=assetById(i.assetId),req=identityById(i.requesterId),tech=technicianById(i.assigneeId),sla=ticketSlaState(i);
      return '<div class="incident-card service-ticket"><div><span class="ticket">'+esc(i.id)+'</span><div style="margin-top:5px">'+badge(i.priority,priorityTone(i.priority))+' '+badge(sla.label,sla.level==="bad"?"red":sla.level==="warn"?"amber":"green")+'</div></div>'+
        '<div><h4>'+esc(i.title)+'</h4><p>'+esc(i.type+" · "+i.category+" · "+(req?req.displayName:"No requester")+(asset?" · "+asset.tag:ep?" · "+ep.hostname:"")+(tech?" · "+tech.name:" · Unassigned"))+'</p><p>'+esc("Created "+fmtDate(i.createdAt)+" · Resolution due "+fmtDate(i.resolutionDue))+'</p></div>'+
        '<div class="incident-actions"><select data-incident-status="'+esc(i.id)+'">'+["New","Assigned","Active","In Progress","Pending","Resolved","Closed"].map((s)=>'<option'+(s===i.status?" selected":"")+'>'+s+'</option>').join("")+'</select><button class="mini-btn" data-open-ticket="'+esc(i.id)+'">Details</button></div></div>';
    }).join(""):'<div class="empty">No tickets match the current filters.</div>';

    qsa("[data-incident-status]").forEach((select)=>select.onchange=async()=>{
      const id=select.dataset.incidentStatus;
      const ticket=incidentById(id);
      if(!ticket || cloudRole==="viewer")return;
      const previous=ticket.status;
      const updated=select.value;
      if(previous===updated)return;
      select.disabled=true;
      try {
        await commitWorkspaceChange((draft)=>{
          const item=draft.incidents.find((i)=>i.id===id);
          if(!item)throw new Error("Ticket no longer exists.");
          item.status=updated;item.updatedAt=now();
          if(["Resolved","Closed"].includes(updated) && !item.resolvedAt)item.resolvedAt=now();
          item.activities = Array.isArray(item.activities) ? item.activities : [];
          item.activities.push({at:now(),actor:window.OpsFusionCloud?.getUser?.()?.email || "IT staff",action:"Status changed",note:previous+" → "+updated});
        });
        audit("Service Desk","Ticket status changed",id,previous+" → "+updated);
        renderIncidents();renderOverview();
      } catch(error) {
        select.value=previous;select.disabled=false;
        toast("Ticket not saved",error.message||"Unable to update ticket status.");
      }
    });
    qsa("[data-open-ticket]").forEach((b)=>b.onclick=()=>openTicketModal(b.dataset.openTicket));

    renderKnowledge();
    $("technicianRows").innerHTML=availableTechnicians().map((tech)=>{const load=open.filter((t)=>t.assigneeId===tech.id).length;return '<div class="stack-row"><div><strong>'+esc(tech.name+" · "+tech.role)+'</strong><small>'+esc(tech.specialty)+'</small></div>'+badge(load+" open",load>3?"amber":"blue")+'</div>';}).join("");
    // Rendering is read-only. In particular, do not overwrite a remote cloud
    // workspace merely because a user opened the Service Desk page.
  }

  $("ticketSearch").addEventListener("input",renderIncidents);
  $("ticketStatusFilter").addEventListener("change",renderIncidents);
  $("ticketPriorityFilter").addEventListener("change",renderIncidents);

  $("newIncidentBtn").addEventListener("click",()=>{
    showModal("New Service Desk Ticket",
      '<div class="form-grid"><label class="field span-2"><span>Title</span><input id="mIncidentTitle" placeholder="Describe the issue or request"></label>'+
      '<label class="field"><span>Type</span><select id="mTicketType"><option>Incident</option><option>Service Request</option></select></label>'+
      '<label class="field"><span>Category</span><select id="mTicketCategory"><option>Network</option><option>Endpoint</option><option>Account Access</option><option>Hardware / Asset</option><option>Microsoft 365</option><option>VPN</option><option>Onboarding</option><option>Offboarding</option><option>General</option></select></label>'+
      '<label class="field"><span>Requester</span><select id="mTicketRequester"><option value="">No requester</option>'+state.identities.filter((u)=>u.status==="Active").map((u)=>'<option value="'+esc(u.id)+'">'+esc(u.displayName+" · "+u.department)+'</option>').join("")+'</select></label>'+
      '<label class="field"><span>Asset</span><select id="mTicketAsset"><option value="">No asset</option>'+state.assets.map((a)=>'<option value="'+esc(a.id)+'">'+esc(a.tag+" · "+a.hostname)+'</option>').join("")+'</select></label>'+
      '<label class="field"><span>Impact</span><select id="mTicketImpact"><option>Low</option><option selected>Medium</option><option>High</option></select></label>'+
      '<label class="field"><span>Urgency</span><select id="mTicketUrgency"><option>Low</option><option selected>Medium</option><option>High</option></select></label>'+
      '<label class="field"><span>Assignee</span><select id="mTicketAssignee"><option value="">Unassigned (add an active IT identity to assign)</option>'+
      availableTechnicians().map((t)=>'<option value="'+esc(t.id)+'">'+esc(t.name+" · "+t.role)+'</option>').join("")+'</select></label>'+
      '<label class="field"><span>Source</span><select id="mIncidentSource"><option>Manual</option><option>Troubleshooting</option><option>Remote Support</option><option>Compliance</option><option>Monitoring</option><option>Identity</option><option>Asset Management</option></select></label>'+
      '<label class="field span-2"><span>Description</span><textarea id="mTicketDescription" placeholder="Provide symptoms, request details, business impact, or troubleshooting context"></textarea></label></div>'+
      '<div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Create Ticket</button></div>',
      ()=>{
        $("mCancel").onclick=closeModal;
        $("mSave").onclick=async()=>{
          const title=$("mIncidentTitle").value.trim();if(!title){toast("Title required","Enter a ticket title.");return;}
          const assetId=$("mTicketAsset").value,asset=assetById(assetId);
          const requesterId=$("mTicketRequester").value||(asset?asset.assignedUserId:"");
          const input={type:$("mTicketType").value,assetId,endpointId:asset?asset.endpointId:"",
            requesterId,assigneeId:$("mTicketAssignee").value,title,category:$("mTicketCategory").value,
            impact:$("mTicketImpact").value,urgency:$("mTicketUrgency").value,
            source:$("mIncidentSource").value,description:$("mTicketDescription").value.trim()};
          const button=$("mSave");button.disabled=true;
          try {
            await commitNewTicket(input);
            closeModal();toast("Ticket created",title);
          }catch(error){button.disabled=false;toast("Ticket not saved",error.message||"Unable to save the Service Desk record.");}
        };
      }
    );
  });

  function renderKnowledge() {
    const query=$("knowledgeSearch").value.trim().toLowerCase();
    const archived=$("knowledgeArchived").checked;
    const card=k=>'<button class="knowledge-row" data-kb="'+esc(k.id)+'"><strong>'+esc(k.title)+(k.archived?' · Archived':'')+'</strong><span>'+esc(k.category+" · "+k.summary)+'</span></button>';
    const active=state.knowledge.filter(k=>!k.archived);
    $("knowledgeRows").innerHTML=active.length ? active.slice(0,8).map(card).join("") : '<div class="empty">No active articles. Open Knowledge Base to add one.</div>';
    const filtered=state.knowledge.filter(k=>(archived||!k.archived) && (!query || [k.title,k.category,k.summary,k.content].join(" ").toLowerCase().includes(query)));
    $("knowledgeLibraryRows").innerHTML=filtered.length ? filtered.map(card).join("") : '<div class="empty">No articles match this view.</div>';
    $("addKnowledgeBtn").disabled=cloudRole==="viewer";
    qsa("[data-kb]").forEach(b=>b.onclick=()=>openKnowledgeArticle(b.dataset.kb));
  }

  function openKnowledgeArticle(id) {
    const k=state.knowledge.find(k=>k.id===id);if(!k)return;
    showModal(k.title,'<p class="cell-sub">'+esc(k.category)+(k.archived?' · Archived':'')+(k.updatedAt?' · Updated '+esc(fmtDate(k.updatedAt)):'')+'</p>'+
      '<p>'+esc(k.summary)+'</p><div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:.73rem;line-height:1.7">'+esc(k.content||k.summary)+'</div>'+
      '<div class="modal-actions">'+(cloudRole!=="viewer"?'<button class="btn secondary" id="mKbEdit">Edit Article</button>':'')+'<button class="btn primary" id="mKbClose">Close</button></div>',()=>{
        $("mKbClose").onclick=closeModal;if($("mKbEdit"))$("mKbEdit").onclick=()=>openKnowledgeEditor(id);
      });
  }

  function openKnowledgeEditor(id=null) {
    if(cloudRole==="viewer")return;
    const k=id ? state.knowledge.find(k=>k.id===id) : null;
    if(id&&!k)return;
    const articleId=id||uid("KB");
    showModal(k?"Edit Knowledge Article":"New Knowledge Article",
      '<div class="form-grid"><label class="field"><span>Title</span><input id="mKbTitle" maxlength="160" value="'+esc(k?.title||"")+'"></label>'+
      '<label class="field"><span>Category</span><input id="mKbCategory" maxlength="80" value="'+esc(k?.category||"General")+'"></label>'+
      '<label class="field span-2"><span>Summary</span><textarea id="mKbSummary" maxlength="300">'+esc(k?.summary||"")+'</textarea></label>'+
      '<label class="field span-2"><span>Article text</span><textarea id="mKbContent" maxlength="20000" rows="10">'+esc(k?.content||k?.summary||"")+'</textarea></label></div>'+
      '<label class="check-row"><input id="mKbArchived" type="checkbox"'+(k?.archived?' checked':'')+'><span>Archived (hidden from active support articles)</span></label>'+
      '<p id="mKbError" class="cell-sub" role="alert" hidden></p><div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mKbSave">Save Article</button></div>',()=>{
        $("mCancel").onclick=()=>k?openKnowledgeArticle(id):closeModal();
        $("mKbSave").onclick=async()=>{
          const input={isNew:!k,title:$("mKbTitle").value,category:$("mKbCategory").value,summary:$("mKbSummary").value,content:$("mKbContent").value,archived:$("mKbArchived").checked};
          const button=$("mKbSave"),errorBox=$("mKbError");button.disabled=true;errorBox.hidden=true;
          try {
            await commitWorkspaceChange(draft=>saveKnowledgeRecord(draft,articleId,input,now()));
            audit("Knowledge",k?"Article updated":"Article created",articleId,input.title+(input.archived?" · archived":""));
            renderKnowledge();openKnowledgeArticle(articleId);toast("Article saved",input.title);
          }catch(error){errorBox.textContent=error.message;errorBox.hidden=false;button.disabled=false;}
        };
      });
  }
  $("addKnowledgeBtn").addEventListener("click",()=>openKnowledgeEditor());
  $("knowledgeSearch").addEventListener("input",renderKnowledge);
  $("knowledgeArchived").addEventListener("change",renderKnowledge);

  function renderAuditEntries(entries) {
    return entries.length ? entries.map((row) =>
      '<div class="audit-entry"><time>' + esc(fmtDate(row.createdAt)) + '</time><span class="module">' + esc(row.module) +
      '</span><div><strong>' + esc(row.action + (row.target ? " · " + row.target : "")) +
      '</strong><small>' + esc((row.detail || "") + (row.actorId ? " · Actor: " + (row.actorName || window.OpsFusionStaff?.members().find(m=>m.user_id===row.actorId)?.name || row.actorEmail || row.actorId) + " [" + row.actorId + "]" : "")) + "</small></div></div>"
    ).join("") : '<div class="empty">No audit events.</div>';
  }

  function renderAudit() {
    const select = $("auditModuleFilter");
    setFilterOptions(select, "All modules", state.audit.map((row) => row.module));

    const query = $("auditSearch").value.trim().toLowerCase();
    const module = select.value;
    const rows = state.audit.filter((row) => {
      const haystack = [row.module, row.action, row.target, row.detail, row.actorName, row.actorEmail, row.actorId].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (!module || row.module === module);
    });
    $("auditRows").innerHTML = renderAuditEntries(rows);
  }

  $("auditSearch").addEventListener("input", renderAudit);
  $("auditModuleFilter").addEventListener("change", renderAudit);

  function renderSettings() {
    $("ruleMissingUpdates").value = state.complianceRules.maxMissingUpdates;
    $("ruleRebootAge").value = state.complianceRules.maxRebootAge;
    $("ruleFirewall").checked = !!state.complianceRules.requireFirewall;
    $("ruleBitlocker").checked = !!state.complianceRules.requireBitlocker;
    $("ruleAv").checked = !!state.complianceRules.requireAv;
    $("autoTicketCompliance").checked = !!state.settings.autoTicketCompliance;
    $("autoTicketDiagnostic").checked = !!state.settings.autoTicketDiagnostic;
    $("workspaceNameInput").value = state.meta.workspaceName || "OpsFusion Unified";
  }

  $("saveRulesBtn").addEventListener("click", () => {
    state.complianceRules.maxMissingUpdates = Math.max(0, Number($("ruleMissingUpdates").value) || 0);
    state.complianceRules.maxRebootAge = Math.max(1, Number($("ruleRebootAge").value) || 14);
    state.complianceRules.requireFirewall = $("ruleFirewall").checked;
    state.complianceRules.requireBitlocker = $("ruleBitlocker").checked;
    state.complianceRules.requireAv = $("ruleAv").checked;
    audit("Compliance", "Compliance rules updated", state.meta.workspaceName, "Fleet evaluation policy changed.");
    saveState();
    evaluateFleet(false);
    toast("Compliance rules saved", "Fleet results recalculated.");
  });

  $("saveWorkflowSettingsBtn").addEventListener("click", () => {
    state.settings.autoTicketCompliance = $("autoTicketCompliance").checked;
    state.settings.autoTicketDiagnostic = $("autoTicketDiagnostic").checked;
    state.meta.workspaceName = $("workspaceNameInput").value.trim() || "OpsFusion Unified";
    audit("System", "Workflow settings updated", state.meta.workspaceName, "Workspace settings saved.");
    saveState();
    renderOverview();
    toast("Workflow settings saved", state.meta.workspaceName);
  });

  $("exportBtn").addEventListener("click", () => {
    audit("System", "Workspace exported", state.meta.workspaceName, "Unified JSON workspace exported from the browser.");
    saveState();
    const payload = JSON.stringify({ schema: "opsfusion-unified", version: 1, exportedAt: now(), workspace: state }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "opsfusion-workspace-" + new Date().toISOString().slice(0, 10) + ".json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    renderOverview();
  });

  function renderGlobalSearch(query) {
    const box = $("searchResults");
    const q = String(query || "").trim().toLowerCase();
    if (q.length < 2) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }
    const hits = [];
    state.endpoints.forEach((e) => {
      const hay = [e.hostname, e.ip, e.site, e.owner, e.type, e.os].join(" ").toLowerCase();
      if (hay.includes(q)) hits.push({ type: "endpoint", id: e.id, title: e.hostname, detail: e.ip + " · " + e.site + " · " + e.owner });
    });
    state.incidents.forEach((i) => {
      const hay = [i.id, i.title, i.status, i.priority, i.source].join(" ").toLowerCase();
      if (hay.includes(q)) hits.push({ type: "incident", id: i.id, title: i.id + " · " + i.title, detail: i.status + " · " + i.priority });
    });
    state.assets.forEach((a) => {
      const user=identityById(a.assignedUserId);
      const hay=[a.tag,a.hostname,a.serial,a.type,a.status,a.department,a.location,user?user.displayName:""].join(" ").toLowerCase();
      if(hay.includes(q)) hits.push({type:"asset",id:a.id,title:a.tag+" · "+a.hostname,detail:a.status+" · "+(user?user.displayName:"Unassigned")});
    });
    state.identities.forEach((u) => {
      const hay=[u.displayName,identityAccountEmail(u),u.department,u.title,u.status].join(" ").toLowerCase();
      if(hay.includes(q)) hits.push({type:"identity",id:u.id,title:u.displayName,detail:[identityAccountEmail(u),u.department,u.status].filter(Boolean).join(" · ")});
    });
    state.vlans.forEach((v) => {
      const hay = [v.site, v.vlan, v.name, v.cidr, v.gateway].join(" ").toLowerCase();
      if (hay.includes(q)) hits.push({ type: "vlan", id: v.id, title: v.site + " VLAN " + v.vlan + " · " + v.name, detail: v.cidr });
    });
    box.innerHTML = hits.slice(0, 10).map((hit, index) =>
      '<button class="search-hit" data-search-index="' + index + '"><strong>' + esc(hit.title) + '</strong><span>' + esc(hit.type + " · " + hit.detail) + "</span></button>"
    ).join("") || '<div class="empty">No matching records.</div>';
    box.hidden = false;
    qsa("[data-search-index]", box).forEach((button) => button.onclick = () => {
      const hit = hits[Number(button.dataset.searchIndex)];
      if (!hit) return;
      box.hidden = true;
      $("globalSearch").value = "";
      if (hit.type === "endpoint") openEndpointModal(hit.id);
      if (hit.type === "incident") { openPage("incidents"); setTimeout(()=>openTicketModal(hit.id),0); }
      if (hit.type === "asset") { openPage("assets"); setTimeout(()=>openAssetModal(hit.id),0); }
      if (hit.type === "identity") { openPage("identity"); setTimeout(()=>openIdentityModal(hit.id),0); }
      if (hit.type === "vlan") openPage("documentation");
    });
  }

  $("globalSearch").addEventListener("input", (event) => renderGlobalSearch(event.target.value));
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".global-search-wrap")) $("searchResults").hidden = true;
  });

  function setAuthMessage(message, tone = "") {
    const box = $("authMessage");
    if (!box) return;
    const original = String(message || "");
    const userMessage = /failed to fetch|networkerror|load failed/i.test(original)
      ? "Cannot reach Supabase. Check your mobile connection and, in Brave, disable Shields for this trusted site before retrying."
      : original;
    box.textContent = userMessage;
    box.className = "auth-message" + (tone ? " " + tone : "");
  }

  function applyRoleAccess() {
    document.body.dataset.role = cloudRole;
    for (const id of ["staffAccessOpen", "employeeAccessOpen", "inviteEmployeeOpen"]) if ($(id)) $(id).hidden = !window.OpsFusionCloud?.isWorkspaceOwner?.();
    const readOnly = cloudRole === "viewer" || !window.OpsFusionCloud?.isCloudActive?.();
    const mutatingIds = [
      "addEndpointBtn","addAssetBtn","provisionUserBtn","runDiagBtn","diagCreateIncidentBtn",
      "addVlanBtn","addPortBtn","addChangeNoteBtn","evaluateComplianceBtn","newIncidentBtn",
      "saveRulesBtn","saveWorkflowSettingsBtn","addMaintenanceTaskBtn","addKnowledgeBtn"
    ];
    mutatingIds.forEach((id) => { if ($(id)) $(id).disabled = readOnly; });
    qsa("[data-remote-action],[data-remediate]").forEach((el) => {
      if (readOnly) el.disabled = true;
    });
    // Viewers may close a modal but cannot activate any record-changing modal button.
    qsa("#modalBody button").forEach((el) => {
      if (readOnly && !["mCancel","mKbClose"].includes(el.id)) el.disabled = true;
    });
    // Unconnected cloud workspaces cannot execute simulated diagnostics or
    // remote actions, regardless of their database role.

      if ($("runDiagBtn")) $("runDiagBtn").disabled = true;
      if ($("evaluateComplianceBtn")) $("evaluateComplianceBtn").disabled = true;
      qsa("[data-remote-action]").forEach((el) => { el.disabled = true; });

  }

  function updateModeUI(mode, role = "signed-out") {
    const cloud = mode === "cloud";
    if ($("workspaceModeLabel")) $("workspaceModeLabel").textContent = "CLOUD WORKSPACE";
    if ($("persistenceModeLabel")) $("persistenceModeLabel").textContent = "SUPABASE";
    showSaveStatus(cloud ? "Loaded from Supabase" : "Sign in required");
    if ($("accessModeLabel")) $("accessModeLabel").textContent = String(role).toUpperCase();
    if ($("heroPersistenceLabel")) $("heroPersistenceLabel").textContent = "Supabase records";
    if ($("agentStatusLabel")) $("agentStatusLabel").textContent = "NOT CONNECTED";
    if ($("agentStatusDetail")) $("agentStatusDetail").textContent = "No live telemetry";
    if ($("signalTitle")) $("signalTitle").textContent = "SUPABASE WORKSPACE RECORDS";
    if ($("actionModelLabel")) $("actionModelLabel").textContent = "Database records only";
    if ($("refreshCloudBtn")) $("refreshCloudBtn").hidden = !cloud;
    const controlSignal = document.querySelector(".system-strip .signal-dot");
    if (controlSignal) controlSignal.classList.remove("live");
  }

  function showCloudIdentity(user, role) {
    cloudRole = role || "viewer";
    if ($("cloudUser")) $("cloudUser").hidden = false;
    if ($("cloudUserLabel")) $("cloudUserLabel").textContent = user?.email || "Cloud user";
    if ($("cloudRoleLabel")) $("cloudRoleLabel").textContent = cloudRole;
    updateModeUI("cloud", cloudRole);
    applyRoleAccess();
  }

  async function bootstrapCloud(displayName = "", preferredWorkspaceId) {
    if (!window.OpsFusionCloud?.available) throw new Error("Supabase client is unavailable.");
    const result = await window.OpsFusionCloud.bootstrap(emptyCloudState(), displayName, preferredWorkspaceId);
    workspaceSessionEpoch += 1;

    state = result.state && typeof result.state === "object" ? result.state : emptyCloudState();
    state.audit = result.audit || [];
    migrateUnifiedState();
    currentEndpointId = state.endpoints[0] ? state.endpoints[0].id : null;
    selectedDiagnosticId = null;
    $("authGate").hidden = true;
    showCloudIdentity(result.user, result.role);
    const picker=$("staffWorkspaceSelect");
    picker.innerHTML=result.workspaces.map(w=>'<option value="'+esc(w.id)+'">'+esc(w.name)+'</option>').join('');
    picker.value=result.workspaceId;
    picker.disabled=result.workspaces.length<2;
    renderAll();
    window.OpsFusionStaff?.refresh();
    window.OpsFusionEmployeeAccounts?.refresh();
    toast("Cloud workspace connected", result.workspaceName + " · " + result.role);
  }

  $("refreshCloudBtn").addEventListener("click", async () => {
    if (!window.OpsFusionCloud?.isCloudActive?.()) {
      toast("Sign in required", "Only a signed-in cloud workspace can refresh Supabase data.");
      return;
    }
    const button = $("refreshCloudBtn");
    button.disabled = true;
    try {
      await workspaceCommitQueue;
      if (cloudSavePending) {
        clearTimeout(cloudSaveTimer);
        cloudSaveTimer = null;
        cloudSavePending = false;
        await cloudSavePromise;
        await window.OpsFusionCloud.saveWorkspace(state);
      } else {
        await cloudSavePromise;
      }
      const latest = await window.OpsFusionCloud.refreshWorkspace();
      state = latest.state && typeof latest.state === "object" ? latest.state : emptyCloudState();
      state.audit = latest.audit || [];

      migrateUnifiedState();
      currentEndpointId = state.endpoints[0]?.id || null;
      selectedDiagnosticId = null;
      renderAll();
      window.OpsFusionStaff?.refresh();
      window.OpsFusionEmployeeAccounts?.refresh();
      toast("Cloud records refreshed", "Loaded the latest saved records from Supabase.");
    } catch (error) {
      toast("Refresh failed", error.message || "Unable to contact Supabase.");
    } finally {
      button.disabled = false;
    }
  });

  function showRecoveryPasswordForm() {
    $("signInForm").hidden = true;
    $("signUpForm").hidden = true;
    $("resetPasswordForm").hidden = false;
    qsa("[data-auth-tab]").forEach((button) => button.classList.remove("active"));
    $("authGate").hidden = false;
    setAuthMessage("Email recovery link accepted. Choose a new password with 12 or more characters.", "success");
  }

  window.addEventListener("opsfusion-password-recovery", showRecoveryPasswordForm);

  window.addEventListener("opsfusion-session-ended", () => {
    workspaceSessionEpoch += 1;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
    cloudSavePending = false;
    cloudSavePromise = Promise.resolve();

    state = emptyCloudState();
    cloudRole = "signed-out";
    if ($("cloudUser")) $("cloudUser").hidden = true;
    if ($("authGate")) $("authGate").hidden = false;
    updateModeUI("signed-out", "signed-out");
    setAuthMessage("Your cloud session has ended. Sign in to access your saved records.");
    renderAll();
  });

  async function initCloudAuth() {
    if (!window.OpsFusionCloud?.available) {
      setAuthMessage("Cloud client could not load. Check your connection and reload the page.", "error");
      return;
    }
    try {
      const session = await window.OpsFusionCloud.init();
      if (window.OpsFusionCloud.isPasswordRecovery()) {
        if (session) showRecoveryPasswordForm();
        else setAuthMessage("Password recovery link is invalid or expired. Request a new email.", "error");
        return;
      }
      if (session) {
        setAuthMessage("Restoring your Supabase workspace...");
        await bootstrapCloud();
      }
    } catch (error) {
      console.error("Cloud initialization failed:", error);
      setAuthMessage(error.message || "Could not restore the cloud session.", "error");
    }
  }

  qsa("[data-auth-tab]").forEach((button) => button.addEventListener("click", () => {
    qsa("[data-auth-tab]").forEach((b) => b.classList.toggle("active", b === button));
    const signup = button.dataset.authTab === "signup";
    $("signInForm").hidden = signup;
    $("signUpForm").hidden = !signup;
    $("resetPasswordForm").hidden = true;
    setAuthMessage(signup ? "Register an account, then ask your owner to authorize IT access." : "Sign in to load your persistent OpsFusion workspace.");
  }));

  $("forgotPasswordBtn").addEventListener("click", async () => {
    const email = $("authEmail").value.trim();
    if (!email || !$("authEmail").checkValidity()) {
      setAuthMessage("Enter a valid account email address in the Sign In form first.", "error");
      return;
    }
    const button = $("forgotPasswordBtn");
    button.disabled = true;
    try {
      await window.OpsFusionCloud.requestPasswordReset(email);
      setAuthMessage("If that address has an account, a reset email will be sent. Open it on this device.", "success");
    } catch (error) {
      setAuthMessage(error.message || "Unable to send password reset email.", "error");
    } finally {
      button.disabled = false;
    }
  });

  $("resetPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("recoveryPassword").value;
    if (password.length < 12 || password !== $("recoveryPasswordConfirm").value) {
      setAuthMessage("Use 12 or more characters and ensure both passwords match.", "error");
      return;
    }
    try {
      await window.OpsFusionCloud.changePassword(password);
      $("recoveryPassword").value = "";
      $("recoveryPasswordConfirm").value = "";
      window.OpsFusionCloud.completePasswordRecovery();
      setAuthMessage("Password updated. Loading your cloud workspace...", "success");
      await bootstrapCloud();
    } catch (error) {
      setAuthMessage(error.message || "Unable to update the password.", "error");
    }
  });

  $("signInForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    setAuthMessage("Signing in...");
    try {
      await window.OpsFusionCloud.signIn($("authEmail").value.trim(), $("authPassword").value);
      await bootstrapCloud();
    } catch (error) {
      setAuthMessage(error.message || "Sign-in failed.", "error");
    }
  });

  $("signUpForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const displayName = $("authDisplayName").value.trim();
    setAuthMessage("Creating account...");
    try {
      const result = await window.OpsFusionCloud.signUp(
        $("authSignupEmail").value.trim(),
        $("authSignupPassword").value,
        displayName
      );
      if (result.session) {
        await bootstrapCloud(displayName);
      } else {
        setAuthMessage("Account created. Check your email for the confirmation link, then return here and sign in.", "success");
      }
    } catch (error) {
      setAuthMessage(error.message || "Account creation failed.", "error");
    }
  });

  $("cloudChangePasswordBtn").addEventListener("click", () => {
    if (!window.OpsFusionCloud?.isCloudActive?.()) {
      toast("Sign in required", "Open your cloud workspace before changing your password.");
      return;
    }
    showModal("Change your OpsFusion password",
      '<div class="form-grid">' +
      '<label class="field"><span>New password (12 or more characters)</span><input id="mPassNew" type="password" autocomplete="new-password" minlength="12" required></label>' +
      '<label class="field"><span>Confirm new password</span><input id="mPassConfirm" type="password" autocomplete="new-password" minlength="12" required></label>' +
      '</div>' +
      '<p class="auth-footnote">Your password is managed by Supabase Auth, not stored in OpsFusion workspace data.</p>' +
      '<div class="modal-actions"><button type="button" class="btn secondary" id="mPassCancel">Cancel</button>' +
      '<button type="button" class="btn secondary" id="mPassSave">Update Password</button></div>',
      () => {
        $("mPassCancel").onclick = closeModal;
        $("mPassSave").onclick = async () => {
          const next = $("mPassNew").value;
          const confirmNext = $("mPassConfirm").value;
          if (next.length < 12) { toast("Password too short", "Use at least 12 characters."); return; }
          if (next !== confirmNext) { toast("Passwords differ", "Please enter the same password twice."); return; }
          const button = $("mPassSave");
          button.disabled = true;
          try {
            await window.OpsFusionCloud.changePassword(next);
            $("mPassNew").value = "";
            $("mPassConfirm").value = "";
            closeModal();
            toast("Password updated", "Your OpsFusion account password has been changed.");
          } catch (error) {
            toast("Password update failed", error.message || "Please try again.");
          } finally {
            button.disabled = false;
          }
        };
      }
    );
  });

  $("cloudSignOutBtn").addEventListener("click", async () => {
    const button = $("cloudSignOutBtn");
    button.disabled = true;
    try {
      await workspaceCommitQueue;
      if (cloudSavePending) {
        clearTimeout(cloudSaveTimer);
        cloudSaveTimer = null;
        cloudSavePending = false;
        await cloudSavePromise;
        await window.OpsFusionCloud.saveWorkspace(state);
        showSaveStatus("Saved to Supabase");
      } else {
        await cloudSavePromise;
      }
      await window.OpsFusionCloud.signOut();
    } catch (error) {
      console.error(error);
      toast("Sign out paused", "Save or sign-out failed. Your current workspace stays open: " + (error.message || "unknown error"));
      showSaveStatus("Save/sign-out failed — retry", true);
      button.disabled = false;
      return;
    }
    button.disabled = false;
    clearTimeout(cloudSaveTimer);
    cloudSaveTimer = null;
    cloudSavePending = false;

    state = emptyCloudState();
    cloudRole = "signed-out";
    $("cloudUser").hidden = true;
    $("authGate").hidden = false;
    updateModeUI("signed-out", "signed-out");
    setAuthMessage("Signed out. Sign in again or open the Employee Support Portal.");
    applyRoleAccess();
  });

  window.addEventListener("opsfusion:staff-updated",()=>{renderIncidents();renderAudit();});
  $("staffWorkspaceSelect").addEventListener("change",async()=>{
    const picker=$("staffWorkspaceSelect"),previous=window.OpsFusionCloud.getWorkspaceId(),next=picker.value;
    picker.disabled=true;
    try {
      await workspaceCommitQueue;await cloudSavePromise;
      if(cloudSavePending)throw new Error("Wait for pending changes to save before switching workspaces.");
      await bootstrapCloud("",next);
    } catch(error){picker.value=previous;picker.disabled=false;toast("Workspace switch failed",error.message);}
  });

  function renderAll() {
    renderOverview();
    renderEndpoints();
    renderAssets();
    renderIdentity();
    renderTroubleshooting();
    renderRemote();
    renderDocumentation();
    renderCompliance();
    renderIncidents();
    renderAudit();
    renderSettings();
  }

  migrateUnifiedState();
  saveState();
  renderAll();
  updateModeUI("signed-out", "signed-out");
  applyRoleAccess();
  initCloudAuth();
  try {
    const initialCidr = calculateCidr($("cidrInput").value);
    $("cidrOutput").innerHTML =
      '<div><span>Network</span><strong>' + esc(initialCidr.network) + '</strong></div>' +
      '<div><span>Subnet mask</span><strong>' + esc(initialCidr.mask) + '</strong></div>' +
      '<div><span>Broadcast</span><strong>' + esc(initialCidr.broadcast) + '</strong></div>' +
      '<div><span>Usable hosts</span><strong>' + esc(initialCidr.usable) + "</strong></div>";
  } catch (_) {}
})();
