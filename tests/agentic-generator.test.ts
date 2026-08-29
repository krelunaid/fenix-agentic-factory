import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { generateAgenticApplication, inferProductBrief } from '../lib/build-plane/agentic-generator';

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
    assert.notEqual(crmHtml, bookingHtml);
    for (const result of [crm, booking]) {
      const paths = new Set(result.files.map((file) => file.path));
      assert.deepEqual(['server.mjs', 'public/index.html', 'public/app.js', 'scripts/scenario.mjs', 'fenix.product-brief.json'].every((path) => paths.has(path)), true);
    }
  } finally {
    await Promise.all([rm(crm.directory, { recursive: true, force: true }), rm(booking.directory, { recursive: true, force: true })]);
  }
});

test('generated application passes auth, database, list and create scenario', async () => {
  const generated = await materialize('Inventario di magazzino per risorse, quantità e responsabili');
  try {
    for (const mode of ['typecheck', 'lint', 'unit', 'build']) await runQuality(generated.directory, mode);
    const output = await runScenario(generated.directory);
    assert.match(output, /"status":"passed"/);
    assert.match(output, /"auth"/);
    assert.match(output, /"create"/);
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
