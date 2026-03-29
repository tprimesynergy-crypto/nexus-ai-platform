/**
 * NEXUS AI PLATFORM — Frontend App
 * Prime Synergy Group — TANGER NEXUS 2026
 */

'use strict';

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  workflows: {},
  targets: [],
  runs: [],
  kpis: {},
  objectives: {},
  currentModal: null,
  ws: null
};

// ─── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  const week = `${now.toLocaleDateString('fr-FR', { day:'2-digit', month:'long' })}`;
  document.getElementById('currentWeek').textContent = week;

  initWebSocket();
  loadWorkflows();
  loadKPIs();
  loadRuns();
  loadTargets();
  loadStatus();
  renderKanban([]);
});

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
function initWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}`;

  try {
    state.ws = new WebSocket(wsUrl);
    state.ws.onopen = () => {
      setWsStatus('connected', 'Connecté en temps réel');
    };
    state.ws.onclose = () => {
      setWsStatus('error', 'Déconnecté — reconnecter...');
      setTimeout(initWebSocket, 5000);
    };
    state.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        handleWsMessage(msg);
      } catch(e) {}
    };
  } catch(e) {
    setWsStatus('error', 'WebSocket indisponible');
  }
}

function setWsStatus(status, text) {
  const dot = document.getElementById('wsIndicator').querySelector('.ws-dot');
  const txt = document.getElementById('wsIndicator').querySelector('.ws-text');
  dot.className = `ws-dot ${status}`;
  txt.textContent = text;
}

function handleWsMessage(msg) {
  switch(msg.type) {
    case 'workflow_triggered':
      state.runs.unshift(msg.data);
      renderRuns();
      updateNotifBadge();
      break;
    case 'workflow_result':
    case 'workflow_error':
    case 'workflow_completed':
      const idx = state.runs.findIndex(r => r.run_id === msg.data.run_id);
      if (idx >= 0) state.runs[idx] = msg.data;
      else state.runs.unshift(msg.data);
      renderRuns();
      if (msg.type === 'workflow_error') {
        toast('error', 'Erreur Agent', `${msg.data.workflow_name} — ${msg.data.error}`);
      } else {
        toast('success', 'Agent terminé', `${msg.data.workflow_name} — succès`);
      }
      break;
    case 'kpis_updated':
      state.kpis = msg.data;
      renderKPIs();
      break;
    case 'target_added':
      state.targets.unshift(msg.data);
      renderTargets();
      renderKanban(state.targets);
      break;
    case 'target_updated':
      const t = state.targets.find(x => x.id === msg.data.id);
      if (t) { t.status = msg.data.status; renderKanban(state.targets); }
      break;
  }
}

// ─── API HELPERS ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opts);
  return r.json();
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById(`page-${pageId}`);
  if (page) page.classList.add('active');

  const nav = document.querySelector(`[data-page="${pageId}"]`);
  if (nav) nav.classList.add('active');

  const titles = {
    dashboard: 'Dashboard', agents: 'Agents IA', pipeline: 'Pipeline CRM',
    research: 'Recherche Cibles', email: 'Emails & Newsletter',
    content: 'Contenu & Social', intelligence: 'Veille & Intelligence',
    history: 'Historique', targets: 'Gestion Cibles', settings: 'Configuration'
  };
  document.getElementById('pageTitle').textContent = titles[pageId] || pageId;

  // Lazy init forms
  if (pageId === 'research' && !document.querySelector('#wf03-form .form-stack')) renderWFForm('WF-03', 'wf03-form');
  if (pageId === 'email') {
    if (!document.querySelector('#wf04-form .form-stack')) renderWFForm('WF-04', 'wf04-form');
    if (!document.querySelector('#wf05-form .form-stack')) renderWFForm('WF-05', 'wf05-form');
    if (!document.querySelector('#wf12-form .form-stack')) renderWFForm('WF-12', 'wf12-form');
  }
  if (pageId === 'content') {
    if (!document.querySelector('#wf06-form .form-stack')) renderWFForm('WF-06', 'wf06-form');
    if (!document.querySelector('#wf08-form .form-stack')) renderWFForm('WF-08', 'wf08-form');
  }
  if (pageId === 'intelligence') {
    if (!document.querySelector('#wf07-form .form-stack')) renderWFForm('WF-07', 'wf07-form');
    if (!document.querySelector('#wf02-form .form-stack')) renderWFForm('WF-02', 'wf02-form');
  }
  if (pageId === 'history') loadRuns();
  if (pageId === 'targets') { loadTargets(); }
  if (pageId === 'settings') loadStatus();

  // Mobile: close sidebar
  if (window.innerWidth < 768) {
    document.getElementById('sidebar').classList.remove('open');
  }
}

function toggleSidebar() {
  const s = document.getElementById('sidebar');
  if (window.innerWidth < 768) {
    s.classList.toggle('open');
  } else {
    s.classList.toggle('hidden');
    document.querySelector('.main-content').style.marginLeft =
      s.classList.contains('hidden') ? '0' : 'var(--sidebar-w)';
  }
}

// ─── WORKFLOWS ────────────────────────────────────────────────────────────────
async function loadWorkflows() {
  try {
    const data = await api('GET', '/workflows');
    data.workflows.forEach(wf => state.workflows[wf.id] = wf);
    renderAgentsGrid();
  } catch(e) {
    console.warn('Workflows load error:', e);
    // Use fallback data
    renderAgentsGridFallback();
  }
}

function renderAgentsGrid() {
  const grid = document.getElementById('agentsGrid');
  const wfs = Object.values(state.workflows);
  if (!wfs.length) { renderAgentsGridFallback(); return; }
  grid.innerHTML = wfs.map(wf => agentCardHTML(wf)).join('');
}

function renderAgentsGridFallback() {
  // Static fallback if API not reachable
  const fallback = [
    {id:'WF-01', name:'Intake & Arborescence', category:'setup', description:'Crée arborescence projet et déclenche WF-02', icon:'📁', color:'#6366f1'},
    {id:'WF-02', name:'Fiche Contexte Marché', category:'research', description:'Analyse marché via OpenAI + Gemini', icon:'🌍', color:'#8b5cf6'},
    {id:'WF-03', name:'Recherche Cible', category:'research', description:'Fiche cible complète : identité, décideurs, signaux business', icon:'🔍', color:'#3b82f6'},
    {id:'WF-04', name:'Email Personnalisé', category:'commercial', description:'Génère email de prospection ultra-personnalisé', icon:'✉️', color:'#10b981'},
    {id:'WF-05', name:'Newsletter Factory', category:'marketing', description:'Crée newsletter HTML + liste Brevo complète', icon:'📧', color:'#f59e0b'},
    {id:'WF-06', name:'Pack Social Media', category:'marketing', description:'Posts LinkedIn / Instagram / X multi-plateforme', icon:'📱', color:'#ec4899'},
    {id:'WF-07', name:'Veille Concurrentielle', category:'intelligence', description:'Digest hebdo automatique — lundi 7h00', icon:'📡', color:'#06b6d4', schedule:'Lundi 7h00'},
    {id:'WF-08', name:'Notes Réunion', category:'ops', description:'Note brute → compte rendu actionnable', icon:'📋', color:'#84cc16'},
    {id:'WF-09', name:'Pipeline Commercial', category:'commercial', description:'Relances J+7 / alertes / follow-up quotidien', icon:'🎯', color:'#ef4444', schedule:'Quotidien 9h00'},
    {id:'WF-10', name:'Dashboard Direction', category:'reporting', description:'Note hebdomadaire COMEX — lundi 8h00', icon:'📊', color:'#7c3aed', schedule:'Lundi 8h00'},
    {id:'WF-11', name:'Archivage & Mémoire', category:'ops', description:'Archive les livrables validés', icon:'🗄️', color:'#64748b'},
    {id:'WF-12', name:'Gate Validation', category:'governance', description:'Blocage humain avant tout envoi', icon:'🔐', color:'#dc2626'},
  ];
  fallback.forEach(wf => state.workflows[wf.id] = wf);
  const grid = document.getElementById('agentsGrid');
  grid.innerHTML = fallback.map(wf => agentCardHTML(wf)).join('');
}

function agentCardHTML(wf) {
  return `
    <div class="agent-card" data-category="${wf.category}" data-id="${wf.id}"
         style="--agent-color:${wf.color}"
         onclick="openAgentModal('${wf.id}')">
      <div class="agent-header">
        <div class="agent-icon">${wf.icon}</div>
        <div>
          <div class="agent-id">${wf.id}</div>
          <div class="agent-name">${wf.name}</div>
        </div>
      </div>
      <div class="agent-desc">${wf.description}</div>
      <div class="agent-footer">
        <span class="agent-schedule">${wf.schedule ? '🕐 ' + wf.schedule : '▶ Manuel'}</span>
        <button class="agent-trigger-btn" onclick="event.stopPropagation(); openAgentModal('${wf.id}')">
          Déclencher →
        </button>
      </div>
    </div>
  `;
}

function filterAgents(category, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.agent-card').forEach(card => {
    const show = category === 'all' || card.dataset.category === category;
    card.style.display = show ? '' : 'none';
  });
}

// ─── AGENT MODAL ──────────────────────────────────────────────────────────────
function openAgentModal(wfId) {
  const wf = state.workflows[wfId];
  if (!wf) return;
  state.currentModal = wfId;

  document.getElementById('modalIcon').textContent = wf.icon;
  document.getElementById('modalTitle').textContent = wf.name;
  document.getElementById('modalDesc').textContent = wf.description;

  const fieldsEl = document.getElementById('agentFields');
  const fields = wf.fields || [];

  fieldsEl.innerHTML = `<div class="form-stack">${fields.map(f => {
    if (f.type === 'hidden') return `<input type="hidden" name="${f.key}" value="${f.value || ''}" />`;
    const required = f.required ? 'required' : '';
    if (f.type === 'select') {
      return `<div class="form-group">
        <label>${f.label}${f.required ? ' *' : ''}</label>
        <select name="${f.key}" ${required}>
          <option value="">-- Sélectionner --</option>
          ${(f.options || []).map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>
      </div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="form-group">
        <label>${f.label}${f.required ? ' *' : ''}</label>
        <textarea name="${f.key}" placeholder="${f.placeholder || ''}" ${required}></textarea>
      </div>`;
    }
    return `<div class="form-group">
      <label>${f.label}${f.required ? ' *' : ''}</label>
      <input type="${f.type || 'text'}" name="${f.key}" placeholder="${f.placeholder || ''}" ${required} />
    </div>`;
  }).join('')}

  <div class="info-box">
    <i class="fa-solid fa-circle-info"></i>
    <span>Cet agent sera déclenché via n8n webhook. Le résultat apparaîtra dans l'Historique en temps réel.</span>
  </div>
  </div>`;

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('agentModal').classList.add('open');

  // Mark the agent card as running
  document.querySelectorAll('.agent-card').forEach(c => {
    if (c.dataset.id === wfId) c.classList.remove('running');
  });
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.getElementById('agentModal').classList.remove('open');
  state.currentModal = null;
}

async function submitAgent(event) {
  event.preventDefault();
  const wfId = state.currentModal;
  if (!wfId) return;

  const form = document.getElementById('agentForm');
  const formData = new FormData(form);
  const payload = {};
  formData.forEach((v, k) => { payload[k] = v; });

  const btn = document.getElementById('submitBtn');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> En cours...';
  btn.disabled = true;

  // Mark card as running
  const card = document.querySelector(`.agent-card[data-id="${wfId}"]`);
  if (card) card.classList.add('running');

  closeModal();
  toast('info', 'Agent déclenché', `${state.workflows[wfId]?.name} en cours d'exécution...`);

  try {
    const result = await api('POST', `/trigger/${wfId}`, payload);
    if (result.mode === 'demo') {
      toast('warning', 'Mode démo', 'Webhook non configuré — configurez .env pour activer n8n');
    } else if (result.success) {
      toast('success', 'Succès', `${state.workflows[wfId]?.name} exécuté avec succès`);
    } else {
      toast('error', 'Erreur', result.error || 'Erreur inconnue');
    }
    state.runs.unshift({
      run_id: result.run_id,
      workflow_id: wfId,
      workflow_name: state.workflows[wfId]?.name,
      status: result.mode === 'demo' ? 'demo_mode' : (result.success ? 'success' : 'error'),
      started_at: new Date().toISOString(),
      payload
    });
    renderRuns();
    updateNotifBadge();
  } catch(e) {
    toast('error', 'Erreur réseau', e.message);
  } finally {
    if (card) card.classList.remove('running');
    btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Déclencher l\'agent';
    btn.disabled = false;
  }
}

// ─── INLINE FORMS ─────────────────────────────────────────────────────────────
function renderWFForm(wfId, containerId) {
  const wf = state.workflows[wfId];
  const container = document.getElementById(containerId);
  if (!container || !wf) return;

  const fields = wf.fields || [];
  container.innerHTML = `<form class="form-stack" onsubmit="submitInlineForm(event,'${wfId}')">
    ${fields.filter(f => f.type !== 'hidden').map(f => {
      if (f.type === 'select') return `<div class="form-group">
        <label>${f.label}${f.required ? ' *' : ''}</label>
        <select name="${f.key}" ${f.required ? 'required' : ''}>
          <option value="">-- Sélectionner --</option>
          ${(f.options||[]).map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>
      </div>`;
      if (f.type === 'textarea') return `<div class="form-group">
        <label>${f.label}${f.required ? ' *' : ''}</label>
        <textarea name="${f.key}" ${f.required ? 'required' : ''}></textarea>
      </div>`;
      return `<div class="form-group">
        <label>${f.label}${f.required ? ' *' : ''}</label>
        <input type="${f.type || 'text'}" name="${f.key}" ${f.required ? 'required' : ''} />
      </div>`;
    }).join('')}
    <button type="submit" class="btn btn-primary">
      <i class="fa-solid fa-bolt"></i> Lancer ${wf.name}
    </button>
  </form>`;
}

async function submitInlineForm(event, wfId) {
  event.preventDefault();
  const form = event.target;
  const payload = {};
  new FormData(form).forEach((v, k) => { payload[k] = v; });

  const btn = form.querySelector('button[type=submit]');
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> En cours...';
  btn.disabled = true;

  toast('info', 'Agent déclenché', `${state.workflows[wfId]?.name || wfId}...`);
  try {
    const result = await api('POST', `/trigger/${wfId}`, payload);
    if (result.mode === 'demo') {
      toast('warning', 'Mode démo', 'Webhook non configuré — configurez .env');
    } else if (result.success) {
      toast('success', 'Succès', `${state.workflows[wfId]?.name} terminé !`);
      form.reset();
    } else {
      toast('error', 'Erreur', result.error);
    }
  } catch(e) {
    toast('error', 'Erreur réseau', e.message);
  } finally {
    btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Lancer ${state.workflows[wfId]?.name || wfId}`;
    btn.disabled = false;
  }
}

// ─── RESEARCH SHORTCUTS ───────────────────────────────────────────────────────
function prefillResearch(company, sector, offer) {
  showPage('research');
  setTimeout(() => {
    const form = document.querySelector('#wf03-form form');
    if (!form) return;
    const setVal = (name, val) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) el.value = val;
    };
    setVal('company_name', company);
    setVal('sector', sector);
    setVal('desired_offer', offer);
    toast('info', 'Pré-rempli', `Formulaire prêt pour ${company}`);
  }, 300);
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
async function loadKPIs() {
  try {
    const data = await api('GET', '/kpis');
    state.kpis = data.kpis || {};
    state.objectives = data.objectives || {};
    renderKPIs();
  } catch(e) {}
}

function renderKPIs() {
  const keys = Object.keys(state.kpis);
  keys.forEach(key => {
    const el = document.getElementById(`kpi-${key}`);
    const progEl = document.getElementById(`prog-${key}`);
    if (el) el.textContent = state.kpis[key] || 0;
    if (progEl && state.objectives[key]) {
      const pct = Math.min(100, ((state.kpis[key] || 0) / state.objectives[key].q2) * 100);
      progEl.style.width = pct + '%';
    }
  });
}

async function updateKPIs(event) {
  event.preventDefault();
  const payload = {};
  const keys = ['cibles_identifiees','fiches_creees','emails_envoyes','rdv_obtenus',
                 'sponsors_confirmes','exposants_confirmes','newsletters_envoyees','workflows_actifs'];
  keys.forEach(k => {
    const el = document.getElementById(`upd-${k}`);
    if (el && el.value !== '') payload[k] = parseInt(el.value) || 0;
  });
  try {
    await api('POST', '/kpis/update', payload);
    toast('success', 'KPIs mis à jour', 'Les indicateurs ont été enregistrés');
  } catch(e) {
    toast('error', 'Erreur', e.message);
  }
}

// ─── RUNS ─────────────────────────────────────────────────────────────────────
async function loadRuns() {
  try {
    const data = await api('GET', '/runs?limit=100');
    state.runs = data.runs || [];
    renderRuns();
    updateNotifBadge();
  } catch(e) {}
}

function renderRuns() {
  const icons = {
    '📁':'WF-01','🌍':'WF-02','🔍':'WF-03','✉️':'WF-04',
    '📧':'WF-05','📱':'WF-06','📡':'WF-07','📋':'WF-08',
    '🎯':'WF-09','📊':'WF-10','🗄️':'WF-11','🔐':'WF-12'
  };
  const wfIcons = {};
  Object.values(state.workflows).forEach(wf => wfIcons[wf.id] = wf.icon);

  ['recentRuns', 'historyRuns'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const limit = id === 'recentRuns' ? 10 : 100;
    if (!state.runs.length) {
      el.innerHTML = `<div class="empty-state">
        <i class="fa-solid fa-clock-rotate-left"></i>
        <p>Aucune exécution. Déclenchez un agent pour commencer.</p>
      </div>`;
      return;
    }
    el.innerHTML = state.runs.slice(0, limit).map(run => {
      const icon = wfIcons[run.workflow_id] || '⚡';
      const time = run.started_at ? new Date(run.started_at).toLocaleString('fr-FR') : '';
      return `<div class="run-item">
        <div class="run-icon">${icon}</div>
        <div class="run-body">
          <div class="run-title">${run.workflow_name || run.workflow_id}</div>
          <div class="run-meta">${time} · ID: ${run.run_id || ''}</div>
        </div>
        <div class="run-status status-${run.status}">${statusLabel(run.status)}</div>
      </div>`;
    }).join('');
  });
}

function statusLabel(s) {
  const labels = {
    triggered:'Déclenché', success:'Succès', error:'Erreur',
    demo_mode:'Démo', completed:'Terminé', pending:'En attente'
  };
  return labels[s] || s;
}

function updateNotifBadge() {
  const errors = state.runs.filter(r => r.status === 'error').length;
  const badge = document.getElementById('notifBadge');
  badge.style.display = errors > 0 ? 'flex' : 'none';
  badge.textContent = errors;
}

// ─── TARGETS & KANBAN ─────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { key: 'identified',    label: '🎯 Identifié',       color: '#6366f1' },
  { key: 'researching',   label: '🔍 En recherche',     color: '#8b5cf6' },
  { key: 'ready',         label: '✅ Prêt email',        color: '#3b82f6' },
  { key: 'contacted',     label: '📧 Contacté',          color: '#06b6d4' },
  { key: 'replied',       label: '💬 Réponse reçue',     color: '#10b981' },
  { key: 'meeting',       label: '🤝 RDV',               color: '#84cc16' },
  { key: 'proposal',      label: '📄 Proposition',       color: '#f59e0b' },
  { key: 'negotiating',   label: '🔴 Négociation',       color: '#ef4444' },
  { key: 'won',           label: '🏆 Signé',             color: '#059669' },
  { key: 'lost',          label: '❌ Perdu',             color: '#64748b' },
];

function renderKanban(targets) {
  const board = document.getElementById('kanbanBoard');
  if (!board) return;
  board.innerHTML = PIPELINE_STAGES.map(stage => {
    const cards = targets.filter(t => t.status === stage.key);
    return `<div class="kanban-col" data-stage="${stage.key}">
      <div class="kanban-col-header" style="border-top:2px solid ${stage.color}">
        <div class="kanban-col-title">${stage.label}</div>
        <div class="kanban-count">${cards.length}</div>
      </div>
      <div class="kanban-cards" ondragover="event.preventDefault()" ondrop="dropTarget(event, '${stage.key}')">
        ${cards.map(t => `
          <div class="kanban-card priority-${t.priority || 'cold'}" draggable="true"
               ondragstart="dragTarget(event, '${t.id}')">
            <div class="kanban-card-company">${t.company_name}</div>
            <div class="kanban-card-meta">${t.sector || ''}</div>
            ${t.offer_type ? `<div class="kanban-card-offer">${t.offer_type}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>`;
  }).join('');
}

let draggedTargetId = null;
function dragTarget(event, id) { draggedTargetId = id; }

async function dropTarget(event, newStatus) {
  if (!draggedTargetId) return;
  try {
    await api('PATCH', `/targets/${draggedTargetId}/status`, { status: newStatus });
    const t = state.targets.find(x => x.id === draggedTargetId);
    if (t) t.status = newStatus;
    renderKanban(state.targets);
    renderTargets();
    toast('success', 'Statut mis à jour', `→ ${newStatus}`);
  } catch(e) {
    toast('error', 'Erreur', e.message);
  }
  draggedTargetId = null;
}

async function loadTargets() {
  try {
    const data = await api('GET', '/targets');
    state.targets = data.targets || [];
    renderTargets();
    renderKanban(state.targets);
  } catch(e) {}
}

function renderTargets() {
  const el = document.getElementById('targetsList');
  if (!el) return;
  if (!state.targets.length) {
    el.innerHTML = `<div class="empty-state">
      <i class="fa-solid fa-bullseye"></i>
      <p>Aucune cible. Ajoutez votre premier prospect !</p>
    </div>`;
    return;
  }
  el.innerHTML = `<table class="targets-table">
    <thead><tr>
      <th>Entreprise</th><th>Secteur</th><th>Offre</th>
      <th>Priorité</th><th>Statut</th><th>Actions</th>
    </tr></thead>
    <tbody>
      ${state.targets.map(t => `<tr>
        <td><strong>${t.company_name}</strong></td>
        <td>${t.sector || '-'}</td>
        <td>${t.offer_type || '-'}</td>
        <td><span class="priority-badge ${t.priority || 'cold'}">${priorityLabel(t.priority)}</span></td>
        <td><span class="status-badge" onclick="cycleStatus('${t.id}')">${statusLabel(t.status)}</span></td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="quickResearch('${t.company_name}', '${t.sector}', '${t.offer_type}')">
            <i class="fa-solid fa-magnifying-glass"></i>
          </button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function priorityLabel(p) {
  return {hot:'🔴 Hot', warm:'🟠 Warm', cold:'🔵 Cold'}[p] || p || '-';
}

async function cycleStatus(id) {
  const t = state.targets.find(x => x.id === id);
  if (!t) return;
  const stages = PIPELINE_STAGES.map(s => s.key);
  const idx = stages.indexOf(t.status);
  const next = stages[(idx + 1) % stages.length];
  try {
    await api('PATCH', `/targets/${id}/status`, { status: next });
    t.status = next;
    renderTargets();
    renderKanban(state.targets);
  } catch(e) {}
}

async function addTarget(event) {
  event.preventDefault();
  const payload = {
    company_name: document.getElementById('tgt-company').value,
    sector: document.getElementById('tgt-sector').value,
    offer_type: document.getElementById('tgt-offer').value,
    priority: document.getElementById('tgt-priority').value,
    contact_name: document.getElementById('tgt-contact').value,
    contact_email: document.getElementById('tgt-email').value,
  };
  try {
    const result = await api('POST', '/targets', payload);
    toast('success', 'Cible ajoutée', payload.company_name);
    event.target.reset();
    if (!state.targets.find(t => t.id === result.target.id)) {
      state.targets.unshift(result.target);
    }
    renderTargets();
    renderKanban(state.targets);
  } catch(e) {
    toast('error', 'Erreur', e.message);
  }
}

function triggerResearchFromForm() {
  const company = document.getElementById('tgt-company').value;
  const sector = document.getElementById('tgt-sector').value;
  const offer = document.getElementById('tgt-offer').value;
  if (!company) { toast('warning', 'Manque info', 'Remplissez au moins le nom de l\'entreprise'); return; }
  quickResearch(company, sector, offer);
}

function quickResearch(company, sector, offer) {
  showPage('research');
  setTimeout(() => prefillResearch(company, sector, offer), 200);
}

// ─── STATUS ────────────────────────────────────────────────────────────────────
async function loadStatus() {
  const el = document.getElementById('platformStatus');
  if (!el) return;
  try {
    const data = await api('GET', '/status');
    el.innerHTML = `
      <div class="status-item">
        <span class="status-label">Plateforme</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-dot ok"></span>
          <span class="status-value">v1.0 — Opérationnelle</span>
        </div>
      </div>
      <div class="status-item">
        <span class="status-label">n8n</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-dot ${data.n8n_url !== 'non configuré' ? 'ok' : 'warn'}"></span>
          <span class="status-value">${data.n8n_url}</span>
        </div>
      </div>
      <div class="status-item">
        <span class="status-label">Base de données</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-dot ${data.db_connected ? 'ok' : 'warn'}"></span>
          <span class="status-value">${data.db_connected ? 'PostgreSQL connecté' : 'Mode mémoire'}</span>
        </div>
      </div>
      <div class="status-item">
        <span class="status-label">Agents configurés</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-dot ok"></span>
          <span class="status-value">${data.workflows_count} workflows</span>
        </div>
      </div>
      <div class="status-item">
        <span class="status-label">Projet actif</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="status-dot ok"></span>
          <span class="status-value">TANGER NEXUS 2026</span>
        </div>
      </div>
    `;
  } catch(e) {
    el.innerHTML = `<div class="info-box">
      <i class="fa-solid fa-triangle-exclamation"></i>
      Serveur non joignable — mode démo local actif
    </div>`;
  }
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
function switchTab(btn, tabId) {
  const container = btn.closest('.tabs-container');
  container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  container.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const content = document.getElementById(tabId);
  if (content) content.classList.add('active');
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function copySQL() {
  const code = document.querySelector('.code-block');
  if (!code) return;
  navigator.clipboard.writeText(code.textContent).then(() => {
    toast('success', 'Copié !', 'SQL copié dans le presse-papiers');
  });
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function toast(type, title, message) {
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toast-icon">${icons[type] || 'ℹ️'}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
    </div>
  `;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(120%)'; setTimeout(() => el.remove(), 300); }, 4000);
}

// ─── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) {
    e.preventDefault();
    showPage('agents');
  }
});
