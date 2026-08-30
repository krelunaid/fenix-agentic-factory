import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { buildSeedRows, generateAgenticApplication, inferProductBrief } from '../lib/build-plane/agentic-generator';
import { buildDurablePreviewHtml, decodePreviewBundle, refreshPreviewBundle } from '../lib/build-plane/durable-preview';

async function materialize(description: string) {
  const brief = inferProductBrief('Black-box build', description);
  const files = generateAgenticApplication(brief);
  const directory = await mkdtemp(join(tmpdir(), 'fenix-agentic-'));
  for (const file of files) {
    const target = join(directory, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, 'utf8');
  }
  return { brief, files, directory };
}

async function runScenario(directory: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/scenario.mjs'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('exit', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `scenario_exit_${code}`)));
  });
}

async function runQuality(directory: string, mode: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/quality.mjs', mode], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr || `quality_${mode}_exit_${code}`)));
  });
}

async function runWebsiteContact(directory: string) {
  const port = 8192;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: directory,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/api/health`)).ok;
        if (ready) break;
      } catch {}
    }
    assert.equal(ready, true, 'generated website server did not start');
    const response = await fetch(`http://127.0.0.1:${port}/api/contact`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Ada Lovelace',
        email: 'ada@example.test',
        message: 'Vorrei avviare un nuovo progetto.',
      }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json() as { ok?: boolean }).ok, true);
  } finally {
    child.kill('SIGTERM');
  }
}

async function runInstantApplicationPreview(directory: string) {
  const port = 8193;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: directory,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    let session: Response | null = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        session = await fetch(`http://127.0.0.1:${port}/api/session`);
        if (session.ok) break;
      } catch {}
    }
    assert.equal(session?.status, 200, 'preview should open without credentials');
    const list = await fetch(`http://127.0.0.1:${port}/api/items`);
    const payload = await list.json() as { items?: unknown[] };
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(payload.items) && payload.items.length > 0);
  } finally {
    child.kill('SIGTERM');
  }
}

test('different briefs generate materially different full-stack applications', async () => {
  const crm = await materialize('CRM vendite per gestire clienti, lead, valore e stato delle opportunità');
  const booking = await materialize('Sistema di prenotazioni per uno studio con clienti, date e conferme');
  try {
    assert.equal(crm.brief.appType, 'crm');
    assert.equal(booking.brief.appType, 'booking');
    assert.notEqual(crm.brief.entity.plural, booking.brief.entity.plural);
    const crmHtml = crm.files.find((file) => file.path === 'public/index.html')?.content ?? '';
    const bookingHtml = booking.files.find((file) => file.path === 'public/index.html')?.content ?? '';
    assert.match(crmHtml, /Clienti/);
    assert.match(bookingHtml, /Prenotazioni/);
    assert.match(crmHtml, /Pipeline vendite/);
    assert.match(bookingHtml, /Agenda prenotazioni/);
    assert.notEqual(crmHtml, bookingHtml);
    for (const result of [crm, booking]) {
      const paths = new Set(result.files.map((file) => file.path));
      assert.deepEqual(['server.mjs', 'public/index.html', 'public/app.js', 'scripts/scenario.mjs', 'fenix.product-brief.json'].every((path) => paths.has(path)), true);
    }
  } finally {
    await Promise.all([rm(crm.directory, { recursive: true, force: true }), rm(booking.directory, { recursive: true, force: true })]);
  }
});

test('generated application passes complete create, update and delete scenario', async () => {
  const generated = await materialize('Inventario di magazzino per risorse, quantità e responsabili');
  try {
    for (const mode of ['typecheck', 'lint', 'unit', 'build']) await runQuality(generated.directory, mode);
    const output = await runScenario(generated.directory);
    assert.match(output, /"status":"passed"/);
    assert.match(output, /"auth"/);
    assert.match(output, /"create"/);
    assert.match(output, /"update"/);
    assert.match(output, /"delete"/);
    const html = generated.files.find((file) => file.path === 'public/index.html')?.content ?? '';
    assert.doesNotMatch(html, /id="login-form"/);
    assert.match(html, /class="product-view/);
    assert.match(html, /data-archetype="timeline"/);
    assert.doesNotMatch(html, /Workspace live|Alpha|Orione|Nova|Atlas/);
    assert.ok(generated.files.some((file) => file.path === 'fenix.intent-graph.json'));
    assert.ok(generated.files.some((file) => file.path === 'fenix.specificity.json'));
    await runInstantApplicationPreview(generated.directory);
  } finally {
    await rm(generated.directory, { recursive: true, force: true });
  }
});

test('website briefs generate a public site with a persisted contact flow', async () => {
  const generated = await materialize('Sito web premium per uno studio creativo con servizi, portfolio e modulo contatti');
  try {
    assert.equal(generated.brief.appType, 'website');
    const html = generated.files.find((file) => file.path === 'public/index.html')?.content ?? '';
    const app = generated.files.find((file) => file.path === 'public/app.js')?.content ?? '';
    const server = generated.files.find((file) => file.path === 'server.mjs')?.content ?? '';
    assert.match(html, /id="contact-form"/);
    assert.match(html, /Hai un progetto in mente/);
    assert.match(app, /\/api\/contact/);
    assert.match(server, /\/api\/contact/);
    for (const mode of ['typecheck', 'lint', 'unit', 'build']) await runQuality(generated.directory, mode);
    await runWebsiteContact(generated.directory);
  } finally {
    await rm(generated.directory, { recursive: true, force: true });
  }
});

test('generated source becomes a permanent same-site interactive preview', () => {
  const brief = inferProductBrief('Spesa smart', 'Applicazione per segnare cosa compro e quanto spendo');
  const files = generateAgenticApplication(brief);
  const encoded = Buffer.from(JSON.stringify({ productBrief: brief, files })).toString('base64');
  const html = buildDurablePreviewHtml(
    decodePreviewBundle(encoded),
    '/preview/project-1?token=signed',
  );
  assert.match(html, /<style>/);
  assert.match(html, /<script type="module">/);
  assert.match(html, /\/preview\/project-1\?token=signed&api=items/);
  assert.match(html, /fenix:preview-request/);
  assert.match(html, /window\.fenixPreviewFetch/);
  assert.doesNotMatch(html, /src="\/app\.js"/);
  assert.doesNotMatch(html, /href="\/styles\.css"/);
});

test('personal purchase prompts create a shopping experience, not a generic dashboard', () => {
  const brief = inferProductBrief('La mia spesa', 'App per segnare cosa compro e quanto spendo');
  const files = generateAgenticApplication(brief);
  const html = files.find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.equal(brief.appType, 'shopping');
  assert.match(html, /Lista acquisti/);
  assert.match(html, /Budget sotto controllo/);
});

test('every generated application has a native mobile shell and contextual icon tabs', () => {
  const brief = inferProductBrief('Agenda mobile', 'App per prenotazioni e appuntamenti di uno studio');
  const files = generateAgenticApplication(brief);
  const html = files.find((file) => file.path === 'public/index.html')?.content ?? '';
  const css = files.find((file) => file.path === 'public/styles.css')?.content ?? '';
  const app = files.find((file) => file.path === 'public/app.js')?.content ?? '';
  assert.match(html, /class="shell mobile-app/);
  assert.match(html, /data-app-type="booking"/);
  assert.match(html, /class="mobile-tabbar"/);
  assert.match(html, /class="mobile-tab active"/);
  assert.match(html, /<use href="#i-calendar-days"/);
  assert.match(css, /@media\(max-width:780px\)[\s\S]*\.mobile-tabbar/);
  assert.match(css, /grid-auto-columns:82%/);
  assert.match(app, /\.nav-item,\.mobile-tab/);
});

test('a bare app request becomes a coherent product instead of Elemento CRUD', () => {
  const brief = inferProductBrief('mi crei un app', 'Applicazione full-stack: mi crei un app');
  const files = generateAgenticApplication(brief);
  const html = files.find((file) => file.path === 'public/index.html')?.content ?? '';
  const app = files.find((file) => file.path === 'public/app.js')?.content ?? '';
  assert.equal(brief.productName, 'Orbit');
  assert.equal(brief.appType, 'project');
  assert.equal(brief.entity.singular, 'Attività');
  assert.deepEqual(brief.pages, ['Oggi', 'Progetti', 'Focus', 'Profilo']);
  assert.match(html, /Priorità personali/);
  assert.match(html, /Le tue priorità/);
  assert.match(html, /data-fenix-ui="native-mobile-v3"/);
  assert.doesNotMatch(html, /Elemento|Elementi|Responsabile 1/);
  assert.doesNotMatch(app, /\.soft-action,\.round-action[^\n]+showModal/);
});

test('mobile editor is a true bottom sheet and never sits under the tab bar', () => {
  const files = generateAgenticApplication(inferProductBrief('Agenda', 'app mobile per prenotazioni e appuntamenti'));
  const html = files.find((file) => file.path === 'public/index.html')?.content ?? '';
  const css = files.find((file) => file.path === 'public/styles.css')?.content ?? '';
  const app = files.find((file) => file.path === 'public/app.js')?.content ?? '';
  assert.match(css, /#app:has\(\.mobile-app\)>dialog/);
  assert.match(css, /body:has\(dialog\[open\]\) \.mobile-tabbar/);
  assert.match(app, /const openEditor=/);
  assert.match(app, /#new-item[^\n]+openEditor/);
  assert.doesNotMatch(app, /querySelectorAll\('\.soft-action,\.round-action'\)/);
  assert.match(html, /id="detail-form"/);
  assert.match(app, /method:'PATCH'/);
  assert.match(app, /hydrateSurfaceLinks/);
  assert.match(app, /surfaceSelector=/);
});

test('black-box app suite exposes real record interactions across product archetypes', () => {
  const prompts = [
    ['CRM commerciale', 'crm per lead, clienti e opportunità'],
    ['Negozio', 'ecommerce per prodotti, ordini e disponibilità'],
    ['Spesa', 'app per segnare cosa compro e quanto spendo'],
    ['VerdeVivo', 'app per curare piante e annaffiature'],
    ['CineMagic', 'app per film e cartoni Disney con preferiti'],
    ['Agenda', 'app per prenotazioni e appuntamenti'],
    ['Sprint', 'kanban per progetti e task del team'],
    ['Editoriale', 'cms per articoli, autori e pubblicazione'],
    ['Magazzino', 'inventario e logistica per le risorse'],
    ['Turni trattoria', 'turni sala e cucina con cambi dal telefono'],
  ] as const;

  for (const [name, description] of prompts) {
    const files = generateAgenticApplication(inferProductBrief(name, description));
    const html = files.find((file) => file.path === 'public/index.html')?.content ?? '';
    const app = files.find((file) => file.path === 'public/app.js')?.content ?? '';
    const server = files.find((file) => file.path === 'server.mjs')?.content ?? '';
    assert.match(html, /data-fenix-ui="native-mobile-v3"/);
    assert.match(html, /id="detail-form"/);
    assert.match(app, /openDetail/);
    assert.match(app, /hydrateSurfaceLinks/);
    assert.match(server, /req\.method==='PATCH'/);
    assert.doesNotMatch(html, /Elemento Mattina|Elemento Pomeriggio|Responsabile 1/);
  }
});

test('plant prompts create a polished plant-care application', () => {
  const brief = inferProductBrief('mi crei un app di piante', 'Applicazione full-stack: mi crei un app di piante');
  const files = generateAgenticApplication(brief);
  const html = files.find((file) => file.path === 'public/index.html')?.content ?? '';
  const css = files.find((file) => file.path === 'public/styles.css')?.content ?? '';
  const rows = buildSeedRows(brief);
  assert.equal(brief.appType, 'plants');
  assert.equal(brief.productName, 'VerdeVivo');
  assert.equal(brief.entity.plural, 'Piante');
  assert.match(html, /Cura delle piante/);
  assert.match(html, /Annaffiatura oggi/);
  assert.match(html, /Monstera Alba/);
  assert.match(html, /Nuova pianta/);
  assert.doesNotMatch(html, /Nuovo elemento/);
  assert.match(css, /\.plant-grid/);
  assert.equal(rows[0]?.name, 'Monstera Alba');
});

test('film and cartoon prompts create a cinematic catalog instead of the generic workspace', () => {
  const brief = inferProductBrief(
    'mi crei un app per sapere tutti i film e Cartoni Disney',
    'Applicazione full-stack per scoprire film e cartoni Disney e salvare i preferiti',
  );
  const files = generateAgenticApplication(brief);
  const html = files.find((file) => file.path === 'public/index.html')?.content ?? '';
  const css = files.find((file) => file.path === 'public/styles.css')?.content ?? '';
  const rows = buildSeedRows(brief);
  assert.equal(brief.appType, 'entertainment');
  assert.equal(brief.productName, 'CineMagic');
  assert.equal(brief.entity.plural, 'Titoli');
  assert.deepEqual(brief.pages, ['Scopri', 'Film', 'Cartoni', 'La mia lista']);
  assert.match(html, /Catalogo film e cartoni/);
  assert.match(html, /La magia del cinema/);
  assert.match(html, /Continua a esplorare/);
  assert.match(html, /Encanto/);
  assert.match(html, /Il Re Leone/);
  assert.match(html, /Aggiungi titolo/);
  assert.match(html, /<use href="#i-clapperboard"/);
  assert.match(html, /<use href="#i-film"/);
  assert.match(html, /<use href="#i-heart"/);
  assert.match(css, /\.media-grid/);
  assert.match(css, /\.entertainment-shell/);
  assert.doesNotMatch(html, /Alpha|Orione|Nova|Atlas|Workspace live|Panoramica|Elementi/);
  assert.equal(rows[0]?.title, 'Encanto');
});

test('every generated product uses the canonical Lucide icon system', () => {
  const cases = [
    ['Sito', 'sito web per uno studio', 'panels-top-left'],
    ['CRM', 'crm vendite per clienti', 'users-round'],
    ['Shop', 'ecommerce di prodotti', 'store'],
    ['Spesa', 'lista acquisti personale', 'shopping-basket'],
    ['Piante', 'app per curare piante', 'sprout'],
    ['Cinema', 'app per scoprire film e cartoni Disney', 'clapperboard'],
    ['Agenda', 'prenotazioni e appuntamenti', 'calendar-days'],
    ['Progetti', 'kanban per progetti e task', 'square-kanban'],
    ['Contenuti', 'cms editoriale per articoli', 'file-text'],
    ['Magazzino', 'inventario e logistica', 'boxes'],
    ['Workspace', 'applicazione generica', 'layout-dashboard'],
  ] as const;
  const forbidden = ['❋', '⌑', '↗', '◇', '⌂', '▦', '✓', '◎', '⌕', '＋', '×', '✦', '◷', '◫', '⌁', '›'];

  for (const [name, description, expectedIcon] of cases) {
    const brief = inferProductBrief(name, description);
    const files = generateAgenticApplication(brief);
    const html = files.find((file) => file.path === 'public/index.html')?.content ?? '';
    const app = files.find((file) => file.path === 'public/app.js')?.content ?? '';
    assert.match(html, /data-icon-system="lucide-v1"/);
    assert.match(html, new RegExp(`<symbol id="i-${expectedIcon}"`));
    assert.match(html, new RegExp(`<use href="#i-${expectedIcon}"`));
    assert.match(html, /class="ui-icon/);
    assert.equal(forbidden.some((glyph) => html.includes(glyph) || app.includes(glyph)), false);
  }

  const plant = generateAgenticApplication(inferProductBrief('Piante', 'app per curare piante'));
  const plantHtml = plant.find((file) => file.path === 'public/index.html')?.content ?? '';
  const plantApp = plant.find((file) => file.path === 'public/app.js')?.content ?? '';
  assert.match(plantHtml, /aria-label="Chiudi"/);
  assert.match(plantApp, /aria-label="Elimina"/);
  assert.match(plantApp, /icon\('trash-2'\)/);
});

test('legacy preview bundles are regenerated with the current icon contract', () => {
  const brief = inferProductBrief('VerdeVivo', 'app per curare piante');
  const legacyFiles = generateAgenticApplication(brief).map((file) => file.path === 'public/index.html'
    ? { ...file, content: file.content.replaceAll('data-icon-system="lucide-v1"', '') }
    : file);
  const legacy = { productBrief: brief, files: legacyFiles };
  const refreshed = refreshPreviewBundle(legacy, {
    name: 'VerdeVivo',
    description: 'app per curare piante',
  });
  const html = refreshed.files.find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.notEqual(refreshed, legacy);
  assert.match(html, /data-icon-system="lucide-v1"/);
  assert.match(html, /<use href="#i-sprout"/);
});

test('saved application previews are upgraded to the smartphone navigation contract', () => {
  const brief = inferProductBrief('CineMagic', 'app per film e cartoni Disney');
  const staleFiles = generateAgenticApplication(brief).map((file) =>
    file.path === 'public/index.html'
      ? { ...file, content: file.content.replace('class="mobile-tabbar"', 'class="legacy-tabs"') }
      : file,
  );
  const stale = { productBrief: brief, files: staleFiles };
  const refreshed = refreshPreviewBundle(stale, {
    name: 'CineMagic',
    description: 'app per film e cartoni Disney',
  });
  const html = refreshed.files.find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.notEqual(refreshed, stale);
  assert.match(html, /class="shell mobile-app/);
  assert.match(html, /class="mobile-tabbar"/);
});

test('saved previews are regenerated for the corrected mobile interaction contract', () => {
  const brief = inferProductBrief('Agenda', 'app mobile per prenotazioni e appuntamenti');
  const staleFiles = generateAgenticApplication(brief).map((file) =>
    file.path === 'public/index.html'
      ? { ...file, content: file.content.replace('data-fenix-ui="native-mobile-v3"', 'data-fenix-ui="native-mobile-v2"') }
      : file,
  );
  const stale = { productBrief: brief, files: staleFiles };
  const refreshed = refreshPreviewBundle(stale, {
    name: 'Agenda',
    description: 'app mobile per prenotazioni e appuntamenti',
  });
  const html = refreshed.files.find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.notEqual(refreshed, stale);
  assert.match(html, /data-fenix-ui="native-mobile-v3"/);
});

test('existing generic preview bundles are upgraded from the project request', () => {
  const generic = inferProductBrief('Nuovo progetto', 'Applicazione generica');
  const bundle = { productBrief: generic, files: generateAgenticApplication(generic) };
  const refreshed = refreshPreviewBundle(bundle, {
    name: 'mi crei un app di piante',
    description: 'Applicazione full-stack: mi crei un app di piante',
  });
  const html = refreshed.files.find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.equal(refreshed.productBrief.appType, 'plants');
  assert.equal(refreshed.productBrief.entity.fields[0]?.key, 'name');
  assert.match(html, /Le mie piante/);
  assert.doesNotMatch(html, /Alpha/);
});

test('existing generic entertainment previews are upgraded from the original project request', () => {
  const generic = inferProductBrief('Nuovo progetto', 'Applicazione generica');
  const bundle = { productBrief: generic, files: generateAgenticApplication(generic) };
  const refreshed = refreshPreviewBundle(bundle, {
    name: 'mi crei un app per sapere tutti i film e Cartoni Disney',
    description: 'Applicazione full-stack: film e cartoni Disney',
  });
  const html = refreshed.files.find((file) => file.path === 'public/index.html')?.content ?? '';
  assert.equal(refreshed.productBrief.appType, 'entertainment');
  assert.match(html, /Catalogo film e cartoni/);
  assert.match(html, /CineMagic/);
  assert.doesNotMatch(html, /Alpha|Orione|Nova|Atlas/);
});
