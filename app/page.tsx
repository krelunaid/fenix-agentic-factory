'use client';

import { useEffect, useMemo, useState } from 'react';

type Project = {
  id: string;
  name: string;
  description: string;
  status: 'Planning' | 'Building' | 'Review' | 'Ready';
  progress: number;
  updated: string;
  tone: 'violet' | 'cyan' | 'amber';
};

type CoreState = 'checking' | 'connected' | 'unavailable';
type WorkspaceData = {
  brief: { objective?: string; version?: number } | null;
  job: { id: string; status: string; budget_limit: number } | null;
  tasks: Array<{ id: string; title: string; status: string; phase: number; attempts: number }>;
  events: Array<{ id: string; human_message: string; created_at: number; severity: string }>;
  usage: { amount?: number; units?: number } | null;
};

const starterProjects: Project[] = [
  { id: 'orion', name: 'Orion CRM', description: 'CRM leggero per studi creativi', status: 'Building', progress: 64, updated: '12 min fa', tone: 'violet' },
  { id: 'pulse', name: 'Pulse Analytics', description: 'Dashboard operativa per metriche SaaS', status: 'Review', progress: 88, updated: 'Ieri', tone: 'cyan' },
  { id: 'atlas', name: 'Atlas Mobile', description: 'Companion app per team sul campo', status: 'Planning', progress: 24, updated: '3 giorni fa', tone: 'amber' },
];

type CoreStats = { activeJobs: number; evidenceToday: number; spendMonth: number };
type ChatMessage = { id: string; conversation_id?: string; role: 'user' | 'assistant'; content: string; status: string };

export default function Home() {
  const [view, setView] = useState<'home' | 'workspace'>('home');
  const [projects, setProjects] = useState<Project[]>([]);
  const [prompt, setPrompt] = useState('');
  const [activeProject, setActiveProject] = useState<Project>(starterProjects[0]);
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [rightTab, setRightTab] = useState<'files' | 'tests' | 'deploy'>('files');
  const [briefOpen, setBriefOpen] = useState(true);
  const [toast, setToast] = useState('');
  const [coreState, setCoreState] = useState<CoreState>('checking');
  const [displayName, setDisplayName] = useState('André');
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null);
  const [workspaceState, setWorkspaceState] = useState<CoreState>('checking');
  const [stats, setStats] = useState<CoreStats>({ activeJobs: 0, evidenceToday: 0, spendMonth: 0 });
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/projects', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('core_unavailable');
        return response.json() as Promise<{ projects: Project[]; user: { displayName: string }; stats: CoreStats }>;
      })
      .then((data) => {
        setProjects(data.projects);
        setDisplayName(data.user.displayName.split(/\s|@/)[0] || 'André');
        setStats(data.stats);
        setCoreState('connected');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setCoreState('unavailable');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (view !== 'workspace') return;
    const controller = new AbortController();
    fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/workspace`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('workspace_unavailable');
        return response.json() as Promise<WorkspaceData>;
      })
      .then((data) => { setWorkspaceData(data); setWorkspaceState('connected'); })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setWorkspaceData(null);
        setWorkspaceState('unavailable');
      });
    return () => controller.abort();
  }, [activeProject.id, view]);

  useEffect(() => {
    if (view !== 'workspace') return;
    const controller = new AbortController();
    fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/conversations`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('conversation_unavailable');
        return response.json() as Promise<{ conversations: Array<{ id: string }>; messages: ChatMessage[] }>;
      })
      .then((data) => {
        const conversationId = data.conversations[0]?.id ?? null;
        setChatConversationId(conversationId);
        setChatMessages(conversationId ? data.messages.filter((message) => message.id && (message.role === 'user' || message.role === 'assistant') && message.status !== 'failed' && message.conversation_id === conversationId) : []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setChatConversationId(null);
        setChatMessages([]);
      });
    return () => controller.abort();
  }, [activeProject.id, view]);

  const totalProgress = useMemo(
    () => projects.length ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / projects.length) : 0,
    [projects],
  );

  function openProject(project: Project) {
    setActiveProject(project);
    setWorkspaceState('checking');
    setView('workspace');
  }

  async function createProject() {
    const idea = prompt.trim();
    if (!idea) {
      setToast('Descrivi prima cosa vuoi creare.');
      window.setTimeout(() => setToast(''), 2200);
      return;
    }
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: idea, description: `Prodotto richiesto: ${idea}` }),
      });
      if (!response.ok) throw new Error('project_create_failed');
      const data = await response.json() as { project: Project };
      setProjects((current) => [data.project, ...current]);
      setActiveProject(data.project);
      setPrompt('');
      setCoreState('connected');
      setView('workspace');
    } catch {
      setToast('Il nucleo dati non è disponibile. Nessun progetto fittizio è stato creato.');
      window.setTimeout(() => setToast(''), 3200);
    }
  }

  async function sendChatMessage() {
    const content = chatInput.trim();
    if (!content || chatSending) return;
    setChatSending(true);
    setChatInput('');
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: 'user', content, status: 'complete' };
    setChatMessages((current) => [...current, optimistic]);
    try {
      let conversationId = chatConversationId;
      if (!conversationId) {
        const created = await fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/conversations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'create', title: content.slice(0, 80) }) });
        if (!created.ok) throw new Error('conversation_create_failed');
        conversationId = String((await created.json() as { id: string }).id);
        setChatConversationId(conversationId);
      }
      const response = await fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/conversations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'send', conversationId, content }) });
      const data = await response.json() as { assistant?: ChatMessage; assistantExecution?: string };
      if (!response.ok && data.assistant?.status !== 'failed') throw new Error('message_send_failed');
      if (data.assistant?.content) setChatMessages((current) => [...current, data.assistant!]);
      if (data.assistantExecution === 'budget_blocked') setToast('Budget IA esaurito: il messaggio è stato salvato senza risposta automatica.');
      if (data.assistantExecution === 'failed') setToast('Il provider IA non ha completato la risposta. Il messaggio è salvo e tracciato.');
    } catch {
      setToast('Invio non completato. Riprova tra poco.');
    } finally {
      setChatSending(false);
      window.setTimeout(() => setToast(''), 3200);
    }
  }

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Navigazione principale">
        <button className="brand-mark" onClick={() => setView('home')} aria-label="FENIX home">F</button>
        <nav className="rail-nav">
          <button className={view === 'home' ? 'rail-button active' : 'rail-button'} onClick={() => setView('home')} aria-label="Home">⌂</button>
          <button className={view === 'workspace' ? 'rail-button active' : 'rail-button'} onClick={() => { setWorkspaceState('checking'); setView('workspace'); }} aria-label="Workspace">◇</button>
          <button className="rail-button" aria-label="Versioni">↺</button>
          <button className="rail-button" aria-label="Integrazioni">⌁</button>
        </nav>
        <div className="rail-bottom"><button className="rail-button" aria-label="Impostazioni">⚙</button><span className="avatar">{displayName.slice(0, 2).toUpperCase()}</span></div>
      </aside>

      {view === 'home' ? (
        <section className="home-view">
          <header className="topbar">
            <div><span className="eyebrow">FENIX / CONTROL PLANE</span><h1>Buonasera, {displayName}.</h1></div>
            <div className="top-actions"><span className={`system-status ${coreState}`}><i /> {coreState === 'connected' ? 'Core connesso' : coreState === 'checking' ? 'Verifica sistemi' : 'Core non disponibile'}</span><button className="secondary-button">Documentazione</button></div>
          </header>

          <div className="home-content">
            <section className="hero-grid">
              <div className="composer-card">
                <span className="section-label">NUOVO PROGETTO</span>
                <h2>Che cosa vuoi portare alla luce?</h2>
                <p>Descrivi il prodotto. FENIX trasformerà l’idea in brief, piano verificabile e software funzionante.</p>
                <div className="composer">
                  <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Es. Crea un portale clienti con login, fatture e richieste di assistenza…" aria-label="Descrivi il progetto" />
                  <div className="composer-footer">
                    <div className="composer-tools"><button aria-label="Allega file">＋</button><button aria-label="Usa la voce">⌁</button><span>Auto · Bilanciato</span></div>
                    <button className="create-button" onClick={createProject}>Crea progetto <span>→</span></button>
                  </div>
                </div>
                <div className="quick-types">
                  {['Web app', 'SaaS', 'Dashboard', 'Mobile', 'Agente IA'].map((item) => <button key={item} onClick={() => setPrompt(`Crea ${item.toLowerCase()} per `)}>{item}</button>)}
                </div>
              </div>

              <aside className="pulse-card">
                <div className="pulse-orbit"><span>F</span><i /></div>
                <div><span className="section-label">IMPULSO OPERATIVO</span><strong>{totalProgress}%</strong><p>Avanzamento medio dei progetti attivi</p></div>
                <dl><div><dt>Build attive</dt><dd>{String(stats.activeJobs).padStart(2, '0')}</dd></div><div><dt>Evidence oggi</dt><dd>{stats.evidenceToday}</dd></div><div><dt>Spesa mensile</dt><dd>€ {stats.spendMonth.toFixed(2)}</dd></div></dl>
              </aside>
            </section>

            <section className="projects-section">
              <div className="section-heading"><div><span className="section-label">WORKSPACE</span><h2>Progetti recenti</h2></div><button className="text-button">Vedi tutti <span>→</span></button></div>
              <div className="project-grid">
                {projects.slice(0, 3).map((project) => (
                  <button className="project-card" key={project.id} onClick={() => openProject(project)}>
                    <div className={`project-visual ${project.tone}`}><span className="mini-window"><i /><i /><i /></span><b>{project.name.slice(0, 1)}</b><em>{project.progress}%</em></div>
                    <div className="project-body"><span className={`status ${project.status.toLowerCase()}`}>{project.status}</span><h3>{project.name}</h3><p>{project.description}</p><div className="progress-track"><i style={{ width: `${project.progress}%` }} /></div><small>Aggiornato {project.updated}<span>Apri →</span></small></div>
                  </button>
                ))}
                {projects.length === 0 && <div className="empty-projects"><strong>Nessun progetto ancora</strong><p>Descrivi il primo prodotto nel composer: verrà salvato nel workspace condiviso.</p></div>}
              </div>
            </section>
          </div>
        </section>
      ) : (
        <section className="workspace-view">
          <header className="workspace-topbar">
            <div className="project-identity"><button onClick={() => setView('home')}>←</button><div><span>PROGETTO</span><strong>{activeProject.name}</strong></div><span className={`status ${activeProject.status.toLowerCase()}`}>{activeProject.status}</span></div>
            <div className="branch-pill">⑂ main</div>
            <div className="workspace-actions"><span className="cost-pill">Sessione € {Number(workspaceData?.usage?.amount ?? 0).toFixed(2)}</span><button>Condividi</button><button className="publish-button">Pubblica</button></div>
          </header>

          <div className="workspace-grid">
            <aside className="conversation-panel">
              <div className="panel-tabs"><button className="active">Conversazione</button><button>Decisioni</button></div>
              <div className="chat-scroll">
                <div className="user-message">Crea {activeProject.description.toLowerCase()}, con una vista semplice per il team.</div>
                <div className="fenix-message"><span className="fenix-dot">F</span><div><strong>Ho preparato il brief iniziale.</strong><p>Prima di costruire, verifichiamo obiettivi, flussi e limiti. Così ogni attività avrà criteri misurabili.</p><button className="brief-button" onClick={() => setBriefOpen(!briefOpen)}>▤ Product Brief <span>{briefOpen ? '−' : '+'}</span></button></div></div>
                {briefOpen && <div className="brief-card"><label>Obiettivo {workspaceData?.brief?.version ? `· v${workspaceData.brief.version}` : ''}</label><p>{workspaceData?.brief?.objective ?? 'Centralizzare attività, clienti e stato operativo in un unico spazio verificabile.'}</p><div><span>{workspaceData ? `${workspaceData.tasks.length} task` : '3 flussi utente'}</span><span>{workspaceData?.job?.status ?? '6 criteri'}</span><span>{workspaceData ? `€ ${Number(workspaceData.usage?.amount ?? 0).toFixed(2)}` : '2 assunzioni'}</span></div><button>Modifica brief</button></div>}
                <div className="fenix-message"><span className="fenix-dot">F</span><div><strong>Costruzione avviata</strong><p>Sto lavorando sulla prima tranche. Nessuna azione di produzione verrà eseguita senza conferma.</p></div></div>
                {chatMessages.map((message) => message.role === 'user'
                  ? <div className="user-message" key={message.id}>{message.content}</div>
                  : <div className="fenix-message" key={message.id}><span className="fenix-dot">F</span><div><p>{message.content}</p></div></div>)}
              </div>
              <div className="chat-composer"><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendChatMessage(); } }} placeholder="Chiedi una modifica…" aria-label="Messaggio per FENIX" disabled={chatSending}/><button onClick={() => void sendChatMessage()} disabled={chatSending || !chatInput.trim()}>{chatSending ? '…' : '↑'}</button></div>
            </aside>

            <section className="preview-panel">
              <div className="preview-toolbar"><div><span className={`live-dot ${workspaceState}`}/>{workspaceState === 'connected' ? 'Control Plane connesso' : workspaceState === 'checking' ? 'Connessione workspace' : 'Preview dimostrativa'}</div><div className="device-switcher"><button className={device === 'desktop' ? 'active' : ''} onClick={() => setDevice('desktop')}>▰</button><button className={device === 'tablet' ? 'active' : ''} onClick={() => setDevice('tablet')}>▯</button><button className={device === 'mobile' ? 'active' : ''} onClick={() => setDevice('mobile')}>▥</button></div><button>↗</button></div>
              <div className="preview-canvas">
                <span className="preview-honesty">Mockup di superficie · runtime generato non collegato</span>
                <div className={`device-frame ${device}`}><div className="mock-app"><aside><b>O</b><i/><i/><i/><i/></aside><div className="mock-main"><header><div><small>OVERVIEW</small><h3>Buongiorno, team.</h3></div><span>＋ Nuovo cliente</span></header><div className="mock-stats"><article><small>RICAVI</small><strong>€ 48.240</strong><em>+12,4%</em></article><article><small>PROGETTI</small><strong>24</strong><em>6 attivi</em></article><article><small>CLIENTI</small><strong>128</strong><em>+8 questo mese</em></article></div><div className="mock-chart"><div><small>ANDAMENTO</small><strong>Ricavi mensili</strong></div><div className="bars">{[36,54,43,68,61,82,76,92].map((height, index)=><i key={index} style={{height:`${height}%`}}/>)}</div></div><div className="mock-table"><span>Attività recenti</span>{['Studio Delta','Forma Labs','Nord&Co'].map((name,index)=><div key={name}><b>{name}</b><i/><em>{['€ 4.200','€ 2.850','€ 6.100'][index]}</em></div>)}</div></div></div></div>
              </div>
              <div className="log-drawer"><span>{workspaceData ? 'EVENTI CONTROL PLANE' : 'EVENTI DIMOSTRATIVI'}</span>{workspaceData?.events.slice(-2).map((event) => <code key={event.id}><i>{new Date(event.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</i> {event.human_message}</code>)}{!workspaceData && <><code><i>21:44</i> Preview dimostrativa aggiornata</code><code><i>21:43</i> Nessun runner collegato</code></>}</div>
            </section>

            <aside className="inspector-panel">
              <div className="panel-tabs inspector-tabs">{(['files','tests','deploy'] as const).map(tab => <button key={tab} className={rightTab===tab?'active':''} onClick={()=>setRightTab(tab)}>{tab==='files'?'File':tab==='tests'?'Test':'Deploy'}</button>)}</div>
              {rightTab === 'files' && <div className="file-tree"><div className="inspector-heading"><span>MAPPA DIMOSTRATIVA</span><b>—</b></div><button>⌄ app</button><button className="nested">◇ dashboard</button><button className="nested active"># page.tsx</button><button>⌄ components</button><button className="nested">◇ metrics.tsx</button><button>⌄ lib</button><button className="nested">TS schema.ts</button><div className="diff-card"><span>REPO INDEX</span><strong>Provider non collegato</strong><p>Nessuna patch dichiarata</p><button>Configura</button></div></div>}
              {rightTab === 'tests' && <div className="test-list"><div className="quality-score"><span>{workspaceData ? 'TASK GRAPH' : 'QUALITY GATE DEMO'}</span><strong>{workspaceData ? `${workspaceData.tasks.filter((task) => task.status === 'completed').length}/${workspaceData.tasks.length}` : '8/9'}</strong><p>{workspaceData?.job ? `Job ${workspaceData.job.status}` : 'Nessun runner collegato'}</p></div>{(workspaceData?.tasks ?? ['Typecheck','Build','Unit test','API smoke','A11y base']).map((item,index) => { const task = typeof item === 'string' ? null : item; const label = typeof item === 'string' ? item : item.title; const passed = task ? task.status === 'completed' : index < 4; return <div key={task?.id ?? label}><span className={passed?'pass':'pending'}>{passed?'✓':'◷'}</span><p><strong>{label}</strong><small>{task ? `${task.status.toUpperCase()} · fase ${task.phase}` : passed ? 'DEMO' : 'In attesa'}</small></p></div>; })}</div>}
              {rightTab === 'deploy' && <div className="deploy-panel"><span className="section-label">AMBIENTI</span><div><i className="stage-dot"/><p><strong>Staging</strong><small>Pronto per una preview verificata</small></p><button>Prepara</button></div><div className="locked"><i>◇</i><p><strong>Produzione</strong><small>Richiede approvazione esplicita</small></p></div><p className="honesty-note">Nessun provider è collegato in questa demo. Il pulsante non pubblica dati reali.</p></div>}
            </aside>
          </div>
        </section>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
