export type BenchmarkPrompt = {
  id: string;
  brief: string;
  trap: string;
  expected: 'stage' | 'board' | 'ritual' | 'timeline' | 'browse-rail' | 'atelier' | 'map' | 'cockpit' | 'gate' | 'directory' | 'feed';
};

export const generatorBenchmarkPrompts: BenchmarkPrompt[] = [
  { id: 'P01', brief: 'App per serate film e cartoni da guardare in famiglia, con rassegne per era e personaggi', trap: 'dashboard / IP', expected: 'stage' },
  { id: 'P02', brief: 'Turni sala e cucina di una trattoria, cambi last-minute dal telefono', trap: 'CRUD staff', expected: 'board' },
  { id: 'P03', brief: 'Studio dentistico: promemoria, consensi, prima visita', trap: 'calendar generico', expected: 'ritual' },
  { id: 'P04', brief: 'Noleggio canoe sul lago, meteo e capienza scafi', trap: 'e-commerce', expected: 'ritual' },
  { id: 'P05', brief: 'Diario di cantina: botti, travasi, prelievi', trap: 'inventory', expected: 'timeline' },
  { id: 'P06', brief: 'Bacheca turni volontari di una parrocchia', trap: 'kanban', expected: 'board' },
  { id: 'P07', brief: 'Catalogo vinili di un negozio fisico, ascolto in store', trap: 'Shopify clone', expected: 'browse-rail' },
  { id: 'P08', brief: 'Trainer di battuta per una compagnia teatrale', trap: 'notes app', expected: 'ritual' },
  { id: 'P09', brief: 'Mappa dei fontanili comunali con segnalazioni', trap: 'dashboard GIS', expected: 'map' },
  { id: 'P10', brief: 'Cassa e tavoli di un food truck, coda visibile', trap: 'POS template', expected: 'board' },
  { id: 'P11', brief: 'Portafoglio referenze di una falegnameria su misura', trap: 'portfolio theme', expected: 'directory' },
  { id: 'P12', brief: 'Registro allergeni e pasti di un asilo', trap: 'spreadsheet', expected: 'timeline' },
  { id: 'P13', brief: 'Club di trekking: uscite, liste, auto', trap: 'social network', expected: 'timeline' },
  { id: 'P14', brief: 'Tool per impaginare locandine A3 di un cinema d’essai', trap: 'Canva clone', expected: 'atelier' },
  { id: 'P15', brief: 'Recupero crediti di un dentista: scadenze e lettere', trap: 'CRM', expected: 'timeline' },
  { id: 'P16', brief: 'Quiz di anatomia per OSS, errori frequenti', trap: 'LMS', expected: 'ritual' },
  { id: 'P17', brief: 'Prenotazione campo da padel, luci e soci', trap: 'booking.com', expected: 'ritual' },
  { id: 'P18', brief: 'Fammi una dashboard vendite con KPI e funnel', trap: 'controllo positivo cockpit', expected: 'cockpit' },
  { id: 'P19', brief: 'un’app figa per i miei contenuti', trap: 'ambiguità', expected: 'gate' },
  { id: 'P20', brief: 'Marketplace usato tra condomini dello stesso stabile', trap: 'Airbnb clone', expected: 'browse-rail' },
  { id: 'P21', brief: 'Timer e piatti di una cucina a 6 fuochi, ticket chef', trap: 'todo list', expected: 'board' },
  { id: 'P22', brief: 'Archivio sentenze interne di uno studio legale, permessi per praticante', trap: 'cartelle', expected: 'directory' },
];

export const benchmarkRubric = [
  { id: 'S1', label: 'Specificità first paint', weight: 20, hardGate: true },
  { id: 'S2', label: 'Funzione core in 60 secondi', weight: 15, hardGate: true },
  { id: 'S3', label: 'Dati di scena', weight: 10, hardGate: false },
  { id: 'S4', label: 'Autorizzazioni aderenti agli attori', weight: 10, hardGate: false },
  { id: 'S5', label: 'Patch chirurgica', weight: 10, hardGate: false },
  { id: 'S6', label: 'Tempo e costo', weight: 10, hardGate: false },
  { id: 'S7', label: 'Preview uguale alla produzione', weight: 5, hardGate: false },
  { id: 'S8', label: 'Accessibilità e icone', weight: 5, hardGate: false },
  { id: 'S9', label: 'Identità visiva', weight: 10, hardGate: false },
  { id: 'S10', label: 'Riparazione con stop e undo', weight: 5, hardGate: false },
] as const;

export const compilerCiPromptIds = ['P01', 'P02', 'P14', 'P18', 'P19'] as const;

export const benchmarkPassPolicy = {
  minimumPromptScore: 70,
  minimumPassingPrompts: 16,
  maximumRepairRetries: 2,
  maximumMedianPreviewMinutes: 8,
  hardGates: ['S1', 'S2', 'P01-not-cockpit', 'P18-is-cockpit', 'P19-requires-confirmation'],
} as const;
