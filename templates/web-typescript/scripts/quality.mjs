import { cp, mkdir, readFile, rm } from 'node:fs/promises';

const mode = process.argv[2];
const read = (path) => readFile(path, 'utf8');
const fail = (message) => { throw new Error(message); };
const html = await read('public/index.html');
const css = await read('public/styles.css');
const app = await read('public/app.js');
const tsx = await read('src/App.tsx');

if (mode === 'typecheck') {
  if (!tsx.includes('export function App()') || !tsx.includes('data-fenix-source')) fail('source_contract_invalid');
  if ([html, css, app, tsx].some((source) => source.includes('{{'))) fail('unresolved_template_token');
} else if (mode === 'lint') {
  if (/\beval\s*\(|document\.write\s*\(/.test(`${app}\n${tsx}`)) fail('unsafe_browser_primitive');
  if (!html.startsWith('<!doctype html>') || !css.includes('@media')) fail('web_contract_invalid');
} else if (mode === 'unit') {
  if (!html.includes('id="app"') || !html.includes('aria-label="Metriche operative"')) fail('semantic_shell_missing');
  if (!app.includes('fenix:preview-ready') || !app.includes('fenix:select')) fail('preview_bridge_missing');
} else if (mode === 'build') {
  await rm('dist', { recursive: true, force: true });
  await mkdir('dist', { recursive: true });
  await cp('public', 'dist', { recursive: true });
  if (!(await read('dist/index.html')).includes('id="app"')) fail('build_output_invalid');
} else fail('unknown_quality_mode');

console.log(JSON.stringify({ mode, status: 'passed' }));
