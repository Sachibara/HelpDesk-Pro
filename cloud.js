(() => {
  "use strict";

  const SUPABASE_URL = "https://qyizwyvgbywkextsekpj.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_lfqzmccDSsdjlHbMD2MJ2w_r8g3sYni";

  if (!window.supabase || !window.supabase.createClient) {
    console.error("Supabase client library failed to load.");
    window.OpsFusionCloud = { available:false };
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  let session = null;
  let workspaceId = null;
  let workspaceOwnerId = null;
  let role = "demo";
  let workspaceUpdatedAt = null;
  let saveQueue = Promise.resolve();
  // Supabase implicit password-recovery links include "type=recovery" in the fragment.
  let passwordRecovery = /(?:^|[&#])type=recovery(?:&|$)/.test(window.location?.hash || "");

  async function init() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    session = data.session || null;
    return session;
  }

  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    session = data.session || null;
    return data;
  }

  async function signUp(email, password, displayName) {
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName || "OpsFusion User" },
        // This is a public domain, not a secret. Also whitelist it in
        // Supabase Authentication > URL Configuration.
        emailRedirectTo: "https://opsfusion-it.vercel.app/"
      }
    });
    if (error) throw error;
    session = data.session || null;
    return data;
  }

  async function requestPasswordReset(email) {
    const normalizedEmail = String(email || "").trim();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("Enter your account email address first.");
    }
    const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: "https://opsfusion-it.vercel.app/"
    });
    if (error) throw error;
    return true;
  }

  function isPasswordRecovery() { return passwordRecovery; }
  function completePasswordRecovery() {
    passwordRecovery = false;
    // Drop recovery tokens and stale recovery markers from the address bar.
    if (window.history?.replaceState && window.location) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  async function changePassword(nextPassword) {
    if (!session) throw new Error("Sign in before changing your password.");
    if (typeof nextPassword !== "string" || nextPassword.length < 12) {
      throw new Error("Use a password with at least 12 characters.");
    }
    const { error } = await client.auth.updateUser({ password: nextPassword });
    if (error) throw error;
    return true;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    session = null;
    workspaceId = null;
    workspaceOwnerId = null;
    workspaceUpdatedAt = null;
    role = "demo";
  }

  async function bootstrap(seedState, displayName) {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError) throw authError;
    const user = authData.user;
    if (!user) throw new Error("No authenticated user session.");

    const profileName =
      displayName ||
      user.user_metadata?.display_name ||
      user.email?.split("@")[0] ||
      "OpsFusion User";

    // Separate insert/update avoids changing the immutable user_id in an UPSERT.
    // RLS limits the row to the signed-in user and column grants protect identity.
    const { data: existingProfile, error: profileLookupError } = await client
      .from("opsfusion_profiles")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileLookupError) throw profileLookupError;

    const profileMutation = existingProfile
      ? client.from("opsfusion_profiles")
          .update({ display_name: profileName, updated_at: new Date().toISOString() })
          .eq("user_id", user.id)
      : client.from("opsfusion_profiles")
          .insert({ user_id: user.id, display_name: profileName });
    const { error: profileError } = await profileMutation;
    if (profileError) throw profileError;

    let { data: workspaces, error: workspaceReadError } = await client
      .from("opsfusion_workspaces")
      .select("id, owner_id, name, state, created_at, updated_at")
      .order("created_at", { ascending: true })
      .limit(1);
    if (workspaceReadError) throw workspaceReadError;

    let workspace = workspaces?.[0] || null;

    if (!workspace) {
      const { data: created, error: workspaceCreateError } = await client
        .from("opsfusion_workspaces")
        .insert({
          owner_id: user.id,
          name: seedState?.meta?.workspaceName || "OpsFusion Unified",
          state: seedState || {}
        })
        .select("id, owner_id, name, state, created_at, updated_at")
        .single();
      if (workspaceCreateError) throw workspaceCreateError;
      workspace = created;

      const { error: membershipError } = await client
        .from("opsfusion_memberships")
        .insert({
          workspace_id: workspace.id,
          user_id: user.id,
          role: "admin"
        });
      if (membershipError) throw membershipError;
    }

    workspaceId = workspace.id;
    workspaceOwnerId = workspace.owner_id;
    workspaceUpdatedAt = workspace.updated_at;

    const { data: membership, error: membershipReadError } = await client
      .from("opsfusion_memberships")
      .select("role")
      .eq("workspace_id", workspace.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipReadError) throw membershipReadError;

    role = workspace.owner_id === user.id ? "admin" : (membership?.role || "viewer");

    const { data: serverAudit, error: auditError } = await client
      .from("opsfusion_audit_events")
      .select("id, module, action, target, detail, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(250);
    if (auditError) throw auditError;

    return {
      user,
      role,
      workspaceId,
      workspaceName: workspace.name,
      state: workspace.state && Object.keys(workspace.state).length ? workspace.state : seedState,
      audit: (serverAudit || []).map((row) => ({
        id: row.id,
        module: row.module,
        action: row.action,
        target: row.target,
        detail: row.detail,
        createdAt: row.created_at
      }))
    };
  }

  async function saveWorkspace(nextState) {
    if (!session || !workspaceId) throw new Error("Cloud session expired. Sign in again before saving.");
    if (role === "viewer") throw new Error("Your workspace role is read-only.");
    if (!workspaceUpdatedAt) throw new Error("No workspace revision found. Reload your cloud workspace.");
    const targetId = workspaceId;
    const targetUserId = session.user.id;
    // Capture the content now, so later UI edits cannot mutate an in-flight save.
    const snapshot = JSON.parse(JSON.stringify(nextState));
    const performSave = async () => {
      if (!session || session.user.id !== targetUserId || workspaceId !== targetId) {
        throw new Error("Account or workspace changed during save; the changes were not written.");
      }
      const { data, error } = await client
        .from("opsfusion_workspaces")
        .update({
          name: snapshot?.meta?.workspaceName || "OpsFusion Unified",
          state: snapshot,
          updated_at: new Date(Math.max(Date.now(), Date.parse(workspaceUpdatedAt) + 1)).toISOString()
        })
        .eq("id", targetId)
        .eq("updated_at", workspaceUpdatedAt)
        .select("updated_at")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error("Save conflict: this workspace changed on another device. Export your unsaved work before refreshing.");
      }
      workspaceUpdatedAt = data.updated_at;
      return data;
    };
    // Serialize multiple edits and protect against lost updates across devices.
    saveQueue = saveQueue.then(performSave, performSave);
    return saveQueue;
  }

  async function pushAudit(event) {
    if (!session || !workspaceId || role === "viewer") return;
    const userId = session.user?.id;
    if (!userId) return;
    const { error } = await client
      .from("opsfusion_audit_events")
      .insert({
        workspace_id: workspaceId,
        actor_id: userId,
        module: String(event.module || "System"),
        action: String(event.action || "Action"),
        target: String(event.target || ""),
        detail: String(event.detail || ""),
        created_at: event.createdAt || new Date().toISOString()
      });
    if (error) throw error;
  }

  async function refreshWorkspace() {
    if (!session || !workspaceId) throw new Error("Sign in to refresh your cloud workspace.");
    const { data: workspace, error: workspaceError } = await client
      .from("opsfusion_workspaces")
      .select("id, name, state, updated_at")
      .eq("id", workspaceId)
      .single();
    if (workspaceError) throw workspaceError;
    workspaceUpdatedAt = workspace.updated_at;
    const { data: audit, error: auditError } = await client
      .from("opsfusion_audit_events")
      .select("id, module, action, target, detail, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(250);
    if (auditError) throw auditError;
    return {
      state: workspace.state,
      audit: (audit || []).map((row) => ({
        id: row.id, module: row.module, action: row.action,
        target: row.target, detail: row.detail, createdAt: row.created_at
      })),
      updatedAt: workspace.updated_at
    };
  }

  async function loadAutomations() {
    if (!session || !workspaceId) throw new Error("Sign in to load automation records.");
    const [settings, alerts, runs] = await Promise.all([
      client.from("opsfusion_automation_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
      client.from("opsfusion_automation_alerts").select("*").eq("workspace_id",workspaceId)
        .order("last_detected",{ascending:false}).limit(100),
      client.from("opsfusion_automation_runs").select("*").eq("workspace_id",workspaceId)
        .order("executed_at",{ascending:false}).limit(30)
    ]);
    for (const response of [settings,alerts,runs]) if(response.error) throw response.error;
    return {settings:settings.data,alerts:alerts.data||[],runs:runs.data||[]};
  }

  async function saveAutomationRules(input) {
    if (!session || !workspaceId || workspaceOwnerId !== session.user.id) {
      throw new Error("Only the workspace owner can change automation rules.");
    }
    const days = Number(input.warranty_days),maintenance = Number(input.maintenance_days);
    if(!Number.isInteger(days)||days<1||days>365||!Number.isInteger(maintenance)||maintenance<0||maintenance>90) {
      throw new Error("Warranty days must be 1–365; maintenance days must be 0–90.");
    }
    const update = {
      ticket_sla_enabled:input.ticket_sla_enabled === true,
      warranty_enabled:input.warranty_enabled === true,
      maintenance_enabled:input.maintenance_enabled === true,
      warranty_days:days,maintenance_days:maintenance
    };
    const {data,error} = await client.from("opsfusion_automation_settings")
      .update(update).eq("workspace_id",workspaceId).select("*").single();
    if(error) throw error;
    return data;
  }

  async function runAutomations() {
    if (!session || !workspaceId || role === "viewer") throw new Error("Automation requires an authorized account.");
    const {data,error}=await client.rpc("opsfusion_run_automations",{p_workspace_id:workspaceId});
    if(error) throw error;
    return data;
  }

  async function acknowledgeAutomation(eventKey) {
    if (!session || !workspaceId || workspaceOwnerId !== session.user.id) {
      throw new Error("Only a workspace owner can acknowledge automation alerts.");
    }
    const {data,error}=await client.from("opsfusion_automation_alerts")
      .update({status:"acknowledged"})
      .eq("workspace_id",workspaceId).eq("event_key",eventKey).eq("status","open")
      .select("event_key").maybeSingle();
    if(error) throw error;
    return !!data;
  }

  async function analyzeTicket(ticketId) {
    if (!session || !workspaceId || workspaceOwnerId !== session.user?.id) {
      throw new Error("Sign in as the workspace owner to use AI assistance.");
    }
    if (!/^INC-[A-Za-z0-9-]{1,40}$/.test(String(ticketId || ""))) {
      throw new Error("Select a valid Service Desk ticket.");
    }
    const expectedWorkspace=workspaceId;
    const expectedUser=session.user.id;
    const {data,error}=await client.functions.invoke("opsfusion-ai-assistant",{
      method:"POST",
      body:{workspace_id:expectedWorkspace,ticket_id:ticketId}
    });
    if (error) {
      let message=error.message || "AI request failed.";
      // The Edge Function gives a safe, actionable error (no provider secrets).
      if (error.context && typeof error.context.json === "function") {
        try {
          const response=await error.context.json();
          if(response && typeof response.error === "string") message=response.error;
        } catch { /* Keep the original error. */ }
      }
      throw new Error(message);
    }
    if (!session || session.user?.id !== expectedUser || workspaceId !== expectedWorkspace) {
      throw new Error("Account changed while AI was processing. Discarded the response.");
    }
    if (!data || data.ticket_id!==ticketId || !data.analysis) {
      throw new Error("AI provider returned an invalid ticket analysis.");
    }
    return data;
  }

  function isCloudActive() {
    return !!session && !!workspaceId;
  }

  function isWorkspaceOwner() { return !!session && !!workspaceId && workspaceOwnerId === session.user?.id; }
  function getRole() { return role; }
  function getUser() { return session?.user || null; }
  function getWorkspaceId() { return workspaceId; }

  client.auth.onAuthStateChange((event, nextSession) => {
    session = nextSession || null;
    if (event === "PASSWORD_RECOVERY") {
      passwordRecovery = true;
      window.dispatchEvent(new Event("opsfusion-password-recovery"));
    }
    if (!session) {
      workspaceId = null;
      workspaceOwnerId = null;
      workspaceUpdatedAt = null;
      role = "demo";
      if (event === "SIGNED_OUT") window.dispatchEvent(new Event("opsfusion-session-ended"));
    }
  });

  window.OpsFusionCloud = {
    available: true,
    client,
    init,
    signIn,
    signUp,
    requestPasswordReset,
    isPasswordRecovery,
    completePasswordRecovery,
    changePassword,
    signOut,
    bootstrap,
    saveWorkspace,
    refreshWorkspace,
    loadAutomations,
    saveAutomationRules,
    runAutomations,
    acknowledgeAutomation,
    analyzeTicket,
    pushAudit,
    isCloudActive,
    getRole,
    isWorkspaceOwner,
    getUser,
    getWorkspaceId
  };
})();