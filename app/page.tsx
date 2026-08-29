"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Code2,
  ExternalLink,
  FileCode2,
  Globe2,
  Layers3,
  LoaderCircle,
  Monitor,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TestTube2,
  UserRound,
  WandSparkles,
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  progress: number;
  updated: string;
  tone: string;
};
type Task = {
  id: string;
  title: string;
  status: string;
  phase: number;
  attempts: number;
};
type Workspace = {
  brief: { objective?: string; version?: number } | null;
  job: { id: string; status: string; budget_limit: number } | null;
  tasks: Task[];
  events: Array<{
    id: string;
    human_message: string;
    created_at: number;
    severity: string;
  }>;
  usage: { amount?: number; units?: number } | null;
  repositoryFiles: Array<{ path: string; language: string }>;
  qualityRuns: Array<{
    id: string;
    kind: string;
    status: string;
    summary: string;
  }>;
  previews: Array<{ id: string; url: string | null; live: number }>;
};
type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
type ProductKind = "app" | "website" | "prototype";
type PreviewTab = "preview" | "code" | "tests";
type Device = "desktop" | "mobile";

const starters: Array<{
  kind: ProductKind;
  label: string;
  icon: typeof Layers3;
  prompt: string;
}> = [
  {
    kind: "app",
    label: "Applicazione",
    icon: Layers3,
    prompt: "Crea un CRM per gestire clienti, opportunità e attività del team",
  },
  {
    kind: "website",
    label: "Sito web",
    icon: Globe2,
    prompt:
      "Crea un sito web premium per uno studio creativo con servizi e modulo contatti",
  },
  {
    kind: "prototype",
    label: "Prototipo",
    icon: WandSparkles,
    prompt: "Crea un prototipo interattivo per organizzare progetti e scadenze",
  },
];
const phaseAgents: Record<number, { name: string; role: string }> = {
  4: { name: "Maya", role: "Product Architect" },
  5: { name: "Iris + Atlas", role: "UX Director · Software Architect" },
  6: { name: "FENIX", role: "Orchestrator" },
  7: { name: "Nova", role: "Sandbox Engineer" },
  8: { name: "Builder team", role: "Frontend · Backend · Data" },
  9: { name: "Pixel", role: "Preview Agent" },
  10: { name: "Git", role: "Repository Agent" },
  11: { name: "Sentinel", role: "QA · Security" },
  12: { name: "Echo", role: "Recovery Agent" },
  13: { name: "Meter", role: "Cost Agent" },
  15: { name: "Launch", role: "Deploy Agent" },
};
const projectTitle = (value: string) =>
  (
    value
      .replace(/^(crea|costruisci|realizza)\s+(un|una)?\s*/i, "")
      .trim()
      .split(/[,.\n]/)[0] || "Nuovo progetto"
  ).slice(0, 72);

export default function Home() {
  const [screen, setScreen] = useState<"home" | "builder">("home");
  const [projects, setProjects] = useState<Project[]>([]);
  const [displayName, setDisplayName] = useState("Andrea");
  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<ProductKind>("app");
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [revision, setRevision] = useState("");
  const [building, setBuilding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [buildLabel, setBuildLabel] = useState("Preparazione del team…");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("preview");
  const [device, setDevice] = useState<Device>("desktop");
  const [toast, setToast] = useState("");
  const busyRef = useRef(false);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);
  const livePreview = useMemo(
    () =>
      workspace?.previews.find((item) => item.live === 1 && item.url)?.url ??
      null,
    [workspace],
  );
  const completedTasks =
    workspace?.tasks.filter((task) => task.status === "completed").length ?? 0;
  const currentTask =
    workspace?.tasks.find((task) =>
      ["running", "queued", "ready"].includes(task.status),
    ) ?? workspace?.tasks.find((task) => task.status === "blocked");
  async function loadProjects() {
    try {
      const response = await fetch("/api/projects");
      if (!response.ok) return;
      const data = (await response.json()) as {
        projects: Project[];
        user: { displayName: string };
      };
      setProjects(data.projects);
      setDisplayName(data.user.displayName.split(/\s|@/)[0] || "Andrea");
    } catch {}
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as {
              projects: Project[];
              user: { displayName: string };
            })
          : null,
      )
      .then((data) => {
          if (!data) return;
          setProjects(data.projects);
          setDisplayName(data.user.displayName.split(/\s|@/)[0] || "Andrea");
        })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    async function handlePreviewRequest(event: MessageEvent) {
      const frame = previewFrameRef.current;
      const data = event.data as
        | {
            type?: unknown;
            requestId?: unknown;
            path?: unknown;
            method?: unknown;
            body?: unknown;
          }
        | null;
      if (
        !frame ||
        !activeProject ||
        event.source !== frame.contentWindow ||
        !data ||
        data.type !== "fenix:preview-request" ||
        typeof data.requestId !== "string" ||
        typeof data.path !== "string"
      )
        return;
      const requestId = data.requestId.slice(0, 120);
      const target = new URL(data.path, window.location.origin);
      const expectedPath = `/preview/${encodeURIComponent(activeProject.id)}`;
      const action = target.searchParams.get("api");
      const method =
        typeof data.method === "string" ? data.method.toUpperCase() : "GET";
      if (
        target.origin !== window.location.origin ||
        target.pathname !== expectedPath ||
        !["session", "metrics", "items", "contact"].includes(action ?? "") ||
        !["GET", "POST", "DELETE"].includes(method) ||
        (typeof data.body === "string" && data.body.length > 100_000)
      )
        return;
      try {
        const response = await fetch(target.toString(), {
          method,
          credentials: "include",
          headers: { "content-type": "application/json" },
          body:
            method === "GET" || typeof data.body !== "string"
              ? undefined
              : data.body,
        });
        const body = await response.text();
        frame.contentWindow?.postMessage(
          {
            type: "fenix:preview-response",
            requestId,
            status: response.status,
            body,
          },
          "*",
        );
      } catch {
        frame.contentWindow?.postMessage(
          {
            type: "fenix:preview-response",
            requestId,
            status: 503,
            body: JSON.stringify({ error: "preview_bridge_unavailable" }),
          },
          "*",
        );
      }
    }
    window.addEventListener("message", handlePreviewRequest);
    return () => window.removeEventListener("message", handlePreviewRequest);
  }, [activeProject]);
  async function refreshWorkspace(projectId: string) {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/workspace`,
    );
    if (!response.ok) throw new Error("workspace_unavailable");
    const data = (await response.json()) as Workspace;
    setWorkspace(data);
    return data;
  }
  async function createProject() {
    const idea = prompt.trim();
    if (!idea || busyRef.current) return;
    busyRef.current = true;
    setCreating(true);
    setBuildLabel("Creo il progetto e convoco gli agenti…");
    try {
      const prefix =
        kind === "website"
          ? "Sito web: "
          : kind === "prototype"
            ? "Prototipo interattivo: "
            : "Applicazione full-stack: ";
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: projectTitle(idea),
          description: `${prefix}${idea}`,
          visualDirection: "premium",
        }),
      });
      const data = (await response.json()) as {
        project?: Project;
        jobId?: string;
        error?: string;
      };
      if (!response.ok || !data.project || !data.jobId)
        throw new Error(data.error || "creation_failed");
      setActiveProject(data.project);
      setProjects((current) => [data.project!, ...current]);
      setMessages([{ id: crypto.randomUUID(), role: "user", content: idea }]);
      setScreen("builder");
      setWorkspace(null);
      busyRef.current = false;
      await runAutopilot(data.jobId, data.project.id);
    } catch (error) {
      busyRef.current = false;
      notify(
        `Non sono riuscito ad avviare la build: ${error instanceof Error ? error.message : "errore"}`,
      );
    } finally {
      setCreating(false);
    }
  }
  async function runAutopilot(jobId: string, projectId: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBuilding(true);
    setPreviewTab("preview");
    try {
      await refreshWorkspace(projectId);
      for (let step = 0; step < 20; step += 1) {
        const response = await fetch(`/api/jobs/${jobId}/autopilot`, {
          method: "POST",
        });
        const data = (await response.json()) as {
          done?: boolean;
          progress?: number;
          task?: { title?: string };
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "build_failed");
        setBuildLabel(
          data.done
            ? "Prototipo pronto"
            : (data.task?.title ?? "Gli agenti stanno lavorando…"),
        );
        const fresh = await refreshWorkspace(projectId);
        if (typeof data.progress === "number")
          setActiveProject((current) =>
            current
              ? {
                  ...current,
                  progress: data.progress!,
                  status: data.done ? "Ready" : "Building",
                }
              : current,
          );
        if (data.done || fresh.job?.status === "SUCCEEDED") break;
      }
      setBuildLabel("Prototipo pronto da provare");
      notify(
        "Build completata. Puoi usare il prototipo e chiedere altre modifiche.",
      );
    } catch (error) {
      setBuildLabel("Build sospesa");
      notify(
        `La build si è fermata: ${error instanceof Error ? error.message : "errore"}`,
      );
    } finally {
      busyRef.current = false;
      setBuilding(false);
      void loadProjects();
    }
  }
  async function requestRevision() {
    const instruction = revision.trim();
    if (!instruction || !activeProject || building) return;
    setRevision("");
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: instruction },
    ]);
    try {
      const response = await fetch(
        `/api/projects/${activeProject.id}/rebuild`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ instruction }),
        },
      );
      const data = (await response.json()) as {
        jobId?: string;
        error?: string;
      };
      if (!response.ok || !data.jobId)
        throw new Error(data.error || "revision_failed");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "Ricevuto. Ho aggiornato il brief e il team sta ricostruendo il prodotto.",
        },
      ]);
      await runAutopilot(data.jobId, activeProject.id);
    } catch (error) {
      notify(
        `Modifica non avviata: ${error instanceof Error ? error.message : "errore"}`,
      );
    }
  }
  function openProject(project: Project) {
    setActiveProject(project);
    setScreen("builder");
    setMessages([
      { id: crypto.randomUUID(), role: "user", content: project.description },
    ]);
    setWorkspace(null);
    void refreshWorkspace(project.id).catch(() =>
      notify("Progetto temporaneamente non disponibile"),
    );
  }
  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }

  if (screen === "home")
    return (
      <main className="fenix-home">
        <header className="home-nav">
          <a className="fenix-brand" href="#">
            <span>F</span>FENIX
          </a>
          <nav>
            <button
              onClick={() =>
                window.open("/docs", "_blank", "noopener,noreferrer")
              }
            >
              Documentazione
            </button>
            <span className="avatar">
              <UserRound />
            </span>
          </nav>
        </header>
        <section className="prompt-stage">
          <div className="stage-badge">
            <Sparkles />
            Software factory agentica
          </div>
          <h1>Che cosa vuoi costruire?</h1>
          <p>
            Descrivi un’applicazione o un sito. Gli agenti lo progettano,
            scrivono il codice, lo testano e ti mostrano un prototipo
            interattivo.
          </p>
          <div className="kind-switch">
            {starters.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.kind}
                  className={kind === item.kind ? "active" : ""}
                  onClick={() => setKind(item.kind)}
                >
                  <Icon />
                  {item.label}
                </button>
              );
            })}
          </div>
          <div className="main-composer">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void createProject();
                }
              }}
              placeholder={starters.find((item) => item.kind === kind)?.prompt}
              aria-label="Descrivi cosa vuoi costruire"
            />
            <div>
              <span>Invio con ⌘ Enter</span>
              <button
                className="build-button"
                onClick={() => void createProject()}
                disabled={!prompt.trim() || creating}
              >
                {creating ? <LoaderCircle className="spin" /> : <ArrowRight />}
                {creating ? "Avvio agenti" : "Costruisci"}
              </button>
            </div>
          </div>
          <div className="starter-row">
            {starters.map((item) => (
              <button
                key={item.prompt}
                onClick={() => {
                  setKind(item.kind);
                  setPrompt((current) =>
                    current.trim() ? current : item.prompt,
                  );
                }}
              >
                <Plus />
                {item.prompt}
              </button>
            ))}
          </div>
        </section>
        <section className="recent-projects">
          <div>
            <div>
              <span>I TUOI PROGETTI</span>
              <h2>Continua da dove eri rimasto</h2>
            </div>
            <small>Ciao {displayName}</small>
          </div>
          <div className="recent-grid">
            {projects.slice(0, 6).map((project) => (
              <button
                className="recent-card"
                key={project.id}
                onClick={() => openProject(project)}
              >
                <div className="card-preview">
                  <span>{project.name.slice(0, 1).toUpperCase()}</span>
                  <i style={{ width: `${project.progress}%` }} />
                </div>
                <div>
                  <strong>{project.name}</strong>
                  <p>{project.description}</p>
                  <small>
                    <span
                      className={`state-dot ${project.status.toLowerCase()}`}
                    />
                    {project.status} · {project.progress}%
                  </small>
                </div>
              </button>
            ))}
            {projects.length === 0 && (
              <div className="no-projects">
                <Rocket />
                <strong>Il tuo primo progetto parte da un prompt</strong>
                <p>Scrivi cosa vuoi creare qui sopra.</p>
              </div>
            )}
          </div>
        </section>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </main>
    );

  return (
    <main className="builder-shell">
      <header className="builder-topbar">
        <div>
          <button
            className="icon-button"
            onClick={() => setScreen("home")}
            aria-label="Torna ai progetti"
          >
            <ArrowLeft />
          </button>
          <a className="fenix-brand compact" href="#">
            <span>F</span>FENIX
          </a>
          <i />
          <strong>{activeProject?.name}</strong>
          <span className={`build-state ${building ? "working" : "ready"}`}>
            {building ? <LoaderCircle className="spin" /> : <Check />}
            {building
              ? "Agenti al lavoro"
              : livePreview
                ? "Pronto"
                : "In attesa"}
          </span>
        </div>
        <div>
          <span className="progress-copy">
            {completedTasks}/{workspace?.tasks.length ?? 11} attività
          </span>
          <div className="top-progress">
            <i style={{ width: `${activeProject?.progress ?? 0}%` }} />
          </div>
          <button
            className="publish-button"
            onClick={() =>
              livePreview
                ? window.open(livePreview, "_blank", "noopener,noreferrer")
                : notify("La preview sarà disponibile appena termina la build.")
            }
          >
            <ExternalLink />
            Apri preview
          </button>
        </div>
      </header>
      <div className="builder-body">
        <aside className="agent-panel">
          <div className="agent-heading">
            <span>
              <Sparkles />
              FENIX Agent
            </span>
            <small>
              {building
                ? "Sta costruendo il tuo prodotto"
                : "Pronto per una nuova modifica"}
            </small>
          </div>
          <div className="conversation">
            {messages.map((message) => (
              <div key={message.id} className={`bubble ${message.role}`}>
                <span>{message.role === "assistant" ? "F" : "Tu"}</span>
                <p>{message.content}</p>
              </div>
            ))}
            <div className="agent-summary">
              <span className="agent-avatar">F</span>
              <div>
                <strong>{building ? buildLabel : "Prototipo pronto"}</strong>
                <p>
                  {building
                    ? "Il team sta lavorando nel sandbox. Puoi seguire ogni passaggio qui sotto."
                    : "Prova il risultato nella preview. Scrivi una modifica e gli agenti creeranno una nuova versione."}
                </p>
              </div>
            </div>
            <section className="agent-timeline">
              <header>
                <span>Attività degli agenti</span>
                <small>
                  {completedTasks}/{workspace?.tasks.length ?? 11}
                </small>
              </header>
              {workspace?.tasks.map((task) => {
                const agent = phaseAgents[task.phase] ?? {
                  name: "FENIX",
                  role: "Agent",
                };
                const active =
                  task.status === "running" || task.id === currentTask?.id;
                return (
                  <article
                    key={task.id}
                    className={`${task.status} ${active ? "active" : ""}`}
                  >
                    <span className="task-state">
                      {task.status === "completed" ? (
                        <Check />
                      ) : active ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <Circle />
                      )}
                    </span>
                    <div>
                      <strong>
                        {agent.name}
                        <em>{agent.role}</em>
                      </strong>
                      <p>{task.title}</p>
                    </div>
                    {task.status === "completed" && <small>Fatto</small>}
                  </article>
                );
              })}
              {!workspace && (
                <div className="timeline-loading">
                  <LoaderCircle className="spin" />
                  Preparazione del piano…
                </div>
              )}
            </section>
          </div>
          <div className="revision-composer">
            <textarea
              value={revision}
              onChange={(event) => setRevision(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void requestRevision();
                }
              }}
              placeholder="Chiedi una modifica al prototipo…"
              disabled={building}
            />
            <div>
              <span>
                {building
                  ? "Attendi la fine della build"
                  : "Gli agenti creeranno una nuova versione"}
              </span>
              <button
                className="send-button"
                onClick={() => void requestRevision()}
                disabled={building || !revision.trim()}
              >
                <Send />
              </button>
            </div>
          </div>
        </aside>
        <section className="product-panel">
          <div className="product-toolbar">
            <div className="preview-tabs">
              <button
                className={previewTab === "preview" ? "active" : ""}
                onClick={() => setPreviewTab("preview")}
              >
                <Monitor />
                Preview
              </button>
              <button
                className={previewTab === "code" ? "active" : ""}
                onClick={() => setPreviewTab("code")}
              >
                <Code2 />
                Codice
              </button>
              <button
                className={previewTab === "tests" ? "active" : ""}
                onClick={() => setPreviewTab("tests")}
              >
                <TestTube2 />
                Test
              </button>
            </div>
            <div className="preview-actions">
              <button
                className={device === "desktop" ? "active" : ""}
                onClick={() => setDevice("desktop")}
                title="Desktop"
              >
                <Monitor />
              </button>
              <button
                className={device === "mobile" ? "active" : ""}
                onClick={() => setDevice("mobile")}
                title="Mobile"
              >
                <Smartphone />
              </button>
              <button
                onClick={() =>
                  activeProject && void refreshWorkspace(activeProject.id)
                }
                title="Aggiorna"
              >
                <RefreshCw />
              </button>
              {livePreview && (
                <a
                  href={livePreview}
                  target="_blank"
                  rel="noreferrer"
                  title="Apri in una nuova finestra"
                >
                  <ExternalLink />
                </a>
              )}
            </div>
          </div>
          {previewTab === "preview" && (
            <div className={`product-canvas ${device}`}>
              {livePreview ? (
                <div className="browser-frame">
                  <div className="browser-chrome">
                    <i />
                    <i />
                    <i />
                    <span>
                      {livePreview.replace(/^https?:\/\//, "").slice(0, 54)}
                    </span>
                  </div>
                  <iframe
                    ref={previewFrameRef}
                    src={livePreview}
                    title={`Preview ${activeProject?.name}`}
                    sandbox="allow-forms allow-modals allow-popups allow-scripts"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="building-preview">
                  <div className="build-orbit">
                    <span>F</span>
                    <i />
                    <i />
                    <i />
                  </div>
                  <h2>{buildLabel}</h2>
                  <p>
                    La preview apparirà qui appena il Preview Agent avrà avviato
                    il prototipo.
                  </p>
                  <div className="skeleton-window">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              )}
            </div>
          )}
          {previewTab === "code" && (
            <div className="code-surface">
              <header>
                <div>
                  <FileCode2 />
                  <span>Codice generato</span>
                </div>
                <small>{workspace?.repositoryFiles.length ?? 0} file</small>
              </header>
              <div className="file-browser">
                <aside>
                  {workspace?.repositoryFiles.map((file) => (
                    <button key={file.path}>
                      <FileCode2 />
                      {file.path}
                    </button>
                  ))}
                </aside>
                <section>
                  <div className="code-empty">
                    <Code2 />
                    <strong>Codice reale, progetto tuo</strong>
                    <p>
                      I file prodotti dagli agenti sono indicizzati e inclusi
                      nello snapshot esportabile.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          )}
          {previewTab === "tests" && (
            <div className="test-surface">
              <header>
                <div>
                  <ShieldCheck />
                  <span>Verifiche indipendenti</span>
                </div>
                <strong>
                  {workspace?.qualityRuns.filter(
                    (run) => run.status === "passed",
                  ).length ?? 0}
                  /{workspace?.qualityRuns.length ?? 0} superate
                </strong>
              </header>
              <div>
                {workspace?.qualityRuns.map((run) => (
                  <article key={run.id}>
                    <span className={run.status}>
                      <Check />
                    </span>
                    <div>
                      <strong>{run.kind}</strong>
                      <p>{run.summary}</p>
                    </div>
                    <small>{run.status}</small>
                  </article>
                ))}
                {!workspace?.qualityRuns.length && (
                  <div className="test-empty">
                    <TestTube2 />
                    <p>
                      I risultati appariranno quando QA e Security Agent
                      inizieranno i test.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
