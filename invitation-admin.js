(() => {
  const $ = id => document.getElementById(id);
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  window.OpsFusionInvitations = {
    open: async (kind = 'staff') => {
      const cloud = window.OpsFusionCloud;
      if (!cloud?.isWorkspaceOwner()) return;

      const workspace = cloud.getWorkspaceId();
      const userId = cloud.getUser().id;
      const dialog = $('invitationDialog');
      const body = $('invitationBody');
      body.replaceChildren();
      dialog.showModal();

      const isCurrent = () => dialog.open && cloud.isWorkspaceOwner()
        && workspace === cloud.getWorkspaceId() && userId === cloud.getUser()?.id;
      const status = el('p', 'Loading invitations…', 'access-status invitation-status');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');

      const form = el('form', undefined, 'access-form');
      const email = el('input');
      const identity = el('select');
      const submit = el('button', 'Send invitation', 'btn primary');
      const rows = el('div', undefined, 'access-enrollments');
      email.type = 'email';
      email.required = true;
      email.autocomplete = 'email';
      email.inputMode = 'email';
      email.maxLength = 254;
      email.setAttribute('aria-label', 'Recipient email');
      const emailLabel = el('label', undefined, 'field');
      emailLabel.append(el('span', 'Recipient email'), email);
      form.append(emailLabel);

      if (kind === 'employee') {
        identity.required = true;
        identity.setAttribute('aria-label', 'Employee identity');
        const identityLabel = el('label', undefined, 'field');
        identityLabel.append(el('span', 'Employee identity'), identity);
        form.append(identityLabel);
      }
      submit.type = 'submit';
      form.append(submit, status);

      const intro = el('p', kind === 'staff'
        ? 'Invite an IT member to work with the shared workspace. Access begins only after the recipient accepts; account management stays with the owner.'
        : 'Invite an employee to their own support portal. Select their active identity record. This invitation does not grant IT workspace access.',
      'invitation-intro-copy');
      const help = el('p', 'Invitations expire after 48 hours. New recipients verify their email and choose their own password. Existing passwords stay unchanged. “Email accepted” means the provider accepted the request; it does not confirm inbox delivery.', 'invitation-help-copy');
      body.append(intro, help, form, rows);

      let busy = false;
      const validate = () => {
        email.disabled = identity.disabled = busy;
        submit.disabled = busy || !isCurrent() || !email.checkValidity()
          || (kind === 'employee' && !identity.value);
      };
      form.oninput = validate;

      const rpc = async (action, payload = {}) => {
        if (!isCurrent()) throw new Error('Workspace session changed. Reopen this dialog to continue.');
        const { data, error } = await cloud.client.rpc('opsfusion_invitations_manage', {
          p_action: action,
          p_workspace: workspace,
          p_payload: payload
        });
        if (error) throw error;
        if (!isCurrent()) throw new Error('Workspace session changed. Reopen this dialog to continue.');
        return data;
      };
      const send = async (action, extra = {}) => {
        const { data, error } = await cloud.client.functions.invoke('opsfusion-invitations', {
          body: { action, workspace_id: workspace, ...extra }
        });
        if (error) {
          let message = error.message;
          try { message = (await error.context.json()).error || message; } catch { /* Keep the SDK message. */ }
          throw new Error(message);
        }
        if (!data?.ok) throw new Error('Invitation could not be confirmed. Please check the list and try again.');
        return data;
      };

      const refresh = async () => {
        const invitations = await rpc('list');
        rows.replaceChildren(el('h3', 'Invitation history', 'invitation-history-title'));
        if (kind === 'employee') {
          const { data, error } = await cloud.client.from('opsfusion_workspaces')
            .select('state').eq('id', workspace).single();
          if (error) throw error;
          const { data: enrolled, error: accessError } = await cloud.client.rpc('opsfusion_employee_portal', {
            p_action: 'access_list', p_workspace: workspace, p_payload: {}
          });
          if (accessError) throw accessError;
          if (!isCurrent()) return;

          const previous = identity.value;
          identity.replaceChildren();
          const placeholder = el('option', 'Choose an active employee identity');
          placeholder.value = '';
          identity.append(placeholder);
          for (const person of data.state.identities || []) {
            const alreadyEnrolled = enrolled.some(access => access.identity_id === person.id);
            const hasOpenInvite = invitations.some(invite => invite.kind === 'employee'
              && invite.identity_id === person.id && ['pending', 'expired'].includes(invite.status));
            if (person.status === 'Active' && !alreadyEnrolled && !hasOpenInvite) {
              const option = el('option', person.displayName);
              option.value = person.id;
              identity.append(option);
            }
          }
          identity.value = Array.from(identity.options).some(option => option.value === previous) ? previous : '';
        }

        const relevant = invitations.filter(invite => invite.kind === kind);
        if (!relevant.length) {
          rows.append(el('p', 'No invitations in this list yet.', 'invitation-history-empty'));
        }
        for (const invite of relevant) {
          const row = el('article', undefined, 'access-enrollment invitation-admin-row');
          const details = el('div', undefined, 'invitation-admin-details');
          details.append(el('strong', invite.email, 'invitation-admin-email'));
          const metadata = el('div', undefined, 'invitation-admin-meta');
          metadata.append(
            el('span', invite.status, `invitation-state ${invite.status}`),
            el('span', `Email ${invite.delivery}`, `invitation-delivery ${invite.delivery}`),
            el('span', `Expires ${new Date(invite.expires_at).toLocaleString()}`, 'invitation-expiry')
          );
          details.append(metadata);
          row.append(details);

          if (['pending', 'expired'].includes(invite.status)) {
            const actions = el('div', undefined, 'invitation-admin-actions');
            for (const [action, label] of [['resend', 'Resend'], ['cancel', 'Cancel']]) {
              const button = el('button', label, `btn ${action === 'cancel' ? 'secondary' : 'primary'}`);
              button.type = 'button';
              button.onclick = () => act(async () => {
                if (action === 'resend') await send(action, { id: invite.id });
                else await rpc(action, { id: invite.id });
                await refresh();
                setStatus(action === 'resend' ? 'Invitation email requested again.' : 'Invitation cancelled. It cannot grant access.', 'success');
              });
              actions.append(button);
            }
            row.append(actions);
          }
          rows.append(row);
        }
        validate();
      };

      const setStatus = (message, type = 'info') => {
        status.textContent = message;
        status.className = `access-status invitation-status${type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : ''}`;
      };
      const act = async action => {
        if (busy || !isCurrent()) return;
        busy = true;
        validate();
        rows.querySelectorAll('button').forEach(button => { button.disabled = true; });
        try {
          await action();
        } catch (error) {
          setStatus(error.message, 'error');
          try { await refresh(); } catch { /* Keep the original failure visible. */ }
        } finally {
          busy = false;
          validate();
          rows.querySelectorAll('button').forEach(button => { button.disabled = false; });
        }
      };

      form.onsubmit = event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        act(async () => {
          setStatus('Sending invitation…');
          await send('create', {
            email: email.value.trim(),
            kind,
            identity_id: kind === 'employee' ? identity.value : undefined
          });
          email.value = '';
          await refresh();
          setStatus('Invitation email requested. Access remains pending until the recipient accepts.', 'success');
        });
      };

      try {
        await refresh();
        setStatus('The recipient must accept the invitation before access begins.');
      } catch (error) {
        setStatus(error.message, 'error');
      }
      validate();
    }
  };

  $('invitationClose').onclick = () => $('invitationDialog').close();
  $('inviteEmployeeOpen').onclick = () => window.OpsFusionInvitations.open('employee');
})();
