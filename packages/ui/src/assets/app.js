// cloudhop local UI. Plain DOM, no build step: served as-is by `cloudhop ui`.

const TOKEN_KEY = 'cloudhop-token';
const SESSION_TEXT = {
  valid: 'Session valid',
  refreshable: 'Renews on next use',
  expired: 'Expired: sign in on next use',
  unknown: 'Managed by the cloud CLI',
};

// The token arrives in the URL fragment once; keep it for this tab and clean the address bar.
const fromHash = new URLSearchParams(location.hash.slice(1)).get('token');
if (fromHash) {
  try {
    sessionStorage.setItem(TOKEN_KEY, fromHash);
  } catch {}
  history.replaceState(null, '', location.pathname);
}
let token = fromHash;
try {
  token = token ?? sessionStorage.getItem(TOKEN_KEY);
} catch {}

// A fresh link opened in this same tab only changes the fragment: reload to pick up its token.
addEventListener('hashchange', () => {
  if (new URLSearchParams(location.hash.slice(1)).has('token')) location.reload();
});

const $main = document.getElementById('main');
const $dialog = document.getElementById('dialog');
const $toasts = document.getElementById('toasts');
const $addSource = document.getElementById('add-source');
let state;

/** Tiny element builder: h('button', { class: 'primary', onclick }, 'Save'). */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

class ApiError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

// Calls that may sign in wait for the person in the browser; everything else should answer quickly.
const MAY_SIGN_IN = /^\/api\/sources(\/[^/]+\/(login|sync|targets))?$/;
const QUICK_TIMEOUT_MS = 20_000;

async function api(method, path, body) {
  const waitsForPerson = MAY_SIGN_IN.test(path);
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        'x-cloudhop-token': token ?? '',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: waitsForPerson ? undefined : AbortSignal.timeout(QUICK_TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === 'TimeoutError') {
      throw new ApiError(
        'cloudhop ui is not responding.',
        'Is it paused in your terminal (Ctrl-Z)? Run `fg` there, or stop it and run `cloudhop ui` again.',
      );
    }
    throw new ApiError(
      'cloudhop ui is not running.',
      'Run `cloudhop ui` again and open the new link it prints.',
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(data.error ?? `Request failed (${response.status}).`, data.hint);
  return data;
}

function toast(message, { error = false, hint } = {}) {
  const el = h(
    'div',
    { class: `toast${error ? ' error' : ''}` },
    message,
    hint && h('small', {}, hint),
  );
  $toasts.append(el);
  setTimeout(() => el.remove(), error ? 9000 : 4000);
}

const fail = (error) => toast(error.message, { error: true, hint: error.hint });

/** Disables a button while its action runs. */
async function busy(button, action) {
  button.disabled = true;
  try {
    return await action();
  } finally {
    button.disabled = false;
  }
}

async function refresh() {
  try {
    state = await api('GET', '/api/state');
    render();
    checkDoctor();
  } catch (error) {
    $main.replaceChildren(
      h(
        'div',
        { class: 'hero' },
        h('h2', {}, 'Cannot reach cloudhop'),
        h('p', {}, error.message, error.hint ? ` ${error.hint}` : ''),
      ),
    );
  }
}

async function checkDoctor() {
  try {
    const entries = await api('GET', '/api/doctor');
    const problems = entries.filter((e) => !e.installed || e.outdated);
    document.getElementById('doctor')?.remove();
    if (problems.length === 0) return;
    $main.prepend(
      h(
        'div',
        { class: 'notice', id: 'doctor' },
        ...problems.map((e) =>
          h(
            'div',
            {},
            e.installed
              ? `${e.cli} ${e.version} is older than ${e.minVersion}. `
              : `${e.cli} is not installed, so aliases cannot run commands yet. `,
            'Run ',
            h('code', {}, 'cloudhop doctor'),
            ' in a terminal to install it.',
          ),
        ),
      ),
    );
  } catch {}
}

// ---------- main view ----------

function render() {
  const enabled = state.enabledProviders;
  $addSource.hidden = enabled.length === 0;
  if (enabled.length === 0) return renderChooseClouds();
  if (state.sources.length === 0) {
    $main.replaceChildren(
      h(
        'div',
        { class: 'hero' },
        h('h2', {}, 'Add your first account'),
        h(
          'p',
          {},
          'Add a company SSO portal or a personal account. cloudhop signs you in, finds every account and role you can use, and lets you give each one a short alias.',
        ),
        h('button', { class: 'primary', onclick: () => openAddSource() }, '+ Add source'),
      ),
      assistantsCard(),
    );
    loadAssistants();
    return;
  }
  $main.replaceChildren(...state.sources.map(sourceCard), assistantsCard());
  loadAssistants();
}

// ---------- AI assistants ----------

let assistantScope = 'user';
try {
  assistantScope =
    localStorage.getItem('cloudhop-assistant-scope') === 'project' ? 'project' : 'user';
} catch {}
let assistantsData;

const SKILL_TEXT = {
  current: ['valid', 'Up to date'],
  outdated: ['refreshable', 'Outdated'],
  modified: ['refreshable', 'Edited by you'],
  missing: ['', 'Not installed'],
};
const MCP_TEXT = { registered: 'On', missing: 'Off', unknown: 'Check in the app' };

function assistantsCard() {
  return h('section', { class: 'card', id: 'assistants', hidden: true });
}

async function loadAssistants() {
  try {
    assistantsData = await api('GET', '/api/assistants');
    renderAssistants();
  } catch {
    document.getElementById('assistants')?.remove();
  }
}

function setAssistantScope(scope) {
  assistantScope = scope;
  try {
    localStorage.setItem('cloudhop-assistant-scope', scope);
  } catch {}
  renderAssistants();
}

function assistantAction(label, run, { danger = false, confirmText } = {}) {
  return h(
    'button',
    {
      class: danger ? 'danger' : undefined,
      onclick: (e) => {
        if (confirmText && !confirm(confirmText)) return;
        busy(e.currentTarget, async () => {
          try {
            await run();
          } catch (error) {
            fail(error);
          }
          await loadAssistants();
        });
      },
    },
    label,
  );
}

function reportInstall(results) {
  for (const r of results) {
    if (r.mcp === 'manual') {
      toast(`${r.name}: skill installed. Add the MCP server by hand.`, { hint: r.mcpManual });
    } else {
      toast(`${r.name} now knows cloudhop. Start a new chat so it picks it up.`);
    }
  }
}

function renderAssistants() {
  const el = document.getElementById('assistants');
  if (!el || !assistantsData) return;
  const rows = assistantScope === 'user' ? assistantsData.user : assistantsData.projectScope;
  const scope = assistantScope;
  const install = (tools) =>
    api('POST', '/api/assistants', { tools, scope, mcp: true }).then((r) =>
      reportInstall(r.results),
    );
  const missingDetected = rows
    .filter((r) => r.detected && r.skill === 'missing')
    .map((r) => r.assistant);

  const seg = h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'Where' },
    h(
      'button',
      { 'aria-pressed': String(scope === 'user'), onclick: () => setAssistantScope('user') },
      'For me',
    ),
    h(
      'button',
      { 'aria-pressed': String(scope === 'project'), onclick: () => setAssistantScope('project') },
      'This project',
    ),
  );

  const head = h(
    'div',
    { class: 'card-head' },
    h('h2', {}, 'AI assistants'),
    h(
      'span',
      { class: 'meta' },
      scope === 'user'
        ? 'Installed in your home folder, for every project'
        : assistantsData.project,
    ),
    h('div', { class: 'spacer' }),
    h(
      'div',
      { class: 'actions' },
      seg,
      missingDetected.length > 1
        ? assistantAction('Install for all detected', () => install(missingDetected))
        : null,
    ),
  );

  const table = h(
    'table',
    { class: 'assistants' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', {}, 'Assistant'),
        h('th', {}, 'Skill'),
        h('th', {}, 'MCP server'),
        h('th'),
      ),
    ),
    h(
      'tbody',
      {},
      rows.map((r) => {
        const [badgeClass, skillText] = SKILL_TEXT[r.skill];
        const actions = [];
        if (r.skill === 'missing')
          actions.push(assistantAction('Install', () => install([r.assistant])));
        if (r.skill === 'outdated') {
          actions.push(
            assistantAction('Update', () =>
              api('POST', '/api/assistants/update', {}).then(() =>
                toast(`${r.name}: skill updated.`),
              ),
            ),
          );
        }
        if (r.skill === 'modified') {
          actions.push(
            assistantAction(
              'Replace',
              () =>
                api('POST', '/api/assistants/update', { force: true }).then(() =>
                  toast('Edited skills replaced.'),
                ),
              {
                confirmText: 'Replace your edited copies with the current cloudhop skill?',
              },
            ),
          );
        }
        if (r.skill !== 'missing' || r.mcp === 'registered') {
          actions.push(
            assistantAction(
              'Remove',
              () => api('POST', '/api/assistants/remove', { tools: [r.assistant], scope }),
              {
                danger: true,
                confirmText: `Remove the cloudhop skill and MCP server from ${r.name}?`,
              },
            ),
          );
        }
        return h(
          'tr',
          {},
          h(
            'td',
            { class: 'alias' },
            r.name,
            r.detected ? null : h('small', { class: 'muted-inline' }, ' not detected'),
          ),
          h('td', {}, h('span', { class: `badge ${badgeClass}`, title: r.skillPath }, skillText)),
          h('td', {}, r.skill === 'missing' && r.mcp !== 'registered' ? '' : MCP_TEXT[r.mcp]),
          h(
            'td',
            { style: 'text-align:right' },
            h('div', { class: 'actions', style: 'justify-content:flex-end' }, actions),
          ),
        );
      }),
    ),
  );

  el.replaceChildren(
    head,
    h(
      'div',
      { class: 'card-body' },
      h(
        'p',
        { class: 'card-help' },
        'Teach your AI assistant to use cloudhop: it asks you which alias to work with, runs commands with hop, and confirms before changing anything. Includes the cloudhop MCP server.',
      ),
      table,
    ),
  );
  el.hidden = false;
}

function renderChooseClouds() {
  const boxes = state.providers.map((p) =>
    h(
      'label',
      { class: 'choice' },
      h('input', { type: 'checkbox', value: p.id, checked: true }),
      h('span', {}, p.name),
    ),
  );
  const save = h(
    'button',
    {
      class: 'primary',
      onclick: (e) =>
        busy(e.currentTarget, async () => {
          const ids = boxes
            .map((b) => b.querySelector('input'))
            .filter((i) => i.checked)
            .map((i) => i.value);
          await api('PUT', '/api/providers', { enabled: ids }).catch(fail);
          await refresh();
        }),
    },
    'Continue',
  );
  $main.replaceChildren(
    h(
      'div',
      { class: 'hero' },
      h('h2', {}, 'Which clouds do you use?'),
      h('p', {}, 'Azure and Google Cloud are coming soon.'),
      h(
        'div',
        { class: 'choices', style: 'max-width:320px;margin:0 auto 16px;text-align:left' },
        boxes,
      ),
      save,
    ),
  );
}

function sourceCard(source) {
  const aliases = state.aliases.filter((a) => a.source === source.id);
  const where = source.settings.startUrl ?? source.kindLabel;
  const head = h(
    'div',
    { class: 'card-head' },
    h('h2', {}, source.id),
    h('span', { class: `badge ${source.session}` }, SESSION_TEXT[source.session] ?? source.session),
    h('span', { class: 'meta' }, `${source.providerName} · ${where}`),
    h('div', { class: 'spacer' }),
    h(
      'div',
      { class: 'actions' },
      h('button', { onclick: () => openAliasPicker(source) }, '+ Aliases'),
      h(
        'button',
        {
          title: 'Sign in again and refresh its accounts',
          onclick: (e) =>
            busy(e.currentTarget, async () => {
              toast('Opening the browser to sign in…');
              const report = await api(
                'POST',
                `/api/sources/${encodeURIComponent(source.id)}/login`,
              ).catch(fail);
              if (report)
                toast(`${source.id}: signed in, ${report.targets.length} account/role(s).`);
              await refresh();
            }),
        },
        'Sign in',
      ),
      h(
        'button',
        {
          title: 'Refresh the accounts and roles you have access to',
          onclick: (e) =>
            busy(e.currentTarget, async () => {
              const report = await api(
                'POST',
                `/api/sources/${encodeURIComponent(source.id)}/sync`,
              ).catch(fail);
              if (report) toast(syncMessage(source.id, report));
              await refresh();
            }),
        },
        'Sync',
      ),
      h(
        'button',
        {
          class: 'danger',
          onclick: (e) => {
            const count = aliases.length;
            const message = `Remove "${source.id}"${count ? ` and its ${count} alias(es)` : ''}?`;
            if (!confirm(message)) return;
            busy(e.currentTarget, async () => {
              await api('DELETE', `/api/sources/${encodeURIComponent(source.id)}`).catch(fail);
              await refresh();
            });
          },
        },
        'Remove',
      ),
    ),
  );

  const body =
    aliases.length === 0
      ? h(
          'div',
          { class: 'empty' },
          'No aliases yet. ',
          h(
            'button',
            { class: 'primary', onclick: () => openAliasPicker(source) },
            'Pick accounts',
          ),
        )
      : h(
          'table',
          {},
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', {}, 'Alias'),
              h('th', {}, 'Region'),
              h('th', {}, 'Account / role'),
              h('th'),
            ),
          ),
          h('tbody', {}, aliases.map(aliasRow)),
        );
  return h('section', { class: 'card' }, head, h('div', { class: 'card-body' }, body));
}

function syncMessage(id, report) {
  const parts = [`${report.targets.length} available`];
  if (report.added) parts.push(`${report.added} new`);
  if (report.removed) parts.push(`${report.removed} removed`);
  const orphaned = report.orphanedAliases.length
    ? ` No longer available: ${report.orphanedAliases.join(', ')}.`
    : '';
  return `${id}: ${parts.join(', ')}.${orphaned}`;
}

function aliasRow(alias) {
  const input = h('input', {
    value: alias.region ?? '',
    'aria-label': `Region for ${alias.name}`,
    class: 'mono',
    spellcheck: 'false',
  });
  const save = h('button', { hidden: true }, 'Save');
  const commit = () =>
    busy(save, async () => {
      const region = input.value.trim();
      const done = await api('PATCH', `/api/aliases/${encodeURIComponent(alias.name)}`, {
        region,
      }).catch(fail);
      if (done) toast(`${alias.name} now runs in ${region}.`);
      await refresh();
    });
  input.addEventListener('input', () => {
    save.hidden = input.value.trim() === (alias.region ?? '');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !save.hidden) commit();
    if (e.key === 'Escape') {
      input.value = alias.region ?? '';
      save.hidden = true;
    }
  });
  save.addEventListener('click', commit);

  return h(
    'tr',
    {},
    h('td', { class: 'alias', title: `hop ${alias.name} <command>` }, alias.name),
    h('td', {}, h('div', { class: 'region' }, input, save)),
    h(
      'td',
      {},
      alias.missing
        ? h('span', { class: 'missing' }, `${alias.target} (no longer available)`)
        : alias.label,
    ),
    h(
      'td',
      { style: 'text-align:right' },
      h(
        'button',
        {
          class: 'link',
          title: `Remove ${alias.name}`,
          'aria-label': `Remove ${alias.name}`,
          onclick: (e) => {
            if (!confirm(`Remove alias "${alias.name}"?`)) return;
            busy(e.currentTarget, async () => {
              await api('DELETE', `/api/aliases/${encodeURIComponent(alias.name)}`).catch(fail);
              await refresh();
            });
          },
        },
        '✕',
      ),
    ),
  );
}

// ---------- dialogs ----------

function showDialog(title, body, footer) {
  $dialog.replaceChildren(
    h(
      'div',
      { class: 'dlg-head' },
      h('h2', {}, title),
      h('button', { class: 'link', 'aria-label': 'Close', onclick: () => $dialog.close() }, '✕'),
    ),
    h('div', { class: 'dlg-body' }, body),
    footer ? h('div', { class: 'dlg-foot' }, footer) : null,
  );
  if (!$dialog.open) $dialog.showModal();
}

function suggestSourceId(settings, kind) {
  const host = /^https:\/\/([^./]+)\./.exec(settings.startUrl ?? '')?.[1];
  return slug(host ?? (kind === 'console-login' ? 'personal' : 'main'));
}

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63) || 'main';

/** `previous` refills the form after a failed sign-in: { provider, kind, id, settings, error }. */
function openAddSource(previous) {
  const providers = state.providers.filter((p) => state.enabledProviders.includes(p.id));
  let provider = providers.find((p) => p.id === previous?.provider) ?? providers[0];
  let kind = provider.kinds.find((k) => k.kind === previous?.kind) ?? provider.kinds[0];

  const form = h('form', { onsubmit: (e) => e.preventDefault() });
  const nameInput = h('input', {
    id: 'f-name',
    required: true,
    class: 'mono',
    spellcheck: 'false',
  });
  let nameTouched = Boolean(previous);
  nameInput.addEventListener('input', () => {
    nameTouched = true;
  });

  const fieldInputs = {};
  const fieldsBox = h('div');
  const nameLabel = h('label', { for: 'f-name' });

  function updateSuggestion() {
    if (nameTouched) return;
    const settings = Object.fromEntries(
      Object.entries(fieldInputs).map(([k, i]) => [k, i.value.trim()]),
    );
    const taken = new Set(state.sources.map((s) => s.id));
    let id = suggestSourceId(settings, kind.kind);
    for (let i = 2; taken.has(id); i++) id = `${suggestSourceId(settings, kind.kind)}-${i}`;
    nameInput.value = id;
  }

  function renderFields() {
    for (const key of Object.keys(fieldInputs)) delete fieldInputs[key];
    fieldsBox.replaceChildren(
      ...kind.fields.map((f) => {
        const input = h('input', {
          id: `f-${f.key}`,
          placeholder: f.placeholder ?? f.defaultValue ?? '',
          value: previous?.settings?.[f.key] ?? f.defaultValue ?? '',
          required: true,
          class: 'mono',
          spellcheck: 'false',
          oninput: updateSuggestion,
        });
        fieldInputs[f.key] = input;
        return h('div', { class: 'field' }, h('label', { for: input.id }, f.label), input);
      }),
    );
    nameLabel.textContent = kind.nameLabel ?? 'Short name for this source';
    updateSuggestion();
  }

  const providerSelect =
    providers.length > 1
      ? h(
          'div',
          { class: 'field' },
          h('label', { for: 'f-provider' }, 'Cloud'),
          h(
            'select',
            {
              id: 'f-provider',
              onchange: (e) => {
                provider = providers.find((p) => p.id === e.target.value);
                kind = provider.kinds[0];
                renderKinds();
              },
            },
            providers.map((p) => h('option', { value: p.id, selected: p === provider }, p.name)),
          ),
        )
      : null;

  const kindsBox = h('div', { class: 'choices' });
  function renderKinds() {
    kindsBox.replaceChildren(
      ...provider.kinds.map((k) =>
        h(
          'label',
          { class: 'choice' },
          h('input', {
            type: 'radio',
            name: 'kind',
            value: k.kind,
            checked: k === kind,
            onchange: () => {
              kind = k;
              renderFields();
            },
          }),
          h('span', {}, h('strong', {}, k.label), k.hint ? h('small', {}, k.hint) : null),
        ),
      ),
    );
    renderFields();
  }

  form.append(
    previous?.error
      ? h(
          'div',
          { class: 'notice error' },
          h('strong', {}, 'Could not sign in, so nothing was saved. '),
          previous.error.message,
          previous.error.hint ? h('div', { class: 'help' }, previous.error.hint) : null,
        )
      : '',
    providerSelect ?? '',
    h('div', { class: 'field' }, h('label', {}, 'What do you want to add?')),
    kindsBox,
    fieldsBox,
    h(
      'div',
      { class: 'field' },
      nameLabel,
      nameInput,
      h(
        'span',
        { class: 'help' },
        'Lowercase letters, numbers and dashes. You will see it in ',
        h('code', {}, 'cloudhop ls'),
        '.',
      ),
    ),
  );
  renderKinds();
  if (previous) nameInput.value = previous.id;

  const submit = h('button', { class: 'primary', type: 'submit' }, 'Add and sign in');
  form.addEventListener('submit', async () => {
    if (!form.reportValidity()) return;
    const body = {
      provider: provider.id,
      kind: kind.kind,
      id: nameInput.value.trim(),
      settings: Object.fromEntries(
        Object.entries(fieldInputs).map(([k, i]) => [k, i.value.trim()]),
      ),
    };
    showDialog(
      'Sign in',
      h(
        'div',
        { class: 'waiting' },
        h('div', { class: 'spinner' }),
        h('strong', {}, 'Finish signing in in the browser tab that just opened.'),
        h('p', { class: 'help' }, 'This page continues on its own once you approve the request.'),
      ),
    );
    try {
      const report = await api('POST', '/api/sources', body);
      await refresh();
      const source = state.sources.find((s) => s.id === body.id);
      toast(`Signed in to ${body.id}. ${report.targets.length} account/role(s) found.`);
      openAliasPicker(source, report.targets);
    } catch (error) {
      // Nothing was saved: reopen the form with what was typed so it can be fixed.
      await refresh();
      openAddSource({ ...body, error });
    }
  });

  showDialog('Add source', form, [
    h('button', { type: 'button', onclick: () => $dialog.close() }, 'Cancel'),
    submit,
  ]);
  submit.setAttribute('form', 'add-form');
  form.id = 'add-form';
}

async function openAliasPicker(source, preloaded) {
  let targets = preloaded;
  if (!targets) {
    showDialog(
      `Aliases for ${source.id}`,
      h('div', { class: 'waiting' }, h('div', { class: 'spinner' }), 'Loading accounts…'),
    );
    try {
      targets = (await api('GET', `/api/sources/${encodeURIComponent(source.id)}/targets`)).targets;
    } catch (error) {
      $dialog.close();
      return fail(error);
    }
  }

  const used = new Map(
    state.aliases.filter((a) => a.source === source.id).map((a) => [a.target, a.name]),
  );
  const taken = new Set(state.aliases.map((a) => a.name));
  const defaultRegion = source.settings.region ?? '';
  const filter = h('input', {
    type: 'search',
    placeholder: `Filter ${targets.length} account/role(s)…`,
    style: 'width:100%;margin-bottom:12px',
  });

  const rows = targets.map((t) => {
    const existing = used.get(t.id);
    let name = t.suggestedAlias;
    for (let i = 2; taken.has(name); i++) name = `${t.suggestedAlias}-${i}`;
    const check = h('input', {
      type: 'checkbox',
      disabled: Boolean(existing),
      'aria-label': t.label,
    });
    const aliasInput = h('input', {
      value: name,
      class: 'mono',
      spellcheck: 'false',
      'aria-label': `Alias for ${t.label}`,
      placeholder: 'alias',
    });
    const regionInput = h('input', {
      value: defaultRegion,
      class: 'mono',
      spellcheck: 'false',
      'aria-label': `Region for ${t.label}`,
      placeholder: 'region',
    });
    // Only the checkbox and its text sit in the label, so clicking the inputs never toggles it.
    const el = h(
      'div',
      { class: 'target' },
      h(
        'label',
        { class: 'pick' },
        check,
        h(
          'span',
          {},
          t.label,
          existing ? h('small', { class: 'already' }, `Already: ${existing}`) : null,
        ),
      ),
      h('div', { class: 'inputs' }, aliasInput, regionInput),
    );
    return { target: t, el, check, aliasInput, regionInput };
  });

  filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    for (const row of rows) row.el.hidden = q !== '' && !row.target.label.toLowerCase().includes(q);
  });

  const save = h('button', { class: 'primary' }, 'Create aliases');
  save.addEventListener('click', () =>
    busy(save, async () => {
      const aliases = rows
        .filter((r) => r.check.checked)
        .map((r) => ({
          source: source.id,
          target: r.target.id,
          name: r.aliasInput.value.trim(),
          region: r.regionInput.value.trim(),
        }));
      if (aliases.length === 0) return toast('Pick at least one account/role.', { error: true });
      try {
        const result = await api('POST', '/api/aliases', { aliases });
        $dialog.close();
        toast(`Created ${result.created.join(', ')}. Try: hop ${result.created[0]}`);
        await refresh();
      } catch (error) {
        fail(error);
      }
    }),
  );

  const body =
    targets.length === 0
      ? h('p', { class: 'empty' }, 'This source has no accounts or roles assigned to you.')
      : h(
          'div',
          {},
          filter,
          h(
            'div',
            { class: 'targets' },
            rows.map((r) => r.el),
          ),
        );
  showDialog(`Aliases for ${source.id}`, body, [
    h('span', { class: 'note' }, 'Check an account/role, then name its alias and region.'),
    h('button', { onclick: () => $dialog.close() }, 'Cancel'),
    targets.length ? save : null,
  ]);
}

$addSource.addEventListener('click', () => openAddSource());

if (!token) {
  $main.replaceChildren(
    h(
      'div',
      { class: 'hero' },
      h('h2', {}, 'Open the link from your terminal'),
      h('p', {}, 'Run cloudhop ui and open the link it prints. It includes a one-time access key.'),
    ),
  );
} else {
  refresh();
}
