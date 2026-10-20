(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const client = window.supabase.createClient(
    'https://qyizwyvgbywkextsekpj.supabase.co',
    'sb_publishable_lfqzmccDSsdjlHbMD2MJ2w_r8g3sYni'
  );
  let busy = false;
  let needsPassword = true;
  let epoch = 0;

  const say = (message, type = 'info') => {
    const notice = $('notice');
    notice.textContent = message;
    notice.className = `notice${type === 'error' ? ' error' : type === 'success' ? ' success' : ''}`;
  };
  const rpc = async (action, payload = {}) => {
    const { data, error } = await client.rpc('opsfusion_invitations_manage', {
      p_action: action,
      p_payload: payload
    });
    if (error) throw error;
    return data;
  };

  async function run(fn) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
      await fn();
    } catch (error) {
      say(error.message || 'Unable to continue. Please try again.', 'error');
    } finally {
      busy = false;
      document.querySelectorAll('button').forEach(button => { button.disabled = false; });
      document.querySelectorAll('[data-accept]').forEach(button => { button.disabled = needsPassword; });
    }
  }

  function renderInvitation(invitation) {
    const card = el('article', '', 'invite-item');
    const kind = invitation.kind === 'staff' ? 'IT workspace access' : 'Employee support access';
    const description = invitation.kind === 'staff'
      ? 'Work with shared tickets, inventory, AI assistance, and automation. Workspace account management remains with the owner.'
      : 'Submit and follow your own support requests. This invitation does not grant access to the IT workspace.';
    const badge = el('span', kind, 'invite-kind');
    const title = el('h3', invitation.workspace);
    const detail = el('p', description);
    const expiry = el('p', `Accept by ${new Date(invitation.expires_at).toLocaleString()}`, 'invite-expiry');
    const accept = el('button', 'Accept invitation', 'primary');
    accept.type = 'button';
    accept.dataset.accept = 'true';
    accept.disabled = needsPassword;
    accept.setAttribute('aria-label', `Accept ${kind} for ${invitation.workspace}`);
    accept.onclick = () => run(async () => {
      const result = await rpc('accept', { id: invitation.id });
      await load();
      say(result.already_accepted
        ? 'This invitation was already used. Ask the workspace owner if you need access restored.'
        : 'Invitation accepted. Your access is ready.', result.already_accepted ? 'info' : 'success');
      const link = el('a', invitation.kind === 'staff' ? 'Open IT workspace →' : 'Open employee support →');
      link.href = invitation.kind === 'staff' ? '/' : '/employee';
      link.className = 'invite-destination';
      $('invitations').append(link);
    });
    card.append(badge, title, detail, expiry, accept);
    return card;
  }

  async function load() {
    const version = ++epoch;
    const { data, error } = await client.auth.getUser();
    if (version !== epoch) return;

    $('invitations').replaceChildren();
    $('setup').hidden = true;
    $('signedOut').hidden = !!data?.user;
    $('signedIn').hidden = !data?.user;
    if (error || !data?.user) {
      say('Sign in with the email address that received your invitation.');
      return;
    }

    $('account').textContent = `Signed in as ${data.user.email}`;
    const result = await rpc('mine');
    if (version !== epoch) return;
    const invitations = result.invitations || [];
    needsPassword = result.needs_password;
    $('setup').hidden = !needsPassword || !invitations.length;
    say(invitations.length
      ? 'Review the workspace and access type before accepting.'
      : 'No active invitations are available for this account. The invitation may have expired, been cancelled, or already been accepted.',
    invitations.length ? 'info' : 'info');

    if (!invitations.length) {
      $('invitations').append(el('p', 'When a workspace owner invites this email, the invitation will appear here.', 'invite-empty'));
      return;
    }
    for (const invitation of invitations) $('invitations').append(renderInvitation(invitation));
  }

  $('loginForm').onsubmit = event => {
    event.preventDefault();
    run(async () => {
      const { error } = await client.auth.signInWithPassword({
        email: $('email').value.trim(),
        password: $('password').value
      });
      $('password').value = '';
      if (error) throw error;
      await load();
    });
  };

  $('setup').onsubmit = event => {
    event.preventDefault();
    run(async () => {
      const password = $('newPassword').value;
      if (password.length < 12 || password.length > 128 || password !== $('confirmPassword').value) {
        throw new Error('Enter matching passwords with 12–128 characters.');
      }
      const { error } = await client.auth.updateUser({ password });
      $('newPassword').value = '';
      $('confirmPassword').value = '';
      if (error) throw error;
      await load();
      say('Password saved. You can now accept your invitation.', 'success');
    });
  };

  $('signOut').onclick = () => run(async () => {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    await load();
  });
  $('refresh').onclick = () => run(load);
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') {
      epoch += 1;
      needsPassword = true;
      $('invitations').replaceChildren();
      $('setup').reset();
      $('setup').hidden = true;
      $('signedIn').hidden = true;
      $('signedOut').hidden = false;
      say('You have signed out. Sign in with the invited email to continue.');
    }
  });

  run(async () => {
    await client.auth.getSession();
    history.replaceState(null, '', location.pathname);
    await load();
  });
})();
