export type IntentVerb =
  | 'browse' | 'search' | 'filter' | 'collect' | 'watch'
  | 'book' | 'pay' | 'assign' | 'approve' | 'track'
  | 'compose' | 'publish' | 'message' | 'analyze' | 'configure';

export type CapabilityId =
  | 'identity.session' | 'identity.account'
  | 'catalog.browse' | 'catalog.search'
  | 'media.play' | 'media.hero' | 'collection.personal'
  | 'booking.slot' | 'booking.resource'
  | 'commerce.checkout' | 'commerce.catalog'
  | 'workflow.kanban' | 'workflow.approval'
  | 'ledger.records' | 'ledger.audit'
  | 'map.spatial' | 'timeline.events'
  | 'canvas.compose' | 'feed.chronological'
  | 'messaging.thread' | 'analytics.cockpit'
  | 'content.editorial' | 'authz.row'
  | 'files.blob' | 'notify.email' | 'job.async';

export type LayoutArchetype =
  | 'stage' | 'browse-rail' | 'atelier' | 'ledger' | 'cockpit'
  | 'map' | 'timeline' | 'ritual' | 'board' | 'feed' | 'directory';

export type IntentNoun = {
  id: string;
  lemma: string;
  plural: string;
  attributes: string[];
  examples: string[];
};

export type IntentGraph = {
  jobToBeDone: string;
  antiJobs: string[];
  primaryActor: { id: string; role: 'guest' | 'member' | 'operator' | 'admin'; display: string };
  secondaryActors: Array<{ id: string; role: 'guest' | 'member' | 'operator' | 'admin'; display: string }>;
  domainNouns: IntentNoun[];
  verbs: IntentVerb[];
  setting: string;
  constraints: string[];
  successScene: string;
  ambiguity: string[];
  requiresConfirmation: boolean;
};

export type CapabilityNode = {
  id: CapabilityId;
  required: boolean;
  boundNouns: string[];
  boundVerbs: IntentVerb[];
  dataNeeds: Array<'relational' | 'blob' | 'event' | 'vector' | 'media'>;
  uiNeeds: LayoutArchetype[];
};

export type CapabilityGraph = {
  nodes: CapabilityNode[];
  edges: Array<{ from: CapabilityId; to: CapabilityId; kind: 'requires' | 'excludes' | 'enhances' }>;
};

export type InteractionModel = {
  screens: Array<{
    id: string;
    title: string;
    archetype: LayoutArchetype;
    primaryNoun: string;
    capabilities: CapabilityId[];
    regions: string[];
    emptyState: string;
    forbiddenChrome: string[];
  }>;
  transitions: Array<{ from: string; to: string; verb: IntentVerb; guard?: string }>;
  nav: 'none' | 'bottom' | 'rail' | 'dots' | 'command';
  firstPaint: string;
};

export type DesignGrammar = {
  atmosphere: {
    chroma: 'muted' | 'saturated' | 'neon' | 'ink';
    material: 'paper' | 'film' | 'metal' | 'glass' | 'fabric' | 'terminal';
    density: 'sparse' | 'regular' | 'dense';
    geometry: 'editorial' | 'rounded' | 'poster' | 'technical';
    motion: 'still' | 'soft' | 'cinematic' | 'snappy';
    spatialMetaphor: 'theater' | 'desk' | 'street' | 'studio' | 'control-room' | 'shelf';
  };
  icon: { family: 'lucide'; opticalSize: 16 | 18 | 20 | 24 | 32; enclosure: 'none' | 'circle' | 'tile' | 'duotone-css'; stroke: 1 | 1.5 | 2 };
  layoutBias: LayoutArchetype[];
  bans: string[];
};

export type CompilerIR = {
  version: 'fenix-intent-ir-v1';
  intent: IntentGraph;
  capabilities: CapabilityGraph;
  interaction: InteractionModel;
  grammar: DesignGrammar;
};

type LegacyBrief = {
  appType: string;
  productName: string;
  summary: string;
  entity: { singular: string; plural: string; fields: Array<{ key: string; label: string; type: string; required: boolean }> };
};

const unique = <T>(items: T[]) => [...new Set(items)];
const includes = (source: string, terms: string[]) => terms.some((term) => source.includes(term));

function noun(id: string, lemma: string, plural: string, attributes: string[], examples: string[] = []): IntentNoun {
  return { id, lemma, plural, attributes, examples };
}

function inferIntent(name: string, description: string, legacy: LegacyBrief): IntentGraph {
  const request = `${name}. ${description}`.replace(/\s+/g, ' ').trim();
  const source = request.toLocaleLowerCase('it');
  const verbs: IntentVerb[] = [];
  let nouns = [noun('primary', legacy.entity.singular, legacy.entity.plural, legacy.entity.fields.map((field) => field.label))];
  let successScene = `Una vista immediata di ${legacy.entity.plural.toLocaleLowerCase('it')}`;
  let setting = 'uno spazio digitale chiaro e operativo';
  let antiJobs = ['mostrare un pannello generico non richiesto'];
  let primaryActor: IntentGraph['primaryActor'] = { id: 'member', role: 'member', display: 'Membro' };
  let secondaryActors: IntentGraph['secondaryActors'] = [{ id: 'admin', role: 'admin', display: 'Amministratore' }];

  if (includes(source, ['film', 'carton', 'cinema', 'streaming', 'watchlist', 'serie tv']) && !includes(source, ['locandin', 'impagin', 'a3', 'poster', 'canvas'])) {
    nouns = [
      noun('title', 'Titolo', 'Titoli', ['titolo', 'era', 'personaggio', 'genere', 'durata', 'valutazione'], ['Il viaggio di Luna', 'Il castello delle nuvole']),
      noun('collection', 'Rassegna', 'Rassegne', ['nome', 'era', 'pubblico']),
    ];
    verbs.push('browse', 'search', 'filter', 'watch', 'collect');
    successScene = 'Un titolo in grande seguito da rassegne di film e cartoni';
    setting = 'un soggiorno, la sera, davanti a uno schermo grande';
    antiJobs = ['gestire un catalogo aziendale', 'mostrare KPI o tabelle come prima schermata'];
    primaryActor = { id: 'viewer', role: 'member', display: 'Spettatore' };
    secondaryActors = [{ id: 'curator', role: 'operator', display: 'Curatore' }];
  } else if (includes(source, ['murator', 'cantiere', 'edil', 'capocantiere', 'lavori in corso'])) {
    nouns = [
      noun('work', 'Lavorazione', 'Lavorazioni', ['cantiere', 'squadra', 'scadenza', 'avanzamento', 'sicurezza'], ['Posa muratura piano terra', 'Tramezzi scala B']),
      noun('site', 'Cantiere', 'Cantieri', ['indirizzo', 'responsabile', 'stato']),
    ];
    verbs.push('assign', 'track', 'approve');
    successScene = 'Il cantiere di oggi con lavorazioni, squadra e sicurezza sotto controllo';
    setting = 'un cantiere operativo consultato rapidamente da smartphone';
    antiJobs = ['mostrare un form generico', 'ridurre il cantiere a una lista senza avanzamento'];
    primaryActor = { id: 'foreman', role: 'operator', display: 'Capocantiere' };
    secondaryActors = [{ id: 'crew', role: 'member', display: 'Squadra' }];
  } else if (includes(source, ['turni', 'turno', 'sala e cucina', 'chef', 'fuochi', 'ticket'])) {
    nouns = [
      noun('shift', 'Turno', 'Turni', ['persona', 'area', 'inizio', 'fine', 'copertura'], ['Sala pranzo', 'Pass cucina']),
      noun('station', 'Postazione', 'Postazioni', ['area', 'capienza', 'responsabile']),
    ];
    verbs.push('assign', 'track', 'configure');
    successScene = 'La copertura live di sala e cucina, organizzata per turno e postazione';
    setting = 'il pass di una cucina durante il servizio';
    antiJobs = ['mostrare un CRUD del personale', 'ridurre il servizio a una lista di task'];
    primaryActor = { id: 'manager', role: 'operator', display: 'Responsabile turno' };
    secondaryActors = [{ id: 'staff', role: 'member', display: 'Staff' }];
  } else if (includes(source, ['locandin', 'impagin', 'a3', 'poster', 'canvas'])) {
    nouns = [noun('poster', 'Locandina', 'Locandine', ['titolo', 'formato', 'immagine', 'tipografia', 'versione'], ['Rassegna d’autore', 'Proiezione speciale'])];
    verbs.push('compose', 'publish', 'configure');
    successScene = 'Una locandina A3 al centro con strumenti tipografici e anteprima di stampa';
    setting = 'uno studio grafico con tela e tavolo di montaggio';
    antiJobs = ['mostrare una libreria di contenuti', 'imitare un pannello amministrativo'];
    primaryActor = { id: 'designer', role: 'member', display: 'Progettista' };
    secondaryActors = [{ id: 'reviewer', role: 'operator', display: 'Revisore' }];
  } else if (includes(source, ['mappa', 'mappe', 'geolocal', 'fontanil'])) {
    nouns = [noun('place', 'Luogo', 'Luoghi', ['nome', 'coordinate', 'stato', 'segnalazioni'])];
    verbs.push('browse', 'search', 'track');
    successScene = 'La mappa dei luoghi con stato e segnalazioni sul territorio';
    setting = 'una mappa civica esplorabile';
  } else if (includes(source, ['prenot', 'appuntament', 'campo da padel', 'canoe', 'prima visita'])) {
    verbs.push('book', 'track', 'configure');
    successScene = `Le disponibilità e il prossimo ${legacy.entity.singular.toLocaleLowerCase('it')} in primo piano`;
    setting = 'un banco accoglienza con agenda e disponibilità';
    antiJobs = ['mostrare un calendario vuoto senza risorse o vincoli'];
  } else if (includes(source, ['dashboard', 'kpi', 'funnel', 'analisi vendite', 'analytics'])) {
    verbs.push('analyze', 'track', 'filter');
    successScene = 'Indicatori, andamento e funnel richiesti in una vista di controllo';
    setting = 'una sala di controllo dati';
    antiJobs = [];
  } else {
    if (includes(source, ['cerca', 'catalog', 'archivio', 'trova'])) verbs.push('browse', 'search');
    if (includes(source, ['assegn', 'kanban', 'bacheca', 'task'])) verbs.push('assign', 'track');
    if (includes(source, ['approv', 'consens', 'revis'])) verbs.push('approve', 'track');
    if (includes(source, ['pubblic', 'contenut', 'articol', 'blog'])) verbs.push('publish');
    if (includes(source, ['messagg', 'chat', 'thread'])) verbs.push('message');
    if (includes(source, ['paga', 'checkout', 'acquist', 'ordine'])) verbs.push('pay', 'browse');
    if (includes(source, ['traccia', 'registro', 'diario', 'scadenz', 'inventario'])) verbs.push('track');
  }

  if (!verbs.length) verbs.push('track');
  const vague = request.length < 55 || includes(source, ['un’app figa', 'una app figa', 'qualcosa per i miei contenuti']);
  const ambiguity = vague ? ['manca una scena di successo osservabile', 'non è chiaro chi usa il prodotto e per quale azione primaria'] : [];
  return {
    jobToBeDone: description.trim() || name.trim(),
    antiJobs,
    primaryActor,
    secondaryActors,
    domainNouns: nouns,
    verbs: unique(verbs),
    setting,
    constraints: includes(source, ['telefono', 'mobile']) ? ['uso rapido da telefono', 'target touch da almeno 44px'] : ['interfaccia responsive', 'accessibilità WCAG AA'],
    successScene,
    ambiguity,
    requiresConfirmation: ambiguity.length > 0,
  };
}

function node(id: CapabilityId, intent: IntentGraph, verbs: IntentVerb[], uiNeeds: LayoutArchetype[], dataNeeds: CapabilityNode['dataNeeds'] = ['relational']): CapabilityNode {
  return { id, required: true, boundNouns: intent.domainNouns.map((item) => item.id), boundVerbs: verbs, dataNeeds, uiNeeds };
}

export function bindCapabilities(intent: IntentGraph): CapabilityGraph {
  const source = `${intent.jobToBeDone} ${intent.successScene}`.toLocaleLowerCase('it');
  const verbs = new Set(intent.verbs);
  const nodes: CapabilityNode[] = [node('identity.session', intent, [], ['directory'])];
  if (verbs.has('browse') || verbs.has('search') || verbs.has('filter')) nodes.push(node('catalog.browse', intent, ['browse'], ['browse-rail', 'directory']));
  if (verbs.has('search')) nodes.push(node('catalog.search', intent, ['search'], ['browse-rail', 'directory']));
  if (verbs.has('watch')) nodes.push(node('media.hero', intent, ['watch'], ['stage'], ['media']), node('media.play', intent, ['watch'], ['stage'], ['media']));
  if (verbs.has('collect')) nodes.push(node('collection.personal', intent, ['collect'], ['browse-rail']));
  if (verbs.has('book')) nodes.push(node('booking.slot', intent, ['book'], ['ritual']), node('booking.resource', intent, ['configure'], ['ritual']));
  if (verbs.has('pay')) nodes.push(node('commerce.checkout', intent, ['pay'], ['ritual']), node('commerce.catalog', intent, ['browse'], ['browse-rail']));
  if (verbs.has('assign')) nodes.push(node('workflow.kanban', intent, ['assign', 'track'], ['board']));
  if (verbs.has('approve')) nodes.push(node('workflow.approval', intent, ['approve'], ['ritual', 'ledger']));
  if (verbs.has('compose')) nodes.push(node('canvas.compose', intent, ['compose', 'configure'], ['atelier'], ['blob']));
  if (verbs.has('publish')) nodes.push(node('content.editorial', intent, ['publish'], ['feed']));
  if (verbs.has('message')) nodes.push(node('messaging.thread', intent, ['message'], ['feed'], ['event']));
  if (verbs.has('analyze')) nodes.push(node('analytics.cockpit', intent, ['analyze', 'filter'], ['cockpit'], ['event']));
  if (includes(source, ['mappa', 'territorio', 'coordinate'])) nodes.push(node('map.spatial', intent, ['browse', 'track'], ['map']));
  if (verbs.has('track') && !nodes.some((item) => ['workflow.kanban', 'analytics.cockpit', 'map.spatial'].includes(item.id))) nodes.push(node('timeline.events', intent, ['track'], ['timeline'], ['event']));
  nodes.push(node('authz.row', intent, [], ['directory']));
  const ids = new Set(nodes.map((item) => item.id));
  const edges: CapabilityGraph['edges'] = [];
  if (ids.has('media.play') && ids.has('media.hero')) edges.push({ from: 'media.play', to: 'media.hero', kind: 'requires' });
  if (ids.has('booking.slot') && ids.has('booking.resource')) edges.push({ from: 'booking.slot', to: 'booking.resource', kind: 'requires' });
  if (ids.has('analytics.cockpit')) edges.push({ from: 'analytics.cockpit', to: 'catalog.browse', kind: 'enhances' });
  return { nodes, edges };
}

function chooseArchetypes(graph: CapabilityGraph): LayoutArchetype[] {
  const ids = new Set(graph.nodes.map((item) => item.id));
  if (ids.has('analytics.cockpit')) return ['cockpit', 'ledger'];
  if (ids.has('canvas.compose')) return ['atelier', 'directory'];
  if (ids.has('media.hero')) return ['stage', 'browse-rail'];
  if (ids.has('map.spatial')) return ['map', 'directory'];
  if (ids.has('workflow.kanban')) return ['board', 'timeline'];
  if (ids.has('booking.slot') || ids.has('workflow.approval')) return ['ritual', 'ledger'];
  if (ids.has('content.editorial') || ids.has('messaging.thread')) return ['feed', 'directory'];
  if (ids.has('timeline.events')) return ['timeline', 'ledger'];
  if (ids.has('catalog.browse')) return ['browse-rail', 'directory'];
  return ['directory', 'ledger'];
}

function designGrammar(intent: IntentGraph, layoutBias: LayoutArchetype[]): DesignGrammar {
  const primary = layoutBias[0];
  const presets: Record<LayoutArchetype, Omit<DesignGrammar['atmosphere'], never>> = {
    stage: { chroma: 'saturated', material: 'film', density: 'sparse', geometry: 'poster', motion: 'cinematic', spatialMetaphor: 'theater' },
    'browse-rail': { chroma: 'saturated', material: 'film', density: 'regular', geometry: 'poster', motion: 'soft', spatialMetaphor: 'shelf' },
    atelier: { chroma: 'ink', material: 'paper', density: 'regular', geometry: 'editorial', motion: 'soft', spatialMetaphor: 'studio' },
    ledger: { chroma: 'muted', material: 'glass', density: 'dense', geometry: 'technical', motion: 'still', spatialMetaphor: 'desk' },
    cockpit: { chroma: 'neon', material: 'terminal', density: 'dense', geometry: 'technical', motion: 'snappy', spatialMetaphor: 'control-room' },
    map: { chroma: 'muted', material: 'paper', density: 'regular', geometry: 'technical', motion: 'soft', spatialMetaphor: 'street' },
    timeline: { chroma: 'ink', material: 'paper', density: 'regular', geometry: 'editorial', motion: 'soft', spatialMetaphor: 'desk' },
    ritual: { chroma: 'muted', material: 'glass', density: 'sparse', geometry: 'rounded', motion: 'soft', spatialMetaphor: 'desk' },
    board: { chroma: 'ink', material: 'paper', density: 'dense', geometry: 'technical', motion: 'snappy', spatialMetaphor: 'control-room' },
    feed: { chroma: 'muted', material: 'paper', density: 'regular', geometry: 'editorial', motion: 'soft', spatialMetaphor: 'shelf' },
    directory: { chroma: 'muted', material: 'glass', density: 'regular', geometry: 'rounded', motion: 'soft', spatialMetaphor: 'desk' },
  };
  const opticalSize = primary === 'stage' ? 32 : primary === 'ledger' || primary === 'cockpit' ? 16 : 20;
  return {
    atmosphere: presets[primary],
    icon: { family: 'lucide', opticalSize, enclosure: primary === 'stage' ? 'duotone-css' : primary === 'ledger' ? 'none' : 'tile', stroke: primary === 'stage' ? 1.5 : 2 },
    layoutBias,
    bans: primary === 'cockpit' ? ['decorative KPI without a bound measure'] : ['KPI cards', 'generic Overview sidebar', 'Item 1', 'full-width table as first paint'],
  };
}

export function compileIntent(name: string, description: string, legacy: LegacyBrief): CompilerIR {
  const intent = inferIntent(name, description, legacy);
  const capabilities = bindCapabilities(intent);
  const layoutBias = chooseArchetypes(capabilities);
  const firstPaint = 'success-scene';
  const capabilityIds = capabilities.nodes.map((item) => item.id);
  const interaction: InteractionModel = {
    screens: [{
      id: firstPaint,
      title: intent.successScene,
      archetype: layoutBias[0],
      primaryNoun: intent.domainNouns[0]?.id ?? 'primary',
      capabilities: capabilityIds,
      regions: layoutBias[0] === 'stage' ? ['header', 'stage', 'rails', 'detail'] : layoutBias[0] === 'atelier' ? ['tools', 'canvas', 'inspector'] : ['header', 'primary', 'detail'],
      emptyState: `Nessun ${intent.domainNouns[0]?.lemma.toLocaleLowerCase('it') ?? 'dato'} ancora. Inizia dall’azione principale.`,
      forbiddenChrome: capabilityIds.includes('analytics.cockpit') ? [] : ['sidebar dashboard', 'KPI cards', 'Overview', 'Item table as home'],
    }],
    transitions: intent.verbs.slice(0, 4).map((verb) => ({ from: 'entry', to: firstPaint, verb })),
    nav: layoutBias[0] === 'stage' ? 'rail' : layoutBias[0] === 'atelier' ? 'command' : layoutBias[0] === 'ritual' ? 'dots' : 'rail',
    firstPaint,
  };
  return { version: 'fenix-intent-ir-v1', intent, capabilities, interaction, grammar: designGrammar(intent, layoutBias) };
}

export function hasCapability(ir: CompilerIR, id: CapabilityId) {
  return ir.capabilities.nodes.some((item) => item.id === id);
}

export function assertNoCockpitLeak(ir: CompilerIR) {
  const cockpitAllowed = hasCapability(ir, 'analytics.cockpit');
  const leaked = ir.interaction.screens.some((screen) => screen.archetype === 'cockpit' || (!cockpitAllowed && /dashboard|kpi|overview/i.test(screen.title)));
  if (!cockpitAllowed && leaked) throw new Error('COCKPIT_WITHOUT_CAPABILITY');
}

export function legacyProjection(ir: CompilerIR) {
  const noun = ir.intent.domainNouns[0];
  const primary = ir.grammar.layoutBias[0];
  const defaults = {
    entity: {
      singular: noun?.lemma ?? 'Elemento',
      plural: noun?.plural ?? 'Elementi',
      fields: primary === 'atelier'
        ? [
          { key: 'title', label: 'Titolo', type: 'text', required: true },
          { key: 'format', label: 'Formato', type: 'text', required: true },
          { key: 'version', label: 'Versione', type: 'number', required: true },
          { key: 'status', label: 'Stato', type: 'status', required: true },
        ]
        : primary === 'board'
          ? [
            { key: 'name', label: noun?.lemma ?? 'Turno', type: 'text', required: true },
            { key: 'area', label: 'Area', type: 'text', required: true },
            { key: 'startAt', label: 'Inizio', type: 'date', required: true },
            { key: 'status', label: 'Copertura', type: 'status', required: true },
          ]
          : [
            { key: 'name', label: noun?.lemma ?? 'Nome', type: 'text', required: true },
            { key: 'detail', label: noun?.attributes[1] ?? 'Dettaglio', type: 'text', required: true },
            { key: 'createdAt', label: 'Data', type: 'date', required: true },
            { key: 'status', label: 'Stato', type: 'status', required: true },
          ],
    },
    roles: [ir.intent.primaryActor.display, ...ir.intent.secondaryActors.map((actor) => actor.display)],
    workflows: primary === 'atelier' ? ['Componi', 'Revisiona', 'Esporta'] : primary === 'board' ? ['Pianifica', 'Assegna', 'Copri'] : primary === 'cockpit' ? ['Analizza', 'Confronta', 'Decidi'] : ['Esplora', 'Aggiorna', 'Completa'],
    pages: primary === 'atelier' ? ['Tela', 'Elementi', 'Esportazioni'] : primary === 'board' ? ['Turni', 'Postazioni', 'Coperture'] : primary === 'cockpit' ? ['Indicatori', 'Funnel', 'Segmenti'] : [noun?.plural ?? 'Raccolta', 'Attività', 'Dettagli'],
  };
  return defaults;
}

export function specificityOracle(ir: CompilerIR, firstPaintHtml: string) {
  const text = firstPaintHtml.toLocaleLowerCase('it');
  const reasons: string[] = [];
  const primary = ir.intent.domainNouns[0];
  const nounPresent = primary ? [primary.lemma, primary.plural, ...primary.examples].some((value) => text.includes(value.toLocaleLowerCase('it'))) : true;
  if (!nounPresent) reasons.push(`missing-noun:${primary?.lemma ?? 'primary'}`);
  if (!hasCapability(ir, 'analytics.cockpit')) {
    for (const banned of ['workspace live', 'alpha', 'orione', 'item 1', 'elemento mattina', 'elemento pomeriggio', 'kpi', 'dashboard vendite']) {
      if (text.includes(banned)) reasons.push(`banned-chrome:${banned}`);
    }
  }
  const first = ir.interaction.screens.find((screen) => screen.id === ir.interaction.firstPaint);
  if (first?.archetype === 'cockpit' && !hasCapability(ir, 'analytics.cockpit')) reasons.push('first-paint-cockpit');
  return { pass: reasons.length === 0, score: Math.max(0, 1 - reasons.length / 6), reasons };
}
