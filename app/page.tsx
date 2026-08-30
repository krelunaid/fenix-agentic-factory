"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BatteryFull,
  Bot,
  Check,
  Circle,
  Code2,
  Columns3,
  Command,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  Flame,
  GalleryHorizontalEnd,
  History,
  LoaderCircle,
  LogIn,
  Monitor,
  PanelTopOpen,
  RefreshCw,
  Rocket,
  Send,
  Signal,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TestTube2,
  UserRound,
  Workflow,
  Wifi,
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
  recoveryPoints: Array<{
    id: string;
    job_id: string;
    source_revision: string;
    artifact_id: string;
    created_at: number;
    kind: string;
  }>;
  sourceExportReady: boolean;
  provenanceReady: boolean;
};
type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
type PreviewTab = "preview" | "code" | "tests";
type Device = "desktop" | "mobile";
type IntentSignal = {
  id: "product" | "data" | "interface" | "release";
  label: string;
  value: string;
};
type IntentArchetype = {
  id: "stage" | "board" | "ritual";
  label: string;
  note: string;
};
const intentIcons = {
  product: Bot,
  data: Database,
  interface: Monitor,
  release: Rocket,
};
const archetypeIcons = {
  stage: GalleryHorizontalEnd,
  board: Columns3,
  ritual: PanelTopOpen,
};
const phaseAgents: Record<number, { name: string; role: string }> = {
  4: { name: "Maya", role: "Product Architect" },
  5: { name: "Iris + Atlas", role: "UX Director · Software Architect" },
  6: { name: "FENIX", role: "Orchestrator" },
  7: { name: "Nova", role: "Sandbox · Scaffolder" },
  8: { name: "Builder team", role: "AI Frontend · Backend · Data" },
  9: { name: "Pixel", role: "Preview Agent" },
  10: { name: "Git", role: "Repository Agent" },
  11: { name: "Sentinel", role: "QA · Security · Diagnosi · Repair" },
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

const includesAny = (value: string, words: string[]) =>
  words.some((word) => value.includes(word));

function previewDeviceFor(value: string): Device {
  const text = value.toLocaleLowerCase("it");
  return includesAny(text, [
    "sito web",
    "website",
    "landing page",
    "portfolio",
    "sito vetrina",
  ])
    ? "desktop"
    : "mobile";
}

function inferIntent(value: string): IntentSignal[] {
  const text = value.toLocaleLowerCase("it").trim();
  if (!text)
    return [
      { id: "product", label: "Prodotto", value: "In attesa del tuo testo" },
      { id: "data", label: "Dati", value: "Saranno dedotti dal contesto" },
      { id: "interface", label: "Interfaccia", value: "Si adatterà all’uso reale" },
      { id: "release", label: "Rilascio", value: "Verrà scelto da Fenix" },
    ];

  const product = includesAny(text, ["locandin", "impagin", "poster", "canvas"])
    ? "Atelier di composizione"
    : includesAny(text, ["film", "carton", "cinema", "streaming"])
      ? "Esperienza cinematografica"
    : includesAny(text, ["shop", "ecommerce", "negozio", "vendere"])
      ? "Commercio digitale"
    : includesAny(text, ["sito", "portfolio", "landing", "vetrina"])
      ? "Esperienza web pubblica"
      : includesAny(text, ["crm", "gestionale", "dashboard", "studio", "azienda"])
        ? "Sistema operativo gestionale"
        : includesAny(text, ["community", "social", "messaggi", "chat"])
          ? "Piattaforma collaborativa"
          : "Applicazione su misura";
  const data = includesAny(text, ["locandin", "impagin", "poster", "canvas"])
    ? "Locandine, versioni e risorse"
    : includesAny(text, ["film", "carton", "cinema", "streaming"])
      ? "Titoli, rassegne, ere e preferiti"
    : includesAny(text, ["dentist", "pazient"])
      ? "Pazienti, appuntamenti e trattamenti"
    : includesAny(text, ["prodotto", "ordine", "catalogo", "acquisto"])
      ? "Catalogo, ordini e clienti"
      : includesAny(text, ["prenot", "appuntament", "calendario"])
        ? "Disponibilità e prenotazioni"
        : includesAny(text, ["cliente", "utente", "team", "membro"])
          ? "Persone, ruoli e attività"
        : includesAny(text, ["foto", "video", "audio", "file", "document"])
          ? "Contenuti e file persistenti"
          : "Entità e relazioni dal dominio";
  const interfaceValue = includesAny(text, ["locandin", "impagin", "poster", "canvas"])
    ? "Tela editoriale con prova di stampa"
    : includesAny(text, ["film", "carton", "cinema", "streaming"])
      ? "Scena immersiva e rassegne orizzontali"
    : includesAny(text, ["mobile", "iphone", "android", "telefono"])
      ? "Esperienza mobile prioritaria"
    : includesAny(text, ["dashboard", "gestionale", "crm", "admin"])
      ? "Workspace operativo responsive"
      : includesAny(text, ["sito", "landing", "portfolio", "vetrina"])
        ? "Percorso pubblico orientato all’azione"
        : "Interfaccia responsive dedicata";
  const release = includesAny(text, ["iphone", "ios", "android", "mobile nativa"])
    ? "Web + percorso nativo"
    : includesAny(text, ["interno", "privato", "team", "azienda"])
      ? "Web protetto e versionato"
      : "Web full-stack distribuibile";

  return [
    { id: "product", label: "Prodotto", value: product },
    { id: "data", label: "Dati", value: data },
    { id: "interface", label: "Interfaccia", value: interfaceValue },
    { id: "release", label: "Rilascio", value: release },
  ];
}

function inferArchetypes(value: string): IntentArchetype[] {
  const text = value.toLocaleLowerCase("it");
  if (includesAny(text, ["film", "carton", "cinema", "streaming"]) && !includesAny(text, ["locandin", "impagin", "poster", "canvas"]))
    return [
      { id: "stage", label: "Scena cinematografica", note: "Un titolo guida il primo sguardo" },
      { id: "board", label: "Rassegne orizzontali", note: "Collezioni esplorabili per era" },
      { id: "ritual", label: "Serata guidata", note: "Dalla scelta alla visione insieme" },
    ];
  if (includesAny(text, ["turni", "cucina", "ticket", "kanban", "task"]))
    return [
      { id: "board", label: "Regia operativa", note: "Coperture e cambi in tempo reale" },
      { id: "stage", label: "Servizio in primo piano", note: "La criticità attuale domina" },
      { id: "ritual", label: "Cambio turno", note: "Un flusso breve e verificabile" },
    ];
  if (includesAny(text, ["locandin", "impagin", "poster", "canvas"]))
    return [
      { id: "ritual", label: "Atelier editoriale", note: "Tela, strumenti e prova di stampa" },
      { id: "stage", label: "Poster immersivo", note: "La composizione occupa la scena" },
      { id: "board", label: "Varianti affiancate", note: "Confronto rapido tra versioni" },
    ];
  if (includesAny(text, ["dashboard", "kpi", "funnel", "analytics"]))
    return [
      { id: "board", label: "Cockpit decisionale", note: "Indicatori e funnel richiesti" },
      { id: "stage", label: "Segnale dominante", note: "Una metrica guida l’azione" },
      { id: "ritual", label: "Analisi guidata", note: "Dal dato alla decisione" },
    ];
  return [
    { id: "stage", label: "Scena di successo", note: "Il risultato è visibile subito" },
    { id: "ritual", label: "Percorso guidato", note: "Un’azione primaria senza attrito" },
    { id: "board", label: "Spazio operativo", note: "Dati e attività restano leggibili" },
  ];
}

export default function Home() {
  const [screen, setScreen] = useState<"home" | "builder">("home");
  const [projects, setProjects] = useState<Project[]>([]);
  const [displayName, setDisplayName] = useState("Andrea");
  const [prompt, setPrompt] = useState("");
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [revision, setRevision] = useState("");
  const [building, setBuilding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [buildLabel, setBuildLabel] = useState("Preparazione del team…");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("preview");
  const [device, setDevice] = useState<Device>("mobile");
  const [toast, setToast] = useState("");
  const [buildError, setBuildError] = useState("");
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [confirmedSignals, setConfirmedSignals] = useState<string[]>([]);
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
  const pipelineComplete = Boolean(
    workspace?.job?.status === "SUCCEEDED" &&
      workspace.tasks.length > 0 &&
      completedTasks === workspace.tasks.length,
  );
  const pipelineFailed = Boolean(
    buildError ||
      ["PAUSED", "FAILED", "CANCELLED"].includes(workspace?.job?.status ?? ""),
  );
  const currentTask =
    workspace?.tasks.find((task) =>
      ["running", "queued", "ready"].includes(task.status),
    ) ?? workspace?.tasks.find((task) => ["blocked", "failed"].includes(task.status));
  const intentSignals = useMemo(() => inferIntent(prompt), [prompt]);
  const intentArchetypes = useMemo(() => inferArchetypes(prompt), [prompt]);
  const intentReady = prompt.trim().length >= 16;
  async function loadProjects() {
    try {
      const response = await fetch("/api/projects");
      if (response.status === 401) {
        setAuthRequired(true);
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as {
        projects: Project[];
        user: { displayName: string };
      };
      setProjects(data.projects);
      setDisplayName(data.user.displayName.split(/\s|@/)[0] || "Andrea");
      setAuthRequired(false);
    } catch {}
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setAuthRequired(true);
          return null;
        }
        if (!response.ok) return null;
        setAuthRequired(false);
        return (await response.json()) as {
          projects: Project[];
          user: { displayName: string };
        };
      })
      .then((data) => {
          if (!data) return;
          setProjects(data.projects);
          setDisplayName(data.user.displayName.split(/\s|@/)[0] || "Andrea");
        })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const draft = window.sessionStorage.getItem("fenix:build-draft");
      if (draft) setPrompt(draft);
    }, 0);
    return () => window.clearTimeout(timer);
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
    if (idea.length < 16) {
      notify("Descrivi ancora un dettaglio: Fenix deve capire il risultato.");
      return;
    }
    if (busyRef.current) return;
    if (authRequired) {
      window.sessionStorage.setItem("fenix:build-draft", idea);
      notify("Accedi con ChatGPT per creare e conservare il progetto.");
      return;
    }
    busyRef.current = true;
    setCreating(true);
    setBuildLabel("Compilo l’intento confermato…");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: projectTitle(idea),
          description: idea,
          visualDirection: "premium",
        }),
      });
      const data = (await response.json()) as {
        project?: Project;
        jobId?: string;
        error?: string;
      };
      if (response.status === 401) {
        setAuthRequired(true);
        window.sessionStorage.setItem("fenix:build-draft", idea);
        busyRef.current = false;
        notify("Accedi con ChatGPT per creare e conservare il progetto.");
        return;
      }
      if (!response.ok || !data.project || !data.jobId)
        throw new Error(data.error || "creation_failed");
      setDevice(previewDeviceFor(data.project.description));
      setActiveProject(data.project);
      setProjects((current) => [data.project!, ...current]);
      setMessages([{ id: crypto.randomUUID(), role: "user", content: idea }]);
      setScreen("builder");
      setWorkspace(null);
      window.sessionStorage.removeItem("fenix:build-draft");
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
    setBuildError("");
    setPreviewTab("preview");
    try {
      await refreshWorkspace(projectId);
      for (let step = 0; step < 20; step += 1) {
        const before = await refreshWorkspace(projectId);
        const next = before.tasks.find((task) =>
          ["running", "queued", "ready"].includes(task.status),
        );
        setBuildLabel(next?.title ?? "Gli agenti stanno lavorando…");
        const poll = window.setInterval(() => {
          void refreshWorkspace(projectId)
            .then((fresh) => {
              const active = fresh.tasks.find((task) =>
                ["running", "queued", "ready"].includes(task.status),
              );
              if (active) setBuildLabel(active.title);
            })
            .catch(() => undefined);
        }, 1_500);
        let response: Response;
        try {
          response = await fetch(`/api/jobs/${jobId}/autopilot`, {
            method: "POST",
          });
        } finally {
          window.clearInterval(poll);
        }
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
      const message = error instanceof Error ? error.message : "errore";
      setBuildError(message);
      setBuildLabel("Build sospesa");
      await refreshWorkspace(projectId).catch(() => undefined);
      setActiveProject((current) =>
        current ? { ...current, status: "Blocked" } : current,
      );
      notify(`La build si è fermata: ${message}`);
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
    setBuildError("");
    setDevice(previewDeviceFor(project.description));
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
            <span><Flame aria-hidden="true" /></span>FENIX
          </a>
          <nav>
            <button
              onClick={() =>
                window.open("/docs", "_blank", "noopener,noreferrer")
              }
            >
              Documentazione
            </button>
            {authRequired ? (
              <a className="signin-link" href="/signin-with-chatgpt?return_to=/" target="_top">
                <LogIn /> Accedi
              </a>
            ) : (
              <span className="avatar">
                <UserRound />
              </span>
            )}
          </nav>
        </header>
        <section className="build-landing">
          <div className="build-stage">
            <div className="stage-badge">
              <Cpu />
              Campo libero · nessun preset
            </div>
            <h1>Un’idea dentro. <em>Software fuori.</em></h1>
            <p>
              Descrivi cosa deve esistere. Fenix rende visibili le sue deduzioni
              prima di progettare, scrivere codice e rilasciare.
            </p>
            <div className="main-composer build-composer">
              <div className="composer-head">
                <Workflow />
                <span>DESCRIVI IL RISULTATO, NON IL TEMPLATE</span>
              </div>
              <textarea
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  window.sessionStorage.setItem("fenix:build-draft", event.target.value);
                }}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void createProject();
                  }
                }}
                placeholder="Che cosa deve esistere quando Fenix ha finito?"
                aria-label="Descrivi liberamente cosa vuoi costruire"
              />
              <div>
                <span className="keyboard-hint">Prompt libero · <Command /> Enter</span>
                {authRequired && intentReady ? (
                  <a
                    className="build-button signin-button"
                    href="/signin-with-chatgpt?return_to=/"
                    target="_top"
                    onClick={() => window.sessionStorage.setItem("fenix:build-draft", prompt)}
                  >
                    <LogIn /> Accedi, conferma e costruisci
                  </a>
                ) : (
                  <button
                    className="build-button"
                    onClick={() => void createProject()}
                    disabled={!intentReady || creating || authRequired === null}
                  >
                    {creating ? <LoaderCircle className="spin" /> : <Flame />}
                    {creating
                      ? "Compilo l’intento"
                      : authRequired === null && intentReady
                        ? "Verifico accesso…"
                        : intentReady
                          ? "Conferma e costruisci"
                          : "Continua a descrivere"}
                  </button>
                )}
              </div>
            </div>
          </div>
          <aside className={`intent-deck ${prompt.trim() ? "awake" : ""}`} aria-label="Mappa d’intento Fenix">
            <header>
              <span><Sparkles /></span>
              <div>
                <small>FENIX HA CAPITO</small>
                <strong>{prompt.trim() ? "La tua idea prende forma" : "Scrivi. Io leggo tra le righe."}</strong>
              </div>
            </header>
            <p>{prompt.trim() ? "Deduzioni vive dal tuo testo. Confermale oppure continua a scrivere per cambiarle." : "Nessun questionario e nessun template: questa superficie reagisce soltanto alle tue parole."}</p>
            <div className="intent-grid" aria-live="polite">
              {intentSignals.map((signal) => {
                const Icon = intentIcons[signal.id];
                const confirmed = confirmedSignals.includes(signal.id);
                return (
                  <button
                    key={signal.id}
                    className={confirmed ? "confirmed" : ""}
                    onClick={() =>
                      prompt.trim() && setConfirmedSignals((current) =>
                        current.includes(signal.id)
                          ? current.filter((id) => id !== signal.id)
                          : [...current, signal.id],
                      )
                    }
                    disabled={!prompt.trim()}
                    aria-pressed={confirmed}
                  >
                    <span><Icon /></span>
                    <div><small>{signal.label}</small><strong>{signal.value}</strong></div>
                    {confirmed ? <Check /> : <Circle />}
                  </button>
                );
              })}
            </div>
            <section className="spec-theater" aria-label="Direzioni di composizione dedotte">
              <header><span>GRAMMATICA VISIVA</span><strong>Tre letture dello stesso intento</strong></header>
              <div>
                {intentArchetypes.map((archetype, index) => {
                  const Icon = archetypeIcons[archetype.id];
                  return (
                    <article key={`${archetype.id}-${archetype.label}`} className={index === 0 && prompt.trim() ? "recommended" : ""}>
                      <span><Icon /></span>
                      <div><strong>{archetype.label}</strong><small>{archetype.note}</small></div>
                      {index === 0 && prompt.trim() ? <em>RACCOMANDATA</em> : null}
                    </article>
                  );
                })}
              </div>
            </section>
            <footer><Workflow /> Intento confermabile, non prompt preinstallati.</footer>
          </aside>
        </section>
        <section className="recent-projects">
          <div>
            <div>
              <span>CONTINUITÀ OPERATIVA</span>
              <h2>Rientra in un sistema vivo</h2>
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
                <strong>Nessun catalogo di prompt da scegliere</strong>
                <p>Scrivi la tua idea liberamente: Fenix inferisce il prodotto.</p>
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
          <span className={`build-state ${building ? "working" : pipelineFailed ? "failed" : pipelineComplete ? "ready" : "waiting"}`}>
            {building ? <LoaderCircle className="spin" /> : pipelineComplete ? <Check /> : <Circle />}
            {building
              ? "Agenti al lavoro"
              : pipelineFailed
                ? "Da correggere"
                : pipelineComplete
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
                : pipelineFailed
                  ? "La build richiede una correzione"
                  : pipelineComplete
                    ? "Pronto per una nuova modifica"
                    : "In attesa del completamento"}
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
                <strong>{building ? buildLabel : pipelineFailed ? "Build da correggere" : pipelineComplete ? "Prototipo pronto" : "Progetto in attesa"}</strong>
                <p>
                  {building
                    ? "Il team sta lavorando nel sandbox. Puoi seguire ogni passaggio qui sotto."
                    : pipelineFailed
                      ? `Il QA ha fermato il rilascio: ${buildError || "controllo non superato"}.`
                      : pipelineComplete
                        ? "Prova il risultato nella preview. Scrivi una modifica e gli agenti creeranno una nuova versione."
                        : "La preview può essere disponibile, ma il rilascio non è ancora certificato."}
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
              {workspace?.events.length ? (
                <div className="agent-event-feed" aria-label="Evidenze live">
                  <strong>Evidenze live</strong>
                  {workspace.events.slice(-5).map((event) => (
                    <p key={event.id} className={event.severity}>
                      <i />
                      {event.human_message}
                    </p>
                  ))}
                </div>
              ) : null}
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
                device === "mobile" ? (
                  <div className="smartphone-preview">
                    <div className="smartphone-label">
                      <Smartphone />
                      <span>APP · SMARTPHONE LIVE</span>
                      <small>393 × 852</small>
                    </div>
                    <div className="smartphone-frame">
                      <div className="phone-island" aria-hidden="true" />
                      <div className="phone-status" aria-hidden="true">
                        <strong>9:41</strong>
                        <span>
                          <Signal />
                          <Wifi />
                          <BatteryFull />
                        </span>
                      </div>
                      <iframe
                        ref={previewFrameRef}
                        src={livePreview}
                        title={`App mobile ${activeProject?.name}`}
                        sandbox="allow-forms allow-modals allow-popups allow-scripts"
                        referrerPolicy="no-referrer"
                      />
                      <div className="phone-home-indicator" aria-hidden="true" />
                    </div>
                  </div>
                ) : (
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
                      title={`Preview web ${activeProject?.name}`}
                      sandbox="allow-forms allow-modals allow-popups allow-scripts"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )
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
                    Lo Scaffolder avvia una preview reale; poi il Builder la
                    aggiorna mentre genera e verifica il codice.
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
                <div className="code-header-actions">
                  <small>{workspace?.repositoryFiles.length ?? 0} file</small>
                  {activeProject && workspace?.sourceExportReady ? (
                    <a
                      className="source-download"
                      href={`/api/projects/${encodeURIComponent(activeProject.id)}/export`}
                      title="Scarica sorgente, attestazione e verificatore offline"
                    >
                      <Download />
                      {workspace.provenanceReady ? "Sorgente verificabile" : "Scarica sorgente"}
                    </a>
                  ) : null}
                </div>
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
                      nello snapshot esportabile con prova verificabile offline.
                    </p>
                    <div className="recovery-proof">
                      <History />
                      <span>
                        <strong>{workspace?.recoveryPoints.length ?? 0} checkpoint protetti</strong>
                        Ogni build verificata resta recuperabile e separata dalle revisioni successive.
                      </span>
                    </div>
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
