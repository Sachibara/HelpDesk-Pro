import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../cloud.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function harness({ authenticated = false, signupError = null } = {}) {
  const calls = [];
  const session = authenticated ? { user: { id: 'fixture-user' } } : null;
  const auth = {
    onAuthStateChange() {},
    async getSession() { return { data: { session }, error: null }; },
    async signUp(input) {
      calls.push({ action: 'signup', input });
      return { data: { session: null }, error: signupError };
    },
    async updateUser(input) {
      calls.push({ action: 'update', input });
      return { error: null };
    },
    async signInWithPassword(input) {
      calls.push({ action: 'signin', input });
      return { data: { session: { user: { id: 'fixture-user' } } }, error: null };
    }
  };
  const window = { supabase: { createClient: () => ({ auth }) }, location: { hash: '' } };
  runInNewContext(source, { window, console });
  return { api: window.OpsFusionCloud, calls };
}

test('Signup rejects short and non-string passwords before calling Auth', async () => {
  const { api, calls } = harness();
  for (const password of ['', '12345678', '12345678901', null, undefined, 123456789012]) {
    await assert.rejects(api.signUp('test@example.com', password, 'Test'), /at least 12/);
  }
  assert.equal(calls.length, 0);
});

test('Signup accepts the 12-character boundary and preserves password exactly', async () => {
  const { api, calls } = harness();
  const password = ' abcdefghij ';
  assert.equal(password.length, 12);
  const result = await api.signUp('test@example.com', password, 'Test');
  assert.equal(result.session, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.password, password);
  assert.equal(calls[0].input.options.emailRedirectTo, 'https://opsfusion-it.vercel.app/');
});

test('Signup surfaces Auth policy failures instead of reporting success', async () => {
  const error = new Error('Password rejected by server policy');
  const { api } = harness({ signupError: error });
  await assert.rejects(api.signUp('test@example.com', 'a-long-test-password', 'Test'), e => e === error);
});

test('Existing shorter passwords still reach Auth during sign-in', async () => {
  const { api, calls } = harness();
  await api.signIn('test@example.com', 'old-pass');
  assert.equal(calls[0].action, 'signin');
  assert.equal(calls[0].input.password, 'old-pass');
  assert.equal(api.getUser().id, 'fixture-user');
});

test('Password changes share the signup minimum and preserve valid passwords', async () => {
  const { api, calls } = harness({ authenticated: true });
  await api.init();
  await assert.rejects(api.changePassword('12345678901'), /at least 12/);
  assert.equal(calls.length, 0);
  await api.changePassword('123456789012');
  assert.equal(calls[0].action, 'update');
  assert.equal(calls[0].input.password, '123456789012');
});

test('Password changes still require an authenticated session', async () => {
  const { api, calls } = harness();
  await assert.rejects(api.changePassword('123456789012'), /Sign in/);
  assert.equal(calls.length, 0);
});

test('Signup and recovery forms advertise and enforce the same minimum', () => {
  for (const id of ['authSignupPassword', 'recoveryPassword', 'recoveryPasswordConfirm']) {
    const input = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'))?.[0];
    assert.ok(input, id);
    assert.match(input, /minlength="12"/);
    assert.match(input, /autocomplete="new-password"/);
  }
  assert.doesNotMatch(html, /placeholder="8\+ characters"/);
});
