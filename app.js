(() => {
  "use strict";

  const STORAGE_KEY = "opsfusion_unified_v1";
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
    compliance: ["Endpoint posture", "Compliance"],
    incidents: ["IT service management", "Service Desk"],
    audit: ["Governance", "Audit Log"],
    settings: ["Configuration", "Settings"]
  };

  function seedState() {
    const stamp = now();
    return {
      meta: {
        version: 1,
        workspaceName: "OpsFusion Unified",
        createdAt: stamp,
        updatedAt: stamp
      },
      settings: {
        autoTicketCompliance: false,
        autoTicketDiagnostic: false
      },
      complianceRules: {
        maxMissingUpdates: 0,
        maxRebootAge: 14,
        requireFirewall: true,
        requireBitlocker: true,
        requireAv: true
      },
      endpoints: [
        {
          id: "EP-001", hostname: "HQ-FIN-01", ip: "10.20.10.21", mac: "00:1A:2B:3C:10:21",
          site: "HQ", type: "Workstation", os: "Windows 11 24H2", model: "Dell OptiPlex 7010",
          owner: "Finance", agent: "online", lastSeen: stamp, gateway: "10.20.10.1", dns: "10.20.10.53",
          updatesMissing: 0, av: "healthy", firewall: true, bitlocker: true, rebootAge: 3,
          cpu: 22, memory: 54, disk: 63, complianceManaged: true, issue: "healthy"
        },
        {
          id: "EP-002", hostname: "HQ-HR-02", ip: "10.20.10.34", mac: "00:1A:2B:3C:10:34",
          site: "HQ", type: "Workstation", os: "Windows 11 24H2", model: "HP EliteDesk 800 G9",
          owner: "HR", agent: "online", lastSeen: stamp, gateway: "10.20.10.1", dns: "10.20.10.53",
          updatesMissing: 2, av: "healthy", firewall: true, bitlocker: true, rebootAge: 19,
          cpu: 31, memory: 67, disk: 72, complianceManaged: true, issue: "dns"
        },
        {
          id: "EP-003", hostname: "BR-WS-01", ip: "10.30.20.15", mac: "00:1A:2B:4D:20:15",
          site: "Branch", type: "Workstation", os: "Windows 11 23H2", model: "Lenovo ThinkCentre M80s",
          owner: "Sales", agent: "online", lastSeen: stamp, gateway: "10.30.20.1", dns: "10.30.20.10",
          updatesMissing: 1, av: "stale", firewall: false, bitlocker: true, rebootAge: 9,
          cpu: 44, memory: 71, disk: 58, complianceManaged: true, issue: "gateway"
        },
        {
          id: "EP-004", hostname: "BR-LAP-03", ip: "10.30.20.44", mac: "00:1A:2B:4D:20:44",
          site: "Branch", type: "Laptop", os: "Windows 11 24H2", model: "Dell Latitude 5450",
          owner: "Operations", agent: "offline", lastSeen: "2026-09-22T02:14:00.000Z", gateway: "10.30.20.1", dns: "10.30.20.10",
          updatesMissing: 0, av: "healthy", firewall: true, bitlocker: false, rebootAge: 5,
          cpu: 0, memory: 0, disk: 48, complianceManaged: true, issue: "offline"
        },
        {
          id: "EP-005", hostname: "HQ-SRV-AD01", ip: "10.20.30.10", mac: "00:1A:2B:3C:30:10",
          site: "HQ", type: "Server", os: "Windows Server 2025", model: "PowerEdge R350",
          owner: "Infrastructure", agent: "online", lastSeen: stamp, gateway: "10.20.30.1", dns: "10.20.30.10",
          updatesMissing: 0, av: "healthy", firewall: true, bitlocker: true, rebootAge: 8,
          cpu: 18, memory: 61, disk: 69, complianceManaged: true, issue: "port"
        },
        {
          id: "NET-001", hostname: "HQ-GW-01", ip: "10.20.10.1", mac: "00:AA:10:20:00:01",
          site: "HQ", type: "Router", os: "IOS XE", model: "Cisco ISR 4331",
          owner: "Network Team", agent: "online", lastSeen: stamp, gateway: "", dns: "10.20.10.53",
          updatesMissing: 0, av: "n/a", firewall: true, bitlocker: true, rebootAge: 1,
          cpu: 17, memory: 42, disk: 35, complianceManaged: false, issue: "healthy"
        },
        {
          id: "NET-002", hostname: "HQ-SW-01", ip: "10.20.10.2", mac: "00:AA:10:20:00:02",
          site: "HQ", type: "Switch", os: "IOS XE", model: "Catalyst 9200L",
          owner: "Network Team", agent: "online", lastSeen: stamp, gateway: "10.20.10.1", dns: "10.20.10.53",
          updatesMissing: 0, av: "n/a", firewall: true, bitlocker: true, rebootAge: 1,
          cpu: 14, memory: 39, disk: 31, complianceManaged: false, issue: "healthy"
        }
      ],
      vlans: [
        { id: "VLAN-10-HQ", site: "HQ", vlan: 10, name: "Users", cidr: "10.20.10.0/24", gateway: "10.20.10.1", dns: "10.20.10.53" },
        { id: "VLAN-30-HQ", site: "HQ", vlan: 30, name: "Servers", cidr: "10.20.30.0/24", gateway: "10.20.30.1", dns: "10.20.30.10" },
        { id: "VLAN-20-BR", site: "Branch", vlan: 20, name: "Branch Users", cidr: "10.30.20.0/24", gateway: "10.30.20.1", dns: "10.30.20.10" }
      ],
      ports: [
        { id: "PORT-001", switch: "HQ-SW-01", port: "Gi1/0/3", endpointId: "EP-001", vlan: 10 },
        { id: "PORT-002", switch: "HQ-SW-01", port: "Gi1/0/7", endpointId: "EP-002", vlan: 10 },
        { id: "PORT-003", switch: "HQ-SW-01", port: "Gi1/0/24", endpointId: "NET-001", vlan: 10 }
      ],
      docChanges: [
        { id: "DOC-001", detail: "Initial HQ and Branch network documentation baseline.", createdAt: stamp }
      ],
      diagnostics: [],
      remoteActions: [],
      identities: [
        { id:"USR-001", firstName:"Adrian", lastName:"Reyes", displayName:"Adrian Reyes", username:"areyes", upn:"areyes@corp.local", department:"Finance", title:"Finance Analyst", manager:"Finance Manager", status:"Active", enabled:true, templateId:"TPL-FIN", groups:["GRP-ALL","GRP-FIN"], expiry:"", mustResetPassword:false, createdAt:"2025-01-16T08:00:00.000Z" },
        { id:"USR-002", firstName:"Nico", lastName:"Cruz", displayName:"Nico Cruz", username:"ncruz", upn:"ncruz@corp.local", department:"Human Resources", title:"HR Specialist", manager:"HR Manager", status:"Active", enabled:true, templateId:"TPL-HR", groups:["GRP-ALL","GRP-HR"], expiry:"", mustResetPassword:false, createdAt:"2025-03-11T08:00:00.000Z" },
        { id:"USR-003", firstName:"Jim", lastName:"Camus", displayName:"Jim Camus", username:"jcamus", upn:"jcamus@corp.local", department:"IT", title:"IT Support Specialist", manager:"IT Operations Manager", status:"Active", enabled:true, templateId:"TPL-IT", groups:["GRP-ALL","GRP-HELP","GRP-VPN"], expiry:"", mustResetPassword:false, createdAt:"2024-11-03T08:00:00.000Z" },
        { id:"USR-004", firstName:"Marco", lastName:"Santos", displayName:"Marco Santos", username:"msantos", upn:"msantos@corp.local", department:"Operations", title:"Operations Coordinator", manager:"Operations Manager", status:"Active", enabled:true, templateId:"TPL-OPS", groups:["GRP-ALL","GRP-OPS","GRP-VPN"], expiry:"", mustResetPassword:false, createdAt:"2025-05-18T08:00:00.000Z" },
        { id:"USR-005", firstName:"Daniel", lastName:"Lee", displayName:"Daniel Lee", username:"dlee", upn:"dlee@corp.local", department:"Sales", title:"Account Executive", manager:"Sales Manager", status:"Active", enabled:true, templateId:"TPL-STD", groups:["GRP-ALL"], expiry:"", mustResetPassword:false, createdAt:"2024-12-08T08:00:00.000Z" },
        { id:"USR-006", firstName:"Miguel", lastName:"Torres", displayName:"Miguel Torres", username:"mtorres", upn:"mtorres@corp.local", department:"Marketing", title:"Marketing Associate", manager:"Marketing Manager", status:"Disabled", enabled:false, templateId:"TPL-STD", groups:["GRP-ALL"], expiry:"", mustResetPassword:false, createdAt:"2025-02-20T08:00:00.000Z" },
        { id:"USR-007", firstName:"Paolo", lastName:"Garcia", displayName:"Paolo Garcia", username:"pgarcia", upn:"pgarcia@corp.local", department:"Finance", title:"Finance Contractor", manager:"Finance Manager", status:"Active", enabled:true, templateId:"TPL-FIN", groups:["GRP-ALL","GRP-FIN"], expiry:"2026-10-11", mustResetPassword:true, createdAt:"2026-09-01T08:00:00.000Z" },
        { id:"USR-008", firstName:"Leo", lastName:"Ramos", displayName:"Leo Ramos", username:"lramos", upn:"lramos@corp.local", department:"Operations", title:"Operations Associate", manager:"Operations Manager", status:"Offboarded", enabled:false, templateId:"TPL-OPS", groups:[], expiry:"", mustResetPassword:false, createdAt:"2024-08-01T08:00:00.000Z" }
      ],
      groups: [
        { id:"GRP-ALL", name:"GG-All-Employees", type:"Security", owner:"IT Operations", risk:"Low", permission:"Baseline employee resources" },
        { id:"GRP-FIN", name:"GG-Finance-Share-RW", type:"Security", owner:"Finance", risk:"Medium", permission:"Finance shared-drive modify access" },
        { id:"GRP-HR", name:"GG-HR-Confidential-RW", type:"Security", owner:"Human Resources", risk:"High", permission:"HR confidential records modify access" },
        { id:"GRP-HELP", name:"GG-IT-HelpDesk", type:"Security", owner:"IT Operations", risk:"Medium", permission:"Help desk tools and support resources" },
        { id:"GRP-ADMIN", name:"GG-IT-Admins", type:"Security", owner:"Infrastructure", risk:"High", permission:"Privileged administration" },
        { id:"GRP-OPS", name:"GG-Operations-Apps", type:"Security", owner:"Operations", risk:"Medium", permission:"Operations application access" },
        { id:"GRP-VPN", name:"GG-VPN-Users", type:"Security", owner:"Infrastructure", risk:"Medium", permission:"Remote-access entitlement" }
      ],
      templates: [
        { id:"TPL-STD", name:"Standard Employee", department:"Corporate", groups:["GRP-ALL"], description:"Baseline employee identity" },
        { id:"TPL-FIN", name:"Finance User", department:"Finance", groups:["GRP-ALL","GRP-FIN"], description:"Finance resources and shared-drive access" },
        { id:"TPL-HR", name:"HR User", department:"Human Resources", groups:["GRP-ALL","GRP-HR"], description:"HR confidential-resource access" },
        { id:"TPL-IT", name:"IT Support", department:"IT", groups:["GRP-ALL","GRP-HELP","GRP-VPN"], description:"Help desk and remote-support access" },
        { id:"TPL-ADMIN", name:"IT Administrator", department:"IT", groups:["GRP-ALL","GRP-HELP","GRP-ADMIN","GRP-VPN"], description:"Privileged infrastructure administration" },
        { id:"TPL-OPS", name:"Operations User", department:"Operations", groups:["GRP-ALL","GRP-OPS"], description:"Operations application access" }
      ],
      technicians: [
        { id:"TECH-01", name:"Jim Camus", role:"Administrator", specialty:"Network / Endpoint", identityId:"USR-003" },
        { id:"TECH-02", name:"Kevin Lim", role:"Technician", specialty:"Endpoint / Hardware", identityId:"" },
        { id:"TECH-03", name:"Ryan Mendoza", role:"Technician", specialty:"Microsoft 365 / Access", identityId:"" }
      ],
      assets: [
        { id:"AST-1001", tag:"AST-1001", hostname:"HQ-FIN-01", type:"Workstation", serial:"DEL-7010-F01", status:"Assigned", assignedUserId:"USR-001", endpointId:"EP-001", department:"Finance", location:"HQ · Finance", purchaseDate:"2025-01-16", warrantyExpiry:"2027-01-16", specs:"Dell OptiPlex 7010 · Windows 11 24H2" },
        { id:"AST-1002", tag:"AST-1002", hostname:"HQ-HR-02", type:"Workstation", serial:"HP-800G9-H02", status:"Assigned", assignedUserId:"USR-002", endpointId:"EP-002", department:"Human Resources", location:"HQ · HR", purchaseDate:"2024-07-04", warrantyExpiry:"2026-10-31", specs:"HP EliteDesk 800 G9 · Windows 11 24H2" },
        { id:"AST-1003", tag:"AST-1003", hostname:"BR-WS-01", type:"Workstation", serial:"LNV-M80S-B01", status:"Assigned", assignedUserId:"USR-005", endpointId:"EP-003", department:"Sales", location:"Branch · Sales", purchaseDate:"2024-04-22", warrantyExpiry:"2027-04-22", specs:"Lenovo ThinkCentre M80s · Windows 11 23H2" },
        { id:"AST-1004", tag:"AST-1004", hostname:"BR-LAP-03", type:"Laptop", serial:"DEL-5450-B03", status:"Assigned", assignedUserId:"USR-004", endpointId:"EP-004", department:"Operations", location:"Branch · Operations", purchaseDate:"2025-02-18", warrantyExpiry:"2028-02-18", specs:"Dell Latitude 5450 · Windows 11 24H2" },
        { id:"AST-1005", tag:"AST-1005", hostname:"HQ-SRV-AD01", type:"Server", serial:"DEL-R350-AD01", status:"Assigned", assignedUserId:"USR-003", endpointId:"EP-005", department:"IT", location:"HQ · Server Room", purchaseDate:"2025-05-10", warrantyExpiry:"2029-05-10", specs:"PowerEdge R350 · Windows Server 2025" },
        { id:"AST-1006", tag:"AST-1006", hostname:"HQ-GW-01", type:"Router", serial:"CSC-4331-GW01", status:"Assigned", assignedUserId:"USR-003", endpointId:"NET-001", department:"IT", location:"HQ · MDF", purchaseDate:"2025-05-10", warrantyExpiry:"2029-05-10", specs:"Cisco ISR 4331 · IOS XE" },
        { id:"AST-1007", tag:"AST-1007", hostname:"HQ-SW-01", type:"Switch", serial:"CSC-9200-SW01", status:"Assigned", assignedUserId:"USR-003", endpointId:"NET-002", department:"IT", location:"HQ · MDF", purchaseDate:"2025-05-10", warrantyExpiry:"2029-05-10", specs:"Catalyst 9200L · IOS XE" },
        { id:"AST-1008", tag:"AST-1008", hostname:"SPARE-LT-02", type:"Laptop", serial:"ACR-SWIFT-02", status:"Available", assignedUserId:"", endpointId:"", department:"IT", location:"HQ · IT Stockroom", purchaseDate:"2025-08-20", warrantyExpiry:"2028-08-20", specs:"Acer Swift · Windows 11 Pro" },
        { id:"AST-1009", tag:"AST-1009", hostname:"PRN-FIN-01", type:"Printer", serial:"HP-M428-11", status:"In Repair", assignedUserId:"", endpointId:"", department:"Finance", location:"HQ · IT Repair Bench", purchaseDate:"2023-09-11", warrantyExpiry:"2026-04-11", specs:"HP LaserJet Pro M428 · Ethernet" }
      ],
      maintenance: [
        { id:"MNT-001", assetId:"AST-1009", type:"Hardware Repair", status:"In Progress", owner:"Kevin Lim", dueDate:"2026-09-25", detail:"Printer hardware fault after paper jam." },
        { id:"MNT-002", assetId:"AST-1002", type:"Patch / Reboot", status:"Scheduled", owner:"Jim Camus", dueDate:"2026-09-24", detail:"Install missing updates and restart outside business hours." }
      ],
      software: [
        { assetId:"AST-1001", name:"Microsoft 365 Apps", version:"Current Channel", status:"Approved" },
        { assetId:"AST-1001", name:"Endpoint Security Agent", version:"6.4", status:"Healthy" },
        { assetId:"AST-1002", name:"Microsoft 365 Apps", version:"Current Channel", status:"Approved" },
        { assetId:"AST-1002", name:"Endpoint Security Agent", version:"6.4", status:"Healthy" },
        { assetId:"AST-1003", name:"Endpoint Security Agent", version:"6.2", status:"Review" },
        { assetId:"AST-1004", name:"VPN Client", version:"5.1", status:"Approved" }
      ],
      knowledge: [
        { id:"KB-001", title:"DNS resolution troubleshooting checklist", category:"Network", summary:"Validate local resolver, gateway reachability, cache, and authoritative response path." },
        { id:"KB-002", title:"Windows endpoint compliance remediation", category:"Endpoint", summary:"Remediate missing updates, stale AV, firewall, encryption, and reboot-age findings." },
        { id:"KB-003", title:"Account lockout and stale credential workflow", category:"Identity", summary:"Identify lockout source, clear cached credentials, validate devices, and confirm access." },
        { id:"KB-004", title:"VPN authentication after password reset", category:"Access", summary:"Refresh cached credentials, verify account state, group membership, and VPN entitlement." },
        { id:"KB-005", title:"Printer outage triage", category:"Hardware", summary:"Check queue/spooler, device status, network reachability, consumables, and hardware error state." }
      ],
      incidents: [
        {
          id: "INC-1001", endpointId: "EP-002", title: "HR workstation cannot resolve internal names",
          priority: "P2", status: "Active", source: "Troubleshooting", createdAt: stamp
        },
        {
          id: "INC-1002", endpointId: "EP-004", title: "Branch laptop agent offline",
          priority: "P3", status: "Pending", source: "Monitoring", createdAt: stamp
        }
      ],
      audit: [
        { id: "AUD-001", module: "System", action: "Workspace initialized", target: "OpsFusion", detail: "Unified shared-data workspace created.", createdAt: stamp }
      ]
    };
  }

  function loadState() {
    const base = seedState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.endpoints)) return base;
      return {
        ...base,
        ...parsed,
        meta: { ...base.meta, ...(parsed.meta || {}) },
        settings: { ...base.settings, ...(parsed.settings || {}) },
        complianceRules: { ...base.complianceRules, ...(parsed.complianceRules || {}) },
        endpoints: Array.isArray(parsed.endpoints) ? parsed.endpoints : base.endpoints,
        vlans: Array.isArray(parsed.vlans) ? parsed.vlans : base.vlans,
        ports: Array.isArray(parsed.ports) ? parsed.ports : base.ports,
        docChanges: Array.isArray(parsed.docChanges) ? parsed.docChanges : base.docChanges,
        diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [],
        remoteActions: Array.isArray(parsed.remoteActions) ? parsed.remoteActions : [],
        identities: Array.isArray(parsed.identities) ? parsed.identities : base.identities,
        groups: Array.isArray(parsed.groups) ? parsed.groups : base.groups,
        templates: Array.isArray(parsed.templates) ? parsed.templates : base.templates,
        technicians: Array.isArray(parsed.technicians) ? parsed.technicians : base.technicians,
        assets: Array.isArray(parsed.assets) ? parsed.assets : base.assets,
        maintenance: Array.isArray(parsed.maintenance) ? parsed.maintenance : base.maintenance,
        software: Array.isArray(parsed.software) ? parsed.software : base.software,
        knowledge: Array.isArray(parsed.knowledge) ? parsed.knowledge : base.knowledge,
        incidents: Array.isArray(parsed.incidents) ? parsed.incidents : base.incidents,
        audit: Array.isArray(parsed.audit) ? parsed.audit : base.audit
      };
    } catch (error) {
      console.warn("Unable to restore OpsFusion workspace:", error);
      return base;
    }
  }

  let state = loadState();
  let cloudRole = "demo";
  let demoMode = false;
  let cloudSaveTimer = null;

  function migrateUnifiedState() {
    const base = seedState();
    ["identities","groups","templates","technicians","assets","maintenance","software","knowledge"].forEach((key) => {
      if (!Array.isArray(state[key])) state[key] = base[key];
    });
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (window.OpsFusionCloud?.isCloudActive?.() && cloudRole !== "viewer") {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = setTimeout(() => {
        window.OpsFusionCloud.saveWorkspace(state).catch((error) => {
          console.error("Cloud save failed:", error);
          toast("Cloud save failed", error.message || "Workspace remains saved in this browser.");
        });
      }, 350);
    }
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

  function templateById(id) {
    return (state.templates || []).find((item) => item.id === id) || null;
  }

  function technicianById(id) {
    return (state.technicians || []).find((item) => item.id === id) || null;
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

  function usernameFor(first, last) {
    const base = ((first || "").trim().slice(0,1) + (last || "").trim()).toLowerCase().replace(/[^a-z0-9]/g, "") || "user";
    const used = new Set((state.identities || []).map((u) => String(u.username || "").toLowerCase()));
    let candidate = base;
    let n = 2;
    while (used.has(candidate)) candidate = base + n++;
    return candidate;
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
    qsa("[data-page]").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
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
    if (page === "compliance") renderCompliance();
    if (page === "incidents") renderIncidents();
    if (page === "audit") renderAudit();
    if (page === "settings") renderSettings();
  }

  function renderOverview() {
    const stats = fleetStats();
    $("kpiEndpoints").textContent = state.endpoints.length;
    $("kpiOnline").textContent = stats.online;
    $("kpiCompliance").textContent = stats.complianceRate + "%";
    $("kpiIncidents").textContent = stats.openIncidents;
    $("kpiDiagnostics").textContent = state.diagnostics.length;
    $("healthScoreHero").textContent = stats.health + "%";
    $("healthLabelHero").textContent = stats.health >= 90 ? "Healthy operations" : stats.health >= 75 ? "Attention required" : "Operational risk";
    $("healthBar").style.width = stats.health + "%";

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
    renderOpsVisuals(stats);
    bindOpenEndpointButtons();
  }

  function renderOpsVisuals(stats) {
    if (!$("healthTrendChart")) return;

    const noncompliant = stats.managed.length - stats.compliant;
    const offline = state.endpoints.filter((e) => e.agent !== "online").length;
    const warrantyRisk = (state.assets || []).filter((a) => {
      const w = warrantyInfo(a);
      return w.days !== null && w.days <= 45;
    }).length;
    const openTickets = state.incidents.filter((i) => !["Resolved","Closed"].includes(i.status)).length;

    // Deterministic telemetry curve derived from the current fleet posture.
    const penalty = Math.min(22, noncompliant * 3 + offline * 4 + openTickets * 2);
    const base = stats.health;
    const offsets = [-7,-4,-6,-2,-1,2,0,3];
    const values = offsets.map((offset, index) =>
      Math.max(18, Math.min(100, base + offset - Math.round(penalty * (7-index) / 24)))
    );
    values[values.length - 1] = base;

    const x0=48, x1=738, y0=24, y1=208;
    const pts = values.map((value,index) => {
      const x=x0 + (x1-x0) * index/(values.length-1);
      const y=y1 - (value/100)*(y1-y0);
      return {x,y,value};
    });
    $("healthTrendLine").setAttribute("points",pts.map(p=>p.x.toFixed(1)+","+p.y.toFixed(1)).join(" "));
    $("healthTrendArea").setAttribute("d","M "+pts[0].x.toFixed(1)+" "+y1+" L "+pts.map(p=>p.x.toFixed(1)+" "+p.y.toFixed(1)).join(" L ")+" L "+pts[pts.length-1].x.toFixed(1)+" "+y1+" Z");
    $("healthTrendPoints").innerHTML=pts.map(p=>'<circle class="trend-point" cx="'+p.x.toFixed(1)+'" cy="'+p.y.toFixed(1)+'" r="4"><title>'+p.value+'% health</title></circle>').join("");
    const labels=["−7h","−6h","−5h","−4h","−3h","−2h","−1h","Now"];
    $("healthTrendDates").innerHTML=pts.map((p,i)=>'<text x="'+p.x.toFixed(1)+'" y="219">'+labels[i]+'</text>').join("");

    const riskItems = [
      {label:"Open tickets", value:openTickets, cls:"rk1"},
      {label:"Non-compliant", value:noncompliant, cls:"rk2"},
      {label:"Offline agents", value:offline, cls:"rk3"},
      {label:"Warranty risk", value:warrantyRisk, cls:"rk4"}
    ];
    const totalRisk = Math.max(1,riskItems.reduce((sum,item)=>sum+item.value,0));
    const riskIndex = Math.min(100,Math.round((100-stats.health)*.7 + Math.min(30,totalRisk*3)));
    $("riskScoreValue").textContent=riskIndex;
    $("riskKey").innerHTML=riskItems.map(item =>
      '<div class="risk-key-row"><i class="'+item.cls+'"></i><span>'+esc(item.label)+'</span><b>'+item.value+'</b></div>'
    ).join("");

    let cursor=0;
    const colors=["var(--coral)","var(--yellow)","var(--cyan)","var(--acid)"];
    const segments=riskItems.map((item,i)=>{
      const start=cursor;
      const size=(item.value/totalRisk)*100;
      cursor+=size;
      return colors[i]+" "+start.toFixed(1)+"% "+cursor.toFixed(1)+"%";
    });
    $("riskDonut").style.background="conic-gradient("+segments.join(",")+")";

    if ($("fabricTickets")) $("fabricTickets").textContent=openTickets+" open";
    if ($("fabricAssets")) $("fabricAssets").textContent=(state.assets||[]).length+" managed";
    if ($("fabricUsers")) $("fabricUsers").textContent=(state.identities||[]).length+" users";
    if ($("fabricEndpoints")) $("fabricEndpoints").textContent=state.endpoints.length+" devices";
    if ($("fabricDiagnostics")) $("fabricDiagnostics").textContent=state.diagnostics.length+" runs";
    if ($("fabricCompliance")) $("fabricCompliance").textContent=stats.complianceRate+"%";

    const sites={};
    state.endpoints.forEach((e)=>{
      if(!sites[e.site]) sites[e.site]={total:0,online:0,devices:[]};
      sites[e.site].total++;
      if(e.agent==="online") sites[e.site].online++;
      sites[e.site].devices.push(e);
    });
    const maxSite=Math.max(1,...Object.values(sites).map(s=>s.total));
    $("siteVisual").innerHTML=Object.entries(sites).map(([site,row])=>{
      const width=Math.max(8,(row.total/maxSite)*100);
      return '<div class="site-bar-row"><span>'+esc(site)+'</span><div class="site-bar-track"><div class="site-bar-fill" style="width:'+width.toFixed(0)+'%"></div></div><b>'+row.online+'/'+row.total+'</b></div>';
    }).join("")+
    '<div class="site-device-cloud">'+state.endpoints.map(e=>'<span class="'+(e.agent==="online"?"online":"offline")+'" title="'+esc(e.ip)+'">'+esc(e.hostname)+'</span>').join("")+'</div>';
  }

  function uniqueSites() {
    return Array.from(new Set(state.endpoints.map((e) => e.site).filter(Boolean))).sort();
  }

  function fillEndpointSelect(select, selectedId, includeNetwork = true) {
    if (!select) return;
    const current = selectedId || select.value || currentEndpointId;
    const list = includeNetwork ? state.endpoints : state.endpoints.filter((e) => e.complianceManaged !== false);
    select.innerHTML = list.map((e) => '<option value="' + esc(e.id) + '">' + esc(e.hostname + " · " + e.ip) + "</option>").join("");
    if (list.some((e) => e.id === current)) select.value = current;
    else if (list[0]) select.value = list[0].id;
  }

  function renderEndpoints() {
    const siteFilter = $("endpointSiteFilter");
    const previousSite = siteFilter.value;
    siteFilter.innerHTML = '<option value="">All sites</option>' + uniqueSites().map((site) => '<option value="' + esc(site) + '">' + esc(site) + "</option>").join("");
    siteFilter.value = uniqueSites().includes(previousSite) ? previousSite : "";

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
      '<button class="btn secondary" data-modal-page="documentation">Documentation</button>' +
      '<button class="btn secondary" data-modal-page="compliance">Compliance</button>' +
      '<button class="btn secondary" data-modal-page="remote">Remote Support</button>' +
      '<button class="btn primary" data-modal-page="troubleshooting">Troubleshoot</button>' +
      '</div>',
      (root) => {
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
      '<label class="field"><span>IPv4 address</span><input id="mIp" required placeholder="10.20.10.50"></label>' +
      '<label class="field"><span>Site</span><input id="mSite" list="siteList" required placeholder="HQ"><datalist id="siteList">' + sites.map((s) => '<option value="' + esc(s) + '"></option>').join("") + '</datalist></label>' +
      '<label class="field"><span>Type</span><select id="mType"><option>Workstation</option><option>Laptop</option><option>Server</option><option>Router</option><option>Switch</option><option>Access Point</option></select></label>' +
      '<label class="field"><span>Owner</span><input id="mOwner" placeholder="Department / user"></label>' +
      '<label class="field"><span>OS / platform</span><input id="mOs" placeholder="Windows 11 24H2"></label>' +
      '<label class="field"><span>Model</span><input id="mModel" placeholder="Dell OptiPlex"></label>' +
      '<label class="field"><span>Agent</span><select id="mAgent"><option value="online">Online</option><option value="offline">Offline</option></select></label>' +
      '</div><div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Add Endpoint</button></div>',
      (root) => {
        $("mCancel").onclick = closeModal;
        $("mSave").onclick = () => {
          const hostname = $("mHostname").value.trim();
          const ip = $("mIp").value.trim();
          const site = $("mSite").value.trim();
          if (!hostname || !validIp(ip) || !site) {
            toast("Invalid endpoint", "Hostname, valid IPv4 address, and site are required.");
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
            owner: $("mOwner").value.trim() || "Unassigned", agent: $("mAgent").value,
            lastSeen: now(), gateway: "", dns: "", updatesMissing: 0, av: managed ? "healthy" : "n/a",
            firewall: true, bitlocker: true, rebootAge: 0, cpu: 0, memory: 0, disk: 0,
            complianceManaged: managed, issue: "healthy"
          };
          state.endpoints.push(endpoint);
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
    const statuses = Array.from(new Set(state.assets.map((a) => a.status))).sort();
    const types = Array.from(new Set(state.assets.map((a) => a.type))).sort();
    const statusFilter = $("assetStatusFilter");
    const typeFilter = $("assetTypeFilter");
    const prevStatus = statusFilter.value;
    const prevType = typeFilter.value;
    statusFilter.innerHTML = '<option value="">All lifecycle states</option>' + statuses.map((s) => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join("");
    typeFilter.innerHTML = '<option value="">All asset types</option>' + types.map((s) => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join("");
    if (statuses.includes(prevStatus)) statusFilter.value = prevStatus;
    if (types.includes(prevType)) typeFilter.value = prevType;

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

    $("maintenanceRows").innerHTML = state.maintenance.length ? state.maintenance.map((m) => {
      const asset = assetById(m.assetId);
      return '<div class="stack-row"><div><strong>' + esc(m.type + " · " + (asset ? asset.tag : m.assetId)) +
        '</strong><small>' + esc(m.detail + " · Owner " + m.owner + " · Due " + m.dueDate) +
        '</small></div>' + badge(m.status,m.status === "In Progress" ? "amber" : "blue") + '</div>';
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
      '</select></label><label class="field"><span>Assigned user</span><select id="mAssetUser"><option value="">Unassigned</option>' +
      state.identities.filter((u) => u.status === "Active").map((u) => '<option value="' + esc(u.id) + '"' + (u.id===asset.assignedUserId ? " selected" : "") + '>' + esc(u.displayName) + '</option>').join("") +
      '</select></label></div><div class="modal-actions"><button class="btn secondary" id="mAssetTicket">Create Ticket</button><button class="btn primary" id="mAssetSave">Save Asset</button></div>',
      () => {
        $("mAssetSave").onclick = () => {
          const oldStatus = asset.status;
          asset.status = $("mAssetStatus").value;
          asset.assignedUserId = $("mAssetUser").value;
          if (asset.status !== "Assigned") asset.assignedUserId = "";
          if (asset.status === "Assigned" && !asset.assignedUserId) {
            toast("Assignment required","Choose an active user or select another lifecycle state."); return;
          }
          const assigned = identityById(asset.assignedUserId);
          const ep = endpointById(asset.endpointId);
          if (ep) ep.owner = assigned ? assigned.displayName : "Unassigned";
          audit("Assets","Asset updated",asset.tag,oldStatus + " → " + asset.status + (assigned ? " · " + assigned.displayName : ""));
          saveState(); closeModal(); renderAssets(); renderEndpoints(); renderIdentity(); renderOverview();
          toast("Asset updated",asset.tag);
        };
        $("mAssetTicket").onclick = () => {
          createIncident({
            type:"Incident", assetId:asset.id, endpointId:asset.endpointId,
            requesterId:asset.assignedUserId, title:"Asset support required: " + asset.tag + " · " + asset.hostname,
            category:"Hardware / Asset", impact:"Medium", urgency:"Medium", source:"Asset Management"
          });
          closeModal(); toast("Ticket created",asset.tag);
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
        $("mSave").onclick=() => {
          const tag=$("mAssetTag").value.trim(), host=$("mAssetHost").value.trim();
          if(!tag||!host){toast("Missing details","Asset tag and hostname/name are required.");return;}
          if(state.assets.some((a)=>a.tag.toLowerCase()===tag.toLowerCase())){toast("Duplicate tag",tag);return;}
          const endpointId=$("mAssetEndpoint").value;
          const ep=endpointById(endpointId);
          state.assets.push({id:tag,tag,hostname:host,type:$("mAssetType").value,serial:$("mAssetSerial").value.trim()||"—",status:"Available",assignedUserId:"",endpointId,department:$("mAssetDepartment").value.trim()||"IT",location:$("mAssetLocation").value.trim()||"Unspecified",purchaseDate:new Date().toISOString().slice(0,10),warrantyExpiry:$("mAssetWarranty").value,specs:ep ? ep.model+" · "+ep.os : "Portfolio asset record"});
          audit("Assets","Asset added",tag,host + (ep ? " · linked to "+ep.hostname : ""));
          saveState();closeModal();renderAssets();renderOverview();toast("Asset added",tag);
        };
      }
    );
  });

  function renderIdentity() {
    const statuses=Array.from(new Set(state.identities.map((u)=>u.status))).sort();
    const departments=Array.from(new Set(state.identities.map((u)=>u.department))).sort();
    const sf=$("identityStatusFilter"), df=$("identityDepartmentFilter"), ps=sf.value, pd=df.value;
    sf.innerHTML='<option value="">All identity states</option>'+statuses.map((s)=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");
    df.innerHTML='<option value="">All departments</option>'+departments.map((s)=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");
    if(statuses.includes(ps))sf.value=ps;if(departments.includes(pd))df.value=pd;
    const q=$("identitySearch").value.trim().toLowerCase();
    const rows=state.identities.filter((u)=>{
      const hay=[u.displayName,u.username,u.upn,u.department,u.title,u.manager].join(" ").toLowerCase();
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
      return "<tr><td><span class=\"cell-title\">"+esc(u.displayName)+"</span><span class=\"cell-sub\">"+esc(u.upn)+(u.mustResetPassword?" · password reset required":"")+"</span></td>"+
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

  function openIdentityModal(id) {
    const user=identityById(id);if(!user)return;
    const tpl=templateById(user.templateId);
    const assets=state.assets.filter((a)=>a.assignedUserId===user.id);
    const groups=(user.groups||[]).map(groupById).filter(Boolean);
    showModal("Identity · "+user.displayName,
      '<div class="endpoint-card"><h3>'+esc(user.displayName)+'</h3><p>'+esc(user.upn+" · "+user.title)+'</p><div class="endpoint-meta">'+
      '<div><span>Status</span><strong>'+esc(user.status)+'</strong></div><div><span>Department</span><strong>'+esc(user.department)+'</strong></div>'+
      '<div><span>Template</span><strong>'+esc(tpl?tpl.name:"Custom")+'</strong></div><div><span>Manager</span><strong>'+esc(user.manager||"—")+'</strong></div>'+
      '<div><span>Groups</span><strong>'+esc(groups.map((g)=>g.name).join(", ")||"None")+'</strong></div><div><span>Assigned assets</span><strong>'+esc(assets.map((a)=>a.tag).join(", ")||"None")+'</strong></div></div></div>'+
      '<div class="modal-actions"><button class="btn secondary" id="mIdPassword">Require Password Reset</button><button class="btn secondary" id="mIdToggle">'+(user.enabled?"Disable":"Enable")+' Account</button>'+(user.status!=="Offboarded"?'<button class="btn danger" id="mIdOffboard">Offboard</button>':"")+'</div>',
      ()=>{
        $("mIdPassword").onclick=()=>{user.mustResetPassword=true;audit("Identity","Password reset required",user.username,"User must change temporary/reset password at next sign-in.");saveState();closeModal();renderIdentity();toast("Password reset flag set",user.displayName);};
        $("mIdToggle").onclick=()=>{user.enabled=!user.enabled;user.status=user.enabled?"Active":"Disabled";audit("Identity",user.enabled?"Account enabled":"Account disabled",user.username,user.displayName);saveState();closeModal();renderIdentity();renderOverview();toast("Account updated",user.displayName+" · "+user.status);};
        if($("mIdOffboard"))$("mIdOffboard").onclick=()=>offboardIdentity(user);
      }
    );
  }

  function offboardIdentity(user) {
    if(!confirm("Offboard "+user.displayName+" and release assigned assets?"))return;
    const released=state.assets.filter((a)=>a.assignedUserId===user.id);
    user.enabled=false;user.status="Offboarded";user.groups=[];user.mustResetPassword=false;
    released.forEach((a)=>{a.assignedUserId="";a.status="Available";const ep=endpointById(a.endpointId);if(ep)ep.owner="Unassigned";});
    audit("Identity","User offboarded",user.username,user.displayName+" · "+released.length+" asset(s) released.");
    if(released.length)createIncident({type:"Service Request",title:"Validate returned assets for "+user.displayName,category:"Offboarding",impact:"Low",urgency:"Medium",source:"Identity",description:"Review and validate "+released.length+" released asset(s) after offboarding."},true);
    saveState();closeModal();renderIdentity();renderAssets();renderEndpoints();renderIncidents();renderOverview();toast("User offboarded",user.displayName);
  }

  $("identitySearch").addEventListener("input",renderIdentity);
  $("identityStatusFilter").addEventListener("change",renderIdentity);
  $("identityDepartmentFilter").addEventListener("change",renderIdentity);

  $("provisionUserBtn").addEventListener("click",()=>{
    showModal("Provision User",
      '<div class="form-grid"><label class="field"><span>First name</span><input id="mIdFirst"></label><label class="field"><span>Last name</span><input id="mIdLast"></label>'+
      '<label class="field"><span>Role template</span><select id="mIdTemplate">'+state.templates.map((t)=>'<option value="'+esc(t.id)+'">'+esc(t.name+" · "+t.department)+'</option>').join("")+'</select></label>'+
      '<label class="field"><span>Job title</span><input id="mIdTitle" placeholder="Analyst"></label><label class="field"><span>Manager</span><input id="mIdManager"></label>'+
      '<label class="field"><span>Expiry (optional)</span><input id="mIdExpiry" type="date"></label></div>'+
      '<div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Provision</button></div>',
      ()=>{
        $("mCancel").onclick=closeModal;
        $("mSave").onclick=()=>{
          const first=$("mIdFirst").value.trim(),last=$("mIdLast").value.trim(),tpl=templateById($("mIdTemplate").value);
          if(!first||!last||!tpl){toast("Missing details","First name, last name, and template are required.");return;}
          const username=usernameFor(first,last);
          const user={id:uid("USR"),firstName:first,lastName:last,displayName:first+" "+last,username,upn:username+"@corp.local",department:tpl.department==="Corporate"?"General":tpl.department,title:$("mIdTitle").value.trim()||"Employee",manager:$("mIdManager").value.trim()||"Unassigned",status:"Active",enabled:true,templateId:tpl.id,groups:[...tpl.groups],expiry:$("mIdExpiry").value,mustResetPassword:true,createdAt:now()};
          state.identities.push(user);audit("Identity","User provisioned",user.username,user.displayName+" · "+tpl.name);
          createIncident({type:"Service Request",requesterId:user.id,title:"New starter provisioning validation: "+user.displayName,category:"Onboarding",impact:"Low",urgency:"Medium",source:"Identity",description:"Validate access, endpoint assignment, and first-login requirements."},true);
          saveState();closeModal();renderIdentity();renderIncidents();renderOverview();toast("User provisioned",user.upn);
        };
      }
    );
  });

  function renderTroubleshooting() {
    fillEndpointSelect($("diagEndpoint"), currentEndpointId, true);
    if ($("diagEndpoint").value) currentEndpointId = $("diagEndpoint").value;
    renderDiagnosticSummary();
  }

  $("diagEndpoint").addEventListener("change", () => {
    currentEndpointId = $("diagEndpoint").value;
  });

  function diagnosticStep(endpoint, type, port) {
    const issue = endpoint.issue || "healthy";
    if (type === "ping") {
      if (issue === "offline") return { name: "Reachability", pass: false, detail: "No ICMP response from " + endpoint.ip + "." };
      if (issue === "gateway") return { name: "Reachability", pass: true, detail: "Host replies with elevated latency (86 ms)." };
      return { name: "Reachability", pass: true, detail: "Host replied successfully (12 ms average)." };
    }
    if (type === "gateway") {
      if (!endpoint.gateway) return { name: "Gateway", pass: true, detail: "No gateway expected for this record." };
      if (issue === "gateway" || issue === "offline") return { name: "Gateway", pass: false, detail: "Default gateway " + endpoint.gateway + " is unreachable." };
      return { name: "Gateway", pass: true, detail: "Default gateway " + endpoint.gateway + " is reachable." };
    }
    if (type === "dns") {
      if (issue === "dns" || issue === "offline") return { name: "DNS", pass: false, detail: "DNS lookup failed through " + (endpoint.dns || "configured resolver") + "." };
      return { name: "DNS", pass: true, detail: "DNS resolution completed successfully through " + (endpoint.dns || "configured resolver") + "." };
    }
    if (type === "internet") {
      if (["gateway", "offline"].includes(issue)) return { name: "Internet", pass: false, detail: "External reachability failed because the local path is unavailable." };
      return { name: "Internet", pass: true, detail: "External HTTPS reachability is available." };
    }
    if (type === "port") {
      if (issue === "offline") return { name: "TCP " + port, pass: false, detail: "Endpoint is offline; TCP test cannot complete." };
      if (issue === "port" && Number(port) === 443) return { name: "TCP " + port, pass: false, detail: "TCP port " + port + " is not accepting connections." };
      return { name: "TCP " + port, pass: true, detail: "TCP port " + port + " is reachable in the simulated endpoint profile." };
    }
    if (type === "trace") {
      if (issue === "offline") return { name: "Route trace", pass: false, detail: "Trace stops before the destination because the endpoint is offline." };
      if (issue === "gateway") return { name: "Route trace", pass: false, detail: "Trace stops at the local access segment before the default gateway." };
      return { name: "Route trace", pass: true, detail: "Route path: endpoint → gateway → WAN edge → destination." };
    }
    return { name: type, pass: true, detail: "Test completed." };
  }

  function runDiagnostic() {
    const endpoint = endpointById($("diagEndpoint").value);
    if (!endpoint) return;
    currentEndpointId = endpoint.id;
    const type = $("diagType").value;
    const port = Math.max(1, Math.min(65535, Number($("diagPort").value) || 443));
    const types = type === "full" ? ["ping", "gateway", "dns", "internet", "port", "trace"] : [type];
    const results = types.map((t) => diagnosticStep(endpoint, t, port));
    const pass = results.every((r) => r.pass);
    const diagnosis = pass ? "No blocking fault detected in the selected test scope." :
      results.some((r) => !r.pass && r.name === "DNS") ? "Likely DNS resolver or name-resolution path issue." :
      results.some((r) => !r.pass && r.name === "Gateway") ? "Likely local gateway, VLAN, routing, or access-path issue." :
      results.some((r) => !r.pass && r.name.startsWith("TCP")) ? "Likely service, host firewall, or upstream port-policy issue." :
      "Endpoint or path is unavailable and requires connectivity investigation.";
    const record = {
      id: uid("DIAG"), endpointId: endpoint.id, type, port, status: pass ? "pass" : "fail",
      summary: diagnosis, results, createdAt: now()
    };
    state.diagnostics.unshift(record);
    state.diagnostics = state.diagnostics.slice(0, 200);
    selectedDiagnosticId = record.id;
    audit("Troubleshooting", "Diagnostic completed", endpoint.hostname, type + " · " + record.status.toUpperCase() + " · " + diagnosis);

    if (!pass && type === "full" && state.settings.autoTicketDiagnostic) {
      createIncident({
        endpointId: endpoint.id,
        title: "Failed full diagnostic: " + diagnosis,
        priority: "P2",
        source: "Troubleshooting"
      }, true);
    }

    saveState();
    renderDiagnosticOutput(record);
    renderDiagnosticSummary();
    renderOverview();
    toast("Diagnostic completed", endpoint.hostname + " · " + record.status.toUpperCase());
  }

  $("runDiagBtn").addEventListener("click", runDiagnostic);

  function renderDiagnosticOutput(record) {
    const endpoint = endpointById(record.endpointId);
    const lines = [
      "OpsFusion Guided Diagnostic",
      "Endpoint: " + (endpoint ? endpoint.hostname + " (" + endpoint.ip + ")" : record.endpointId),
      "Started: " + fmtDate(record.createdAt),
      ""
    ];
    record.results.forEach((result) => {
      lines.push("[" + (result.pass ? "PASS" : "FAIL") + "] " + result.name);
      lines.push("  " + result.detail);
    });
    lines.push("");
    lines.push("Interpretation: " + record.summary);
    lines.push("Mode: portfolio-safe simulation; real probes require an authorized local agent.");
    $("diagTerminal").textContent = lines.join("\n");
  }

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

  $("diagCreateIncidentBtn").addEventListener("click", () => {
    const record = state.diagnostics.find((d) => d.id === selectedDiagnosticId);
    if (!record) return;
    const endpoint = endpointById(record.endpointId);
    createIncident({
      endpointId: record.endpointId,
      title: "Diagnostic follow-up: " + record.summary,
      priority: record.status === "fail" ? "P2" : "P4",
      source: "Troubleshooting"
    });
    renderDiagnosticSummary();
    toast("Incident created", endpoint ? endpoint.hostname : record.endpointId);
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
    fillEndpointSelect($("remoteEndpoint"), currentEndpointId, true);
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
    if (!endpoint) {
      $("remoteEndpointCard").innerHTML = '<div class="empty">No endpoint selected.</div>';
      return;
    }
    $("remoteEndpointCard").innerHTML =
      "<h3>" + esc(endpoint.hostname) + "</h3><p>" + esc(endpoint.ip + " · " + endpoint.site + " · " + endpoint.type) + "</p>" +
      '<div class="endpoint-meta">' +
      '<div><span>Agent</span><strong>' + esc(endpoint.agent) + '</strong></div>' +
      '<div><span>Last seen</span><strong>' + esc(fmtDate(endpoint.lastSeen)) + '</strong></div>' +
      '<div><span>CPU</span><strong>' + esc(endpoint.cpu + "%") + '</strong></div>' +
      '<div><span>Memory</span><strong>' + esc(endpoint.memory + "%") + '</strong></div>' +
      '<div><span>Disk</span><strong>' + esc(endpoint.disk + "%") + '</strong></div>' +
      '<div><span>Owner</span><strong>' + esc(endpoint.owner) + "</strong></div></div>";
    qsa("[data-remote-action]").forEach((button) => button.disabled = endpoint.agent !== "online");
  }

  function remoteOutput(endpoint, action) {
    const header = ["OpsFusion Remote Support", "Endpoint: " + endpoint.hostname + " (" + endpoint.ip + ")", "Action: " + action, ""];
    if (action === "system") {
      return header.concat([
        "OS: " + endpoint.os,
        "Model: " + endpoint.model,
        "CPU utilization: " + endpoint.cpu + "%",
        "Memory utilization: " + endpoint.memory + "%",
        "Disk utilization: " + endpoint.disk + "%",
        "Last agent check-in: " + fmtDate(endpoint.lastSeen)
      ]).join("\n");
    }
    if (action === "software") {
      return header.concat([
        "Microsoft 365 Apps · Current Channel",
        "Microsoft Edge · Managed",
        "Endpoint Security Agent · Healthy",
        "7-Zip · Approved",
        "Inventory source: portfolio-safe seeded endpoint profile"
      ]).join("\n");
    }
    if (action === "disk") {
      return header.concat([
        "Disk utilization: " + endpoint.disk + "%",
        "SMART summary: Healthy",
        "Free-space assessment: " + (endpoint.disk >= 85 ? "Action recommended" : "Within threshold"),
        "BitLocker: " + (endpoint.bitlocker ? "Enabled" : "Not enabled")
      ]).join("\n");
    }
    if (action === "network") {
      return header.concat([
        "IPv4: " + endpoint.ip,
        "Gateway: " + (endpoint.gateway || "N/A"),
        "DNS: " + (endpoint.dns || "N/A"),
        "Reachability profile: " + endpoint.issue,
        "Use the Troubleshooting module for interpreted diagnostics."
      ]).join("\n");
    }
    if (action === "logs") {
      return header.concat([
        "Collected: System event summary",
        "Collected: Application event summary",
        "Collected: Network adapter snapshot",
        "Collected: Endpoint agent status",
        "Result: Diagnostic package staged in portfolio workspace"
      ]).join("\n");
    }
    return header.concat(["Action completed in portfolio-safe simulation mode."]).join("\n");
  }

  qsa("[data-remote-action]").forEach((button) => button.addEventListener("click", () => {
    const endpoint = endpointById($("remoteEndpoint").value);
    if (!endpoint) return;
    const action = button.dataset.remoteAction;
    if (endpoint.agent !== "online") {
      toast("Endpoint offline", "Remote actions require an online agent.");
      return;
    }
    if (action === "service") {
      showServiceRestartModal(endpoint);
      return;
    }
    const labelMap = { system: "System Info", software: "Software Inventory", disk: "Disk Health", network: "Network Diagnostics", logs: "Collect Logs" };
    const label = labelMap[action] || action;
    const record = { id: uid("RA"), endpointId: endpoint.id, action: label, status: "Completed", reference: "", createdAt: now() };
    state.remoteActions.unshift(record);
    state.remoteActions = state.remoteActions.slice(0, 200);
    audit("Remote Support", label, endpoint.hostname, "Approved read-only support action completed.");
    saveState();
    $("remoteConsole").textContent = remoteOutput(endpoint, action);
    renderRemoteActions();
    renderOverview();
    toast("Remote action completed", endpoint.hostname + " · " + label);
  }));

  function showServiceRestartModal(endpoint) {
    showModal("Restart Approved Service",
      '<label class="field"><span>Service</span><select id="mService"><option>Print Spooler</option><option>Windows Update</option><option>DNS Client</option></select></label>' +
      '<label class="field"><span>Ticket / change reference</span><input id="mReference" placeholder="INC-1001 or CHG-204"></label>' +
      '<p style="font-size:.55rem;color:var(--muted)">State-changing support actions require an operational reference. This portfolio build simulates the restart and records it in the audit trail.</p>' +
      '<div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mConfirm">Confirm Restart</button></div>',
      () => {
        $("mCancel").onclick = closeModal;
        $("mConfirm").onclick = () => {
          const reference = $("mReference").value.trim();
          const service = $("mService").value;
          if (!reference) {
            toast("Reference required", "Enter a ticket or approved change reference.");
            return;
          }
          const record = { id: uid("RA"), endpointId: endpoint.id, action: "Restart " + service, status: "Completed", reference, createdAt: now() };
          state.remoteActions.unshift(record);
          audit("Remote Support", "Approved service restart", endpoint.hostname, service + " · Reference " + reference);
          saveState();
          closeModal();
          $("remoteConsole").textContent = [
            "OpsFusion Remote Support",
            "Endpoint: " + endpoint.hostname,
            "Approved action: Restart " + service,
            "Reference: " + reference,
            "",
            "Service stop: simulated successful",
            "Service start: simulated successful",
            "Post-check: simulated healthy",
            "",
            "No arbitrary shell execution is exposed by this portfolio workflow."
          ].join("\n");
          renderRemoteActions();
          renderOverview();
          toast("Service restart recorded", endpoint.hostname + " · " + service);
        };
      }
    );
  }

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
    $("topology").innerHTML = Object.keys(grouped).sort().map((site) =>
      '<div class="topology-site"><strong>' + esc(site) + '</strong><div class="topology-nodes">' +
      grouped[site].map((e) => '<div class="topology-node"><b>' + esc(e.hostname) + '</b><span>' + esc(e.type + " · " + e.ip) + "</span></div>").join("") +
      "</div></div>"
    ).join("");

    $("vlanRows").innerHTML = state.vlans.length ? state.vlans.map((v) =>
      '<div class="stack-row"><div><strong>' + esc(v.site + " · VLAN " + v.vlan + " · " + v.name) +
      '</strong><small>' + esc(v.cidr + " · GW " + v.gateway + " · DNS " + v.dns) +
      '</small></div><button class="mini-btn danger" data-remove-vlan="' + esc(v.id) + '">Remove</button></div>'
    ).join("") : '<div class="empty">No VLAN plans documented.</div>';

    $("docDeviceRows").innerHTML = state.endpoints.map((e) =>
      "<tr><td>" + esc(e.hostname) + "</td><td>" + esc(e.type) + "</td><td>" + esc(e.ip) + "</td><td>" + esc(e.site) +
      "</td><td>" + esc(e.model + " · " + e.os) + "</td><td>" + esc(e.owner) + "</td></tr>"
    ).join("");

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
      '<label class="field"><span>Switch</span><select id="mPortSwitch">' + switches.map((e) => '<option value="' + esc(e.hostname) + '">' + esc(e.hostname) + "</option>").join("") + '</select></label>' +
      '<label class="field"><span>Port</span><input id="mPortName" placeholder="Gi1/0/12"></label>' +
      '<label class="field"><span>Endpoint</span><select id="mPortEndpoint">' + state.endpoints.map((e) => '<option value="' + esc(e.id) + '">' + esc(e.hostname) + "</option>").join("") + '</select></label>' +
      '<label class="field"><span>VLAN</span><input id="mPortVlan" type="number" min="1" max="4094"></label>' +
      '</div><div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Add Mapping</button></div>',
      () => {
        $("mCancel").onclick = closeModal;
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
    const managed = state.endpoints.filter((e) => e.complianceManaged !== false);
    const rows = managed.map((e) => ({ endpoint: e, result: evaluateEndpoint(e) }));
    const compliant = rows.filter((r) => r.result.status === "compliant").length;
    const noncompliant = rows.length - compliant;
    const score = rows.length ? Math.round((compliant / rows.length) * 100) : 100;

    $("complianceScore").textContent = score + "%";
    $("complianceBreakdown").innerHTML =
      '<article><span>Managed endpoints</span><strong>' + rows.length + '</strong></article>' +
      '<article><span>Compliant</span><strong class="text-green">' + compliant + '</strong></article>' +
      '<article><span>Need action</span><strong class="text-amber">' + noncompliant + "</strong></article>";

    $("complianceRows").innerHTML = rows.length ? rows.map((row) => {
      const e = row.endpoint;
      const r = row.result;
      return "<tr>" +
        '<td><span class="cell-title">' + esc(e.hostname) + '</span><span class="cell-sub">' + esc(e.ip + " · " + e.site) + "</span></td>" +
        "<td>" + (e.updatesMissing === 0 ? badge("Current", "green") : badge(e.updatesMissing + " missing", "amber")) + "</td>" +
        "<td>" + badge(e.av, e.av === "healthy" ? "green" : "red") + "</td>" +
        "<td>" + badge(e.firewall ? "Enabled" : "Disabled", e.firewall ? "green" : "red") + "</td>" +
        "<td>" + badge(e.bitlocker ? "Enabled" : "Disabled", e.bitlocker ? "green" : "red") + "</td>" +
        "<td>" + esc(e.rebootAge + " days") + "</td>" +
        "<td>" + (r.status === "compliant" ? badge("Compliant", "green") : badge("Needs action", "amber")) + "</td>" +
        '<td><button class="mini-btn" data-remediate="' + esc(e.id) + '"' + (r.status === "compliant" ? " disabled" : "") + ">Create Ticket</button></td></tr>";
    }).join("") : '<tr><td colspan="8" class="empty">No compliance-managed endpoints.</td></tr>';

    qsa("[data-remediate]").forEach((button) => button.onclick = () => {
      const e = endpointById(button.dataset.remediate);
      if (!e) return;
      const result = evaluateEndpoint(e);
      createIncident({
        endpointId: e.id,
        title: "Compliance remediation: " + result.failures.map((f) => f.label).join(", "),
        priority: "P3",
        source: "Compliance"
      });
      renderCompliance();
      toast("Remediation incident created", e.hostname);
    });
  }

  function evaluateFleet(recordAudit = true) {
    const failing = state.endpoints.filter((e) => evaluateEndpoint(e).status === "noncompliant");
    if (state.settings.autoTicketCompliance) {
      failing.forEach((e) => {
        const exists = state.incidents.some((i) =>
          i.endpointId === e.id && i.source === "Compliance" && !["Resolved", "Closed"].includes(i.status)
        );
        if (!exists) {
          const result = evaluateEndpoint(e);
          createIncident({
            endpointId: e.id,
            title: "Compliance remediation: " + result.failures.map((f) => f.label).join(", "),
            priority: "P3",
            source: "Compliance"
          }, true);
        }
      });
    }
    if (recordAudit) audit("Compliance", "Fleet evaluated", state.meta.workspaceName, failing.length + " endpoint(s) require remediation.");
    saveState();
    renderCompliance();
    renderOverview();
    renderIncidents();
    if (recordAudit) toast("Fleet evaluated", failing.length + " endpoint(s) need action.");
  }

  $("evaluateComplianceBtn").addEventListener("click", () => evaluateFleet(true));

  function nextIncidentId() {
    const max = state.incidents.reduce((value, item) => {
      const n = Number(String(item.id || "").replace(/\D/g, ""));
      return Number.isFinite(n) ? Math.max(value, n) : value;
    }, 1000);
    return "INC-" + String(max + 1);
  }

  function createIncident(input, silent = false) {
    const createdAt=now();
    const impact=input.impact||"Medium",urgency=input.urgency||"Medium";
    const priority=input.priority||priorityFromImpactUrgency(impact,urgency);
    const sla=SLA[priority]||SLA.P3;
    const asset=assetById(input.assetId);
    const endpointId=input.endpointId||(asset?asset.endpointId:"");
    const incident=normalizeTicket({
      id:nextIncidentId(),type:input.type||"Incident",endpointId,assetId:input.assetId||"",
      requesterId:input.requesterId||"",assigneeId:input.assigneeId||"",category:input.category||input.source||"General",
      title:String(input.title||"New service desk ticket").trim(),description:input.description||"",
      impact,urgency,priority,status:input.status||"New",source:input.source||"Manual",createdAt,
      responseDue:addHours(createdAt,sla.response),resolutionDue:addHours(createdAt,sla.resolution),
      activities:[{at:createdAt,actor:"OpsFusion",action:"Ticket created",note:input.description||input.source||"Service desk intake"}]
    });
    state.incidents.unshift(incident);
    const ep=endpointById(incident.endpointId),requester=identityById(incident.requesterId);
    audit("Service Desk","Ticket created",incident.id,incident.title+(ep?" · "+ep.hostname:"")+(requester?" · "+requester.displayName:""));
    saveState();
    if(!silent){renderIncidents();renderOverview();}
    return incident;
  }

  function openTicketModal(id) {
    const t=incidentById(id);if(!t)return;
    const ticket=normalizeTicket(t),ep=endpointById(ticket.endpointId),asset=assetById(ticket.assetId),requester=identityById(ticket.requesterId),tech=technicianById(ticket.assigneeId),sla=ticketSlaState(ticket);
    showModal("Ticket · "+ticket.id,
      '<div class="endpoint-card"><h3>'+esc(ticket.title)+'</h3><p>'+esc(ticket.type+" · "+ticket.category+" · "+ticket.source)+'</p><div class="endpoint-meta">'+
      '<div><span>Requester</span><strong>'+esc(requester?requester.displayName:"Unassigned")+'</strong></div><div><span>Assignee</span><strong>'+esc(tech?tech.name:"Unassigned")+'</strong></div>'+
      '<div><span>Endpoint</span><strong>'+esc(ep?ep.hostname:"None")+'</strong></div><div><span>Asset</span><strong>'+esc(asset?asset.tag:"None")+'</strong></div>'+
      '<div><span>Priority</span><strong>'+esc(ticket.priority+" · "+sla.label)+'</strong></div><div><span>Resolution due</span><strong>'+esc(fmtDate(ticket.resolutionDue))+'</strong></div></div></div>'+
      '<p style="font-size:.58rem;color:var(--muted);line-height:1.55">'+esc(ticket.description||"No additional description.")+'</p>'+
      '<div class="stack">'+ticket.activities.slice().reverse().map((a)=>'<div class="stack-row"><div><strong>'+esc(a.action+" · "+a.actor)+'</strong><small>'+esc(fmtDate(a.at)+" · "+a.note)+'</small></div></div>').join("")+'</div>'+
      '<label class="field" style="margin-top:12px"><span>Work note</span><textarea id="mTicketNote" placeholder="Add troubleshooting or resolution note"></textarea></label>'+
      '<div class="modal-actions">'+(!ticket.firstResponseAt?'<button class="btn secondary" id="mTicketRespond">Record First Response</button>':"")+'<button class="btn primary" id="mTicketNoteSave">Add Work Note</button></div>',
      ()=>{
        if($("mTicketRespond"))$("mTicketRespond").onclick=()=>{t.firstResponseAt=now();t.updatedAt=now();t.activities.push({at:now(),actor:"Service Desk",action:"First response",note:"First-response timestamp recorded."});audit("Service Desk","First response recorded",t.id,t.title);saveState();closeModal();renderIncidents();toast("First response recorded",t.id);};
        $("mTicketNoteSave").onclick=()=>{const note=$("mTicketNote").value.trim();if(!note)return;t.updatedAt=now();t.activities.push({at:now(),actor:"Service Desk",action:"Work note",note});audit("Service Desk","Work note added",t.id,note);saveState();closeModal();renderIncidents();toast("Work note added",t.id);};
      }
    );
  }

  function renderIncidents() {
    state.incidents=state.incidents.map(normalizeTicket);
    const open=state.incidents.filter((i)=>!["Resolved","Closed"].includes(i.status));
    const risk=open.filter((i)=>ticketSlaState(i).level==="warn").length;
    const breached=open.filter((i)=>ticketSlaState(i).level==="bad").length;
    $("incNew").textContent=open.length;$("incActive").textContent=risk;$("incPending").textContent=breached;$("incResolved").textContent=state.incidents.length-open.length;

    const statuses=Array.from(new Set(state.incidents.map((i)=>i.status))).sort(),sf=$("ticketStatusFilter"),prev=sf.value;
    sf.innerHTML='<option value="">All statuses</option>'+statuses.map((s)=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join("");if(statuses.includes(prev))sf.value=prev;
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

    qsa("[data-incident-status]").forEach((select)=>select.onchange=()=>{
      const t=incidentById(select.dataset.incidentStatus);if(!t)return;const previous=t.status;t.status=select.value;t.updatedAt=now();
      if(["Resolved","Closed"].includes(t.status)&&!t.resolvedAt)t.resolvedAt=now();
      t.activities.push({at:now(),actor:"Service Desk",action:"Status changed",note:previous+" → "+t.status});
      audit("Service Desk","Ticket status changed",t.id,previous+" → "+t.status);saveState();renderIncidents();renderOverview();
    });
    qsa("[data-open-ticket]").forEach((b)=>b.onclick=()=>openTicketModal(b.dataset.openTicket));

    $("knowledgeRows").innerHTML=state.knowledge.map((k)=>'<button class="knowledge-row" data-kb="'+esc(k.id)+'"><strong>'+esc(k.title)+'</strong><span>'+esc(k.category+" · "+k.summary)+'</span></button>').join("");
    qsa("[data-kb]").forEach((b)=>b.onclick=()=>{const k=state.knowledge.find((x)=>x.id===b.dataset.kb);if(k)showModal(k.title,'<p style="font-size:.62rem;color:var(--muted);line-height:1.7">'+esc(k.summary)+'</p><div class="modal-actions"><button class="btn primary" id="mKbClose">Close</button></div>',()=>{$("mKbClose").onclick=closeModal;});});
    $("technicianRows").innerHTML=state.technicians.map((tech)=>{const load=open.filter((t)=>t.assigneeId===tech.id).length;return '<div class="stack-row"><div><strong>'+esc(tech.name+" · "+tech.role)+'</strong><small>'+esc(tech.specialty)+'</small></div>'+badge(load+" open",load>3?"amber":"blue")+'</div>';}).join("");
    saveState();
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
      '<label class="field"><span>Assignee</span><select id="mTicketAssignee"><option value="">Unassigned</option>'+state.technicians.map((t)=>'<option value="'+esc(t.id)+'">'+esc(t.name+" · "+t.role)+'</option>').join("")+'</select></label>'+
      '<label class="field"><span>Source</span><select id="mIncidentSource"><option>Manual</option><option>Troubleshooting</option><option>Remote Support</option><option>Compliance</option><option>Monitoring</option><option>Identity</option><option>Asset Management</option></select></label>'+
      '<label class="field span-2"><span>Description</span><textarea id="mTicketDescription" placeholder="Provide symptoms, request details, business impact, or troubleshooting context"></textarea></label></div>'+
      '<div class="modal-actions"><button class="btn secondary" id="mCancel">Cancel</button><button class="btn primary" id="mSave">Create Ticket</button></div>',
      ()=>{
        $("mCancel").onclick=closeModal;
        $("mSave").onclick=()=>{
          const title=$("mIncidentTitle").value.trim();if(!title){toast("Title required","Enter a ticket title.");return;}
          const assetId=$("mTicketAsset").value,asset=assetById(assetId);
          const requesterId=$("mTicketRequester").value||(asset?asset.assignedUserId:"");
          createIncident({type:$("mTicketType").value,assetId,endpointId:asset?asset.endpointId:"",requesterId,assigneeId:$("mTicketAssignee").value,title,category:$("mTicketCategory").value,impact:$("mTicketImpact").value,urgency:$("mTicketUrgency").value,source:$("mIncidentSource").value,description:$("mTicketDescription").value.trim()});
          closeModal();toast("Ticket created",title);
        };
      }
    );
  });

  function renderAuditEntries(entries) {
    return entries.length ? entries.map((row) =>
      '<div class="audit-entry"><time>' + esc(fmtDate(row.createdAt)) + '</time><span class="module">' + esc(row.module) +
      '</span><div><strong>' + esc(row.action + (row.target ? " · " + row.target : "")) +
      '</strong><small>' + esc(row.detail || "") + "</small></div></div>"
    ).join("") : '<div class="empty">No audit events.</div>';
  }

  function renderAudit() {
    const modules = Array.from(new Set(state.audit.map((row) => row.module))).sort();
    const select = $("auditModuleFilter");
    const current = select.value;
    select.innerHTML = '<option value="">All modules</option>' + modules.map((m) => '<option value="' + esc(m) + '">' + esc(m) + "</option>").join("");
    if (modules.includes(current)) select.value = current;

    const query = $("auditSearch").value.trim().toLowerCase();
    const module = select.value;
    const rows = state.audit.filter((row) => {
      const haystack = [row.module, row.action, row.target, row.detail].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (!module || row.module === module);
    });
    $("auditRows").innerHTML = renderAuditEntries(rows);
  }

  $("auditSearch").addEventListener("input", renderAudit);
  $("auditModuleFilter").addEventListener("change", renderAudit);

  $("clearAuditBtn").addEventListener("click", () => {
    if (!confirm("Clear the demo audit history in this browser?")) return;
    state.audit = [{ id: uid("AUD"), module: "System", action: "Audit reset", target: state.meta.workspaceName, detail: "Demo audit history cleared by the portfolio user.", createdAt: now() }];
    saveState();
    renderAudit();
    renderOverview();
    toast("Audit reset", "Demo history was cleared.");
  });

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
    audit("System", "Workflow settings updated", state.meta.workspaceName, "Portfolio automation settings saved.");
    saveState();
    renderOverview();
    toast("Workflow settings saved", state.meta.workspaceName);
  });

  $("resetWorkspaceBtn").addEventListener("click", () => {
    if (!confirm("Reset OpsFusion to the seeded unified workspace? All browser-local changes will be removed.")) return;
    state = seedState();
    currentEndpointId = state.endpoints[0].id;
    selectedDiagnosticId = null;
    saveState();
    renderAll();
    openPage("overview");
    toast("Workspace reset", "Seeded unified data restored.");
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

  $("importInput").addEventListener("change", async () => {
    const file = $("importInput").files && $("importInput").files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = parsed.workspace || parsed;
      if (!imported || !Array.isArray(imported.endpoints) || !Array.isArray(imported.incidents)) {
        throw new Error("This file is not a valid OpsFusion workspace.");
      }
      if (!confirm("Replace the current browser workspace with " + file.name + "?")) return;
      state = {
        ...seedState(),
        ...imported,
        meta: { ...seedState().meta, ...(imported.meta || {}) },
        settings: { ...seedState().settings, ...(imported.settings || {}) },
        complianceRules: { ...seedState().complianceRules, ...(imported.complianceRules || {}) }
      };
      migrateUnifiedState();
      audit("System", "Workspace imported", file.name, "Unified state restored from JSON.");
      saveState();
      currentEndpointId = state.endpoints[0] ? state.endpoints[0].id : null;
      selectedDiagnosticId = null;
      renderAll();
      openPage("overview");
      toast("Workspace imported", file.name);
    } catch (error) {
      toast("Import failed", error.message || "Unable to read workspace.");
    } finally {
      $("importInput").value = "";
    }
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
      const hay=[u.displayName,u.username,u.upn,u.department,u.title,u.status].join(" ").toLowerCase();
      if(hay.includes(q)) hits.push({type:"identity",id:u.id,title:u.displayName,detail:u.upn+" · "+u.department+" · "+u.status});
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
    box.textContent = message;
    box.className = "auth-message" + (tone ? " " + tone : "");
  }

  function applyRoleAccess() {
    document.body.dataset.role = cloudRole;
    const readOnly = cloudRole === "viewer";
    const adminOnlyIds = ["resetWorkspaceBtn","clearAuditBtn"];
    const mutatingIds = [
      "addEndpointBtn","addAssetBtn","provisionUserBtn","runDiagBtn","diagCreateIncidentBtn",
      "addVlanBtn","addPortBtn","addChangeNoteBtn","evaluateComplianceBtn","newIncidentBtn",
      "saveRulesBtn","saveWorkflowSettingsBtn"
    ];
    mutatingIds.forEach((id) => { if ($(id)) $(id).disabled = readOnly; });
    qsa("[data-remote-action],[data-remediate]").forEach((el) => {
      if (readOnly) el.disabled = true;
    });
    adminOnlyIds.forEach((id) => { if ($(id)) $(id).disabled = cloudRole !== "admin" && cloudRole !== "demo"; });
    qsa("#modalBody .btn.primary,#modalBody .btn.danger").forEach((el) => {
      if (readOnly) el.disabled = true;
    });
  }

  function updateModeUI(mode, role = "demo") {
    const cloud = mode === "cloud";
    if ($("workspaceModeLabel")) $("workspaceModeLabel").textContent = cloud ? "CLOUD WORKSPACE" : "PORTFOLIO DEMO";
    if ($("persistenceModeLabel")) $("persistenceModeLabel").textContent = cloud ? "SUPABASE" : "LOCAL";
    if ($("accessModeLabel")) $("accessModeLabel").textContent = String(role || "demo").toUpperCase();
    if ($("heroPersistenceLabel")) $("heroPersistenceLabel").textContent = cloud ? "Supabase cloud" : "Local demo";
  }

  function showCloudIdentity(user, role) {
    cloudRole = role || "viewer";
    if ($("cloudUser")) $("cloudUser").hidden = false;
    if ($("cloudUserLabel")) $("cloudUserLabel").textContent = user?.email || "Cloud user";
    if ($("cloudRoleLabel")) $("cloudRoleLabel").textContent = cloudRole;
    updateModeUI("cloud", cloudRole);
    applyRoleAccess();
  }

  async function bootstrapCloud(displayName = "") {
    if (!window.OpsFusionCloud?.available) throw new Error("Supabase client is unavailable.");
    const result = await window.OpsFusionCloud.bootstrap(state, displayName);
    if (result.state) state = result.state;
    if (result.audit?.length) state.audit = result.audit;
    migrateUnifiedState();
    currentEndpointId = state.endpoints[0] ? state.endpoints[0].id : null;
    selectedDiagnosticId = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    demoMode = false;
    $("authGate").hidden = true;
    showCloudIdentity(result.user, result.role);
    renderAll();
    toast("Cloud workspace connected", result.workspaceName + " · " + result.role);
  }

  async function initCloudAuth() {
    if (!window.OpsFusionCloud?.available) {
      setAuthMessage("Cloud client could not load. Demo Mode is still available.", "error");
      return;
    }
    try {
      const session = await window.OpsFusionCloud.init();
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
    setAuthMessage(signup ? "Create a Supabase Auth account for persistent cloud data." : "Sign in to load your persistent OpsFusion workspace.");
  }));

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

  $("continueDemoBtn").addEventListener("click", () => {
    demoMode = true;
    cloudRole = "demo";
    $("authGate").hidden = true;
    $("cloudUser").hidden = true;
    applyRoleAccess();
    toast("Demo Mode", "Using browser-local portfolio data. Sign in later for cloud persistence.");
  });

  $("cloudSignOutBtn").addEventListener("click", async () => {
    try {
      await window.OpsFusionCloud.signOut();
    } catch (error) {
      console.error(error);
    }
    cloudRole = "demo";
    $("cloudUser").hidden = true;
    $("authGate").hidden = false;
    updateModeUI("demo", "demo");
    setAuthMessage("Signed out. Sign in again or continue in Demo Mode.");
    applyRoleAccess();
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
  updateModeUI("demo", "demo");
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