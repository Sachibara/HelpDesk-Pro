(() => {
  "use strict";

  const SUPABASE_URL = "https://taizmxigaeyrxtvnnzbw.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_EmCXMq9_SNjG-ISf6_9v7Q_iHZsLz29";

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
      options: { data: { display_name: displayName || "OpsFusion User" } }
    });
    if (error) throw error;
    session = data.session || null;
    return data;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    session = null;
    workspaceId = null;
    workspaceOwnerId = null;
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

    const { error: profileError } = await client
      .from("opsfusion_profiles")
      .upsert({
        user_id: user.id,
        display_name: profileName,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
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
    if (!session || !workspaceId) return;
    if (role === "viewer") return;
    const { error } = await client
      .from("opsfusion_workspaces")
      .update({
        name: nextState?.meta?.workspaceName || "OpsFusion Unified",
        state: nextState,
        updated_at: new Date().toISOString()
      })
      .eq("id", workspaceId);
    if (error) throw error;
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

  function isCloudActive() {
    return !!session && !!workspaceId;
  }

  function getRole() { return role; }
  function getUser() { return session?.user || null; }
  function getWorkspaceId() { return workspaceId; }

  client.auth.onAuthStateChange((_event, nextSession) => {
    session = nextSession || null;
    if (!session) {
      workspaceId = null;
      workspaceOwnerId = null;
      role = "demo";
    }
  });

  window.OpsFusionCloud = {
    available: true,
    client,
    init,
    signIn,
    signUp,
    signOut,
    bootstrap,
    saveWorkspace,
    pushAudit,
    isCloudActive,
    getRole,
    getUser,
    getWorkspaceId
  };
})();