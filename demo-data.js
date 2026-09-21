window.HELPDESK_DEMO = (() => {
  const now = Date.now();
  const isoAgo = (hours) => new Date(now - hours * 3600000).toISOString();
  const isoFromNow = (hours) => new Date(now + hours * 3600000).toISOString();

  const users = [
    {id:1,name:"Adrian Reyes",email:"adrian.reyes@contoso.local",role:"Requester",department:"Finance"},
    {id:2,name:"Marco Santos",email:"marco.santos@contoso.local",role:"Requester",department:"Operations"},
    {id:3,name:"Nico Cruz",email:"nico.cruz@contoso.local",role:"Requester",department:"Human Resources"},
    {id:10,name:"Jim Camus",email:"jim.camus@helpdesk.local",role:"Administrator",department:"IT"},
    {id:11,name:"Kevin Lim",email:"kevin.lim@helpdesk.local",role:"Technician",department:"IT"},
    {id:12,name:"Ryan Mendoza",email:"ryan.mendoza@helpdesk.local",role:"Technician",department:"IT"}
  ];

  const assets = [
    {id:1,hostname:"FIN-LT-014",type:"Laptop",owner:"Adrian Reyes",serial:"LNV-83F4A2",platform:"Windows 11 Pro",status:"In Service",location:"Finance"},
    {id:2,hostname:"OPS-DT-022",type:"Desktop",owner:"Marco Santos",serial:"DEL-72D19B",platform:"Windows 11 Pro",status:"In Service",location:"Operations"},
    {id:3,hostname:"HR-LT-008",type:"Laptop",owner:"Nico Cruz",serial:"HP-19A8D1",platform:"Windows 11 Pro",status:"In Service",location:"Human Resources"},
    {id:4,hostname:"CORE-SW-01",type:"Switch",owner:"IT Infrastructure",serial:"CSC-9200-01",platform:"Cisco IOS XE",status:"In Service",location:"MDF"},
    {id:5,hostname:"AP-F2-03",type:"Access Point",owner:"IT Infrastructure",serial:"UBQ-U6-003",platform:"UniFi",status:"In Service",location:"Floor 2"},
    {id:6,hostname:"PRN-FIN-01",type:"Printer",owner:"Finance",serial:"HP-M428-11",platform:"Embedded",status:"Degraded",location:"Finance"},
    {id:7,hostname:"SRV-AD01",type:"Server",owner:"IT Infrastructure",serial:"DEL-R550-01",platform:"Windows Server 2022",status:"In Service",location:"Server Room"},
    {id:8,hostname:"SPARE-LT-02",type:"Laptop",owner:"IT Stock",serial:"ACR-SWIFT-02",platform:"Windows 11 Pro",status:"Available",location:"IT Stockroom"}
  ];

  const tickets = [
    {
      id:1001,number:"HD-1001",type:"Incident",subject:"Finance printer unavailable after paper jam",
      description:"PRN-FIN-01 remains offline after clearing a paper jam. Users cannot print invoices.",
      requester_id:1,requester:"Adrian Reyes",category:"Printer",asset_id:6,asset:"PRN-FIN-01",
      impact:"Medium",urgency:"High",priority:"P2",status:"In Progress",assignee_id:11,assignee:"Kevin Lim",escalation:1,
      created_at:isoAgo(5.5),updated_at:isoAgo(.4),response_due:isoAgo(4.5),resolution_due:isoFromNow(2.5),first_response_at:isoAgo(5),resolved_at:null,csat:null,
      activities:[
        {at:isoAgo(5.5),actor:"Adrian Reyes",action:"Created ticket",note:"Printing stopped after paper jam."},
        {at:isoAgo(5),actor:"Kevin Lim",action:"First response",note:"Requested printer status page and began remote checks."},
        {at:isoAgo(1.2),actor:"Kevin Lim",action:"Work note",note:"Spooler reachable; device reports hardware fault. On-site inspection scheduled."}
      ]
    },
    {
      id:1002,number:"HD-1002",type:"Incident",subject:"VPN authentication fails after password reset",
      description:"User changed Active Directory password and now receives authentication failure in corporate VPN.",
      requester_id:2,requester:"Marco Santos",category:"VPN",asset_id:2,asset:"OPS-DT-022",
      impact:"High",urgency:"High",priority:"P1",status:"Assigned",assignee_id:10,assignee:"Jim Camus",escalation:2,
      created_at:isoAgo(1.1),updated_at:isoAgo(.2),response_due:isoAgo(.6),resolution_due:isoFromNow(.9),first_response_at:isoAgo(.8),resolved_at:null,csat:null,
      activities:[
        {at:isoAgo(1.1),actor:"Marco Santos",action:"Created ticket",note:"VPN fails immediately after sign-in."},
        {at:isoAgo(.8),actor:"Jim Camus",action:"First response",note:"Validated account status and began VPN credential-cache troubleshooting."},
        {at:isoAgo(.2),actor:"Jim Camus",action:"Escalated",note:"Raised to Level 2 due to business-critical remote access impact."}
      ]
    },
    {
      id:1003,number:"HD-1003",type:"Service Request",subject:"New Microsoft 365 shared mailbox access",
      description:"Finance manager requests access for Adrian to the AP shared mailbox.",
      requester_id:1,requester:"Adrian Reyes",category:"Microsoft 365",asset_id:null,asset:"",
      impact:"Low",urgency:"Medium",priority:"P3",status:"Pending",assignee_id:12,assignee:"Ryan Mendoza",escalation:0,
      created_at:isoAgo(8),updated_at:isoAgo(2),response_due:isoAgo(4),resolution_due:isoFromNow(18),first_response_at:isoAgo(7.5),resolved_at:null,csat:null,
      activities:[
        {at:isoAgo(8),actor:"Adrian Reyes",action:"Created request",note:"Needs AP shared mailbox access."},
        {at:isoAgo(7.5),actor:"Ryan Mendoza",action:"First response",note:"Request acknowledged."},
        {at:isoAgo(2),actor:"Ryan Mendoza",action:"Pending approval",note:"Awaiting mailbox owner approval."}
      ]
    },
    {
      id:1004,number:"HD-1004",type:"Incident",subject:"Intermittent Wi-Fi on Floor 2",
      description:"Several users report Wi-Fi drops near meeting rooms on Floor 2.",
      requester_id:2,requester:"Marco Santos",category:"Network",asset_id:5,asset:"AP-F2-03",
      impact:"High",urgency:"Medium",priority:"P2",status:"New",assignee_id:null,assignee:"Unassigned",escalation:0,
      created_at:isoAgo(.7),updated_at:isoAgo(.7),response_due:isoFromNow(.3),resolution_due:isoFromNow(7.3),first_response_at:null,resolved_at:null,csat:null,
      activities:[{at:isoAgo(.7),actor:"Marco Santos",action:"Created ticket",note:"Multiple users affected intermittently."}]
    },
    {
      id:1005,number:"HD-1005",type:"Incident",subject:"User account locked repeatedly",
      description:"HR user account re-locks shortly after unlock. Suspected stale credentials on another endpoint.",
      requester_id:3,requester:"Nico Cruz",category:"Account Access",asset_id:3,asset:"HR-LT-008",
      impact:"Medium",urgency:"High",priority:"P2",status:"Resolved",assignee_id:10,assignee:"Jim Camus",escalation:1,
      created_at:isoAgo(26),updated_at:isoAgo(3),response_due:isoAgo(25),resolution_due:isoAgo(18),first_response_at:isoAgo(25.7),resolved_at:isoAgo(3),csat:5,
      activities:[
        {at:isoAgo(26),actor:"Nico Cruz",action:"Created ticket",note:"Account locked three times today."},
        {at:isoAgo(25.7),actor:"Jim Camus",action:"First response",note:"Unlocked account and checked lockout source."},
        {at:isoAgo(4),actor:"Jim Camus",action:"Resolution",note:"Removed stale mobile mail credentials causing repeated lockouts."},
        {at:isoAgo(3),actor:"Nico Cruz",action:"CSAT",note:"5/5 - issue resolved quickly."}
      ]
    },
    {
      id:1006,number:"HD-1006",type:"Service Request",subject:"Prepare replacement laptop for Finance",
      description:"Provision spare laptop with standard apps, BitLocker, Microsoft 365, VPN, and printer mappings.",
      requester_id:1,requester:"Adrian Reyes",category:"Endpoint",asset_id:8,asset:"SPARE-LT-02",
      impact:"Medium",urgency:"Medium",priority:"P3",status:"In Progress",assignee_id:12,assignee:"Ryan Mendoza",escalation:0,
      created_at:isoAgo(15),updated_at:isoAgo(1.5),response_due:isoAgo(11),resolution_due:isoFromNow(9),first_response_at:isoAgo(14),resolved_at:null,csat:null,
      activities:[
        {at:isoAgo(15),actor:"Adrian Reyes",action:"Created request",note:"Replacement needed before next business day."},
        {at:isoAgo(14),actor:"Ryan Mendoza",action:"First response",note:"Spare device reserved."},
        {at:isoAgo(1.5),actor:"Ryan Mendoza",action:"Work note",note:"OS updates complete; validating VPN and M365 apps."}
      ]
    },
    {
      id:1007,number:"HD-1007",type:"Incident",subject:"Outlook desktop client not synchronizing",
      description:"New messages appear in Outlook Web but desktop Outlook remains several hours behind.",
      requester_id:3,requester:"Nico Cruz",category:"Microsoft 365",asset_id:3,asset:"HR-LT-008",
      impact:"Low",urgency:"Medium",priority:"P3",status:"Assigned",assignee_id:11,assignee:"Kevin Lim",escalation:0,
      created_at:isoAgo(3),updated_at:isoAgo(1),response_due:isoFromNow(1),resolution_due:isoFromNow(21),first_response_at:isoAgo(2),resolved_at:null,csat:null,
      activities:[
        {at:isoAgo(3),actor:"Nico Cruz",action:"Created ticket",note:"Outlook desktop not receiving mail."},
        {at:isoAgo(2),actor:"Kevin Lim",action:"First response",note:"Checking cached mode and profile health."}
      ]
    },
    {
      id:1008,number:"HD-1008",type:"Incident",subject:"Desktop fails to obtain DHCP address",
      description:"OPS-DT-022 shows APIPA address after reboot and cannot reach gateway.",
      requester_id:2,requester:"Marco Santos",category:"Network",asset_id:2,asset:"OPS-DT-022",
      impact:"Medium",urgency:"High",priority:"P2",status:"Resolved",assignee_id:11,assignee:"Kevin Lim",escalation:0,
      created_at:isoAgo(31),updated_at:isoAgo(24),response_due:isoAgo(30),resolution_due:isoAgo(23),first_response_at:isoAgo(30.5),resolved_at:isoAgo(24),csat:4,
      activities:[
        {at:isoAgo(31),actor:"Marco Santos",action:"Created ticket",note:"169.254.x.x address after restart."},
        {at:isoAgo(30.5),actor:"Kevin Lim",action:"First response",note:"Started switch-port and DHCP checks."},
        {at:isoAgo(24),actor:"Kevin Lim",action:"Resolution",note:"Re-seated patch cable and moved connection to verified switch port."}
      ]
    },
    {
      id:1009,number:"HD-1009",type:"Service Request",subject:"Install approved PDF editor",
      description:"User needs approved PDF editing application for HR document workflow.",
      requester_id:3,requester:"Nico Cruz",category:"Software",asset_id:3,asset:"HR-LT-008",
      impact:"Low",urgency:"Low",priority:"P4",status:"Closed",assignee_id:12,assignee:"Ryan Mendoza",escalation:0,
      created_at:isoAgo(72),updated_at:isoAgo(48),response_due:isoAgo(64),resolution_due:isoAgo(24),first_response_at:isoAgo(68),resolved_at:isoAgo(50),csat:5,
      activities:[
        {at:isoAgo(72),actor:"Nico Cruz",action:"Created request",note:"Needs approved PDF editor."},
        {at:isoAgo(68),actor:"Ryan Mendoza",action:"First response",note:"License availability confirmed."},
        {at:isoAgo(50),actor:"Ryan Mendoza",action:"Resolution",note:"Application installed and verified."},
        {at:isoAgo(48),actor:"Ryan Mendoza",action:"Closed",note:"Requester confirmed completion."}
      ]
    },
    {
      id:1010,number:"HD-1010",type:"Incident",subject:"Suspicious browser redirect detected",
      description:"Endpoint redirects some searches to an unexpected domain. Security scan requested.",
      requester_id:1,requester:"Adrian Reyes",category:"Security",asset_id:1,asset:"FIN-LT-014",
      impact:"High",urgency:"High",priority:"P1",status:"In Progress",assignee_id:10,assignee:"Jim Camus",escalation:2,
      created_at:isoAgo(2.2),updated_at:isoAgo(.3),response_due:isoAgo(1.7),resolution_due:isoFromNow(-.2),first_response_at:isoAgo(2),resolved_at:null,csat:null,
      activities:[
        {at:isoAgo(2.2),actor:"Adrian Reyes",action:"Created ticket",note:"Unexpected browser redirects."},
        {at:isoAgo(2),actor:"Jim Camus",action:"First response",note:"Isolated endpoint from non-essential network access."},
        {at:isoAgo(.3),actor:"Jim Camus",action:"Work note",note:"Browser extension removed; endpoint malware scan underway."}
      ]
    },
    {
      id:1011,number:"HD-1011",type:"Service Request",subject:"Create user account for new hire",
      description:"Provision standard account, M365 license, baseline groups, and temporary password for new Finance employee.",
      requester_id:1,requester:"Adrian Reyes",category:"Account Access",asset_id:null,asset:"",
      impact:"Medium",urgency:"Low",priority:"P3",status:"Assigned",assignee_id:12,assignee:"Ryan Mendoza",escalation:0,
      created_at:isoAgo(9),updated_at:isoAgo(4),response_due:isoAgo(5),resolution_due:isoFromNow(15),first_response_at:isoAgo(7),resolved_at:null,csat:null,
      activities:[
        {at:isoAgo(9),actor:"Adrian Reyes",action:"Created request",note:"New starter begins tomorrow."},
        {at:isoAgo(7),actor:"Ryan Mendoza",action:"First response",note:"Onboarding details validated."}
      ]
    },
    {
      id:1012,number:"HD-1012",type:"Incident",subject:"Core switch uplink error counter increasing",
      description:"Monitoring indicates rising errors on CORE-SW-01 uplink interface. No outage yet.",
      requester_id:10,requester:"Jim Camus",category:"Network",asset_id:4,asset:"CORE-SW-01",
      impact:"Critical",urgency:"Medium",priority:"P1",status:"Assigned",assignee_id:10,assignee:"Jim Camus",escalation:2,
      created_at:isoAgo(.5),updated_at:isoAgo(.1),response_due:isoFromNow(.5),resolution_due:isoFromNow(1.5),first_response_at:isoAgo(.2),resolved_at:null,csat:null,
      activities:[
        {at:isoAgo(.5),actor:"Jim Camus",action:"Created ticket",note:"Proactive incident from monitoring alert."},
        {at:isoAgo(.2),actor:"Jim Camus",action:"First response",note:"Reviewing interface counters and optics."}
      ]
    }
  ];

  const knowledge = [
    {id:1,title:"VPN authentication failure after password change",category:"VPN",summary:"Clear cached VPN credentials and verify account synchronization after an AD password reset.",views:184,helpful:97,tags:["VPN","Active Directory","Credentials"],body:"1. Verify the account is not locked. 2. Confirm the new password works against an internal service. 3. Remove saved VPN credentials. 4. Reconnect and re-enter the new password. 5. Escalate if authentication logs still reject valid credentials."},
    {id:2,title:"Troubleshoot APIPA / DHCP connectivity",category:"Network",summary:"First-line workflow when a Windows endpoint receives a 169.254.x.x address.",views:241,helpful:95,tags:["DHCP","Windows","Network"],body:"Check physical link, switch port, ipconfig /all, DHCP scope availability, VLAN assignment, and DHCP relay. Renew the lease only after validating the physical and Layer 2 path."},
    {id:3,title:"Repeated Active Directory account lockout",category:"Account Access",summary:"Identify stale credentials and common lockout sources without repeatedly resetting the password.",views:156,helpful:94,tags:["AD","Lockout","Windows"],body:"Check lockout source, mapped drives, scheduled tasks, mobile mail profiles, saved RDP credentials, and services running under the user account. Remove stale credentials and monitor for recurrence."},
    {id:4,title:"Outlook desktop synchronization checklist",category:"Microsoft 365",summary:"Validate connectivity, cached mode, profile state, and Microsoft 365 service health.",views:132,helpful:92,tags:["Outlook","M365","Email"],body:"Confirm Outlook Web works, verify service health, check Work Offline, inspect connection status, test safe mode, rebuild OST if appropriate, and recreate the profile only after less disruptive checks."},
    {id:5,title:"Printer offline - service desk triage",category:"Printer",summary:"Standard checks for locally reachable network printers reporting offline.",views:205,helpful:90,tags:["Printer","Spooler","TCP/IP"],body:"Verify device power and display errors, ping the printer, open its web interface, validate the Standard TCP/IP port, clear stuck jobs, restart the print spooler, and confirm consumable/hardware state."},
    {id:6,title:"New user onboarding checklist",category:"Account Access",summary:"Standard account, Microsoft 365, groups, device, VPN, and access checklist for new employees.",views:98,helpful:99,tags:["Onboarding","M365","AD"],body:"Create identity, assign approved groups and M365 license, prepare temporary password, enroll MFA, provision device, verify VPN, map required resources, and document completion."}
  ];

  return {generated_at:new Date(now).toISOString(),users,assets,tickets,knowledge};
})();