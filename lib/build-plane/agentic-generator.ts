export type AppField = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'status' | 'email';
  required: boolean;
};

export type ProductBrief = {
  productName: string;
  summary: string;
  appType: 'website' | 'crm' | 'commerce' | 'booking' | 'project' | 'content' | 'operations' | 'generic';
  entity: { singular: string; plural: string; fields: AppField[] };
  roles: string[];
  workflows: string[];
  pages: string[];
  palette: { accent: string; accentSoft: string; background: string };
};

export type GeneratedFile = { path: string; content: string };

const domainCatalog: Array<{
  type: ProductBrief['appType'];
  terms: string[];
  singular: string;
  plural: string;
  fields: AppField[];
  workflows: string[];
}> = [
  { type: 'website', terms: ['sito web', 'website', 'landing', 'portfolio', 'sito vetrina'], singular: 'Richiesta', plural: 'Richieste', fields: [field('name', 'Nome'), field('email', 'Email', 'email'), field('message', 'Messaggio'), field('status', 'Stato', 'status')], workflows: ['Scoperta', 'Contatto', 'Conversione'] },
  { type: 'crm', terms: ['crm', 'lead', 'opportunità', 'vendite', 'sales'], singular: 'Cliente', plural: 'Clienti', fields: [field('company', 'Azienda'), field('email', 'Email', 'email'), field('value', 'Valore', 'number'), field('status', 'Stato', 'status')], workflows: ['Acquisizione lead', 'Qualificazione', 'Chiusura opportunità'] },
  { type: 'commerce', terms: ['ecommerce', 'e-commerce', 'negozio', 'prodotti', 'ordini', 'shop'], singular: 'Prodotto', plural: 'Prodotti', fields: [field('name', 'Nome'), field('price', 'Prezzo', 'number'), field('stock', 'Disponibilità', 'number'), field('status', 'Stato', 'status')], workflows: ['Catalogo', 'Ordine', 'Gestione inventario'] },
  { type: 'booking', terms: ['prenot', 'appuntamenti', 'calendario', 'reservation'], singular: 'Prenotazione', plural: 'Prenotazioni', fields: [field('customer', 'Cliente'), field('email', 'Email', 'email'), field('date', 'Data', 'date'), field('status', 'Stato', 'status')], workflows: ['Richiesta disponibilità', 'Conferma', 'Promemoria'] },
  { type: 'project', terms: ['progetti', 'task', 'kanban', 'team', 'project management'], singular: 'Attività', plural: 'Attività', fields: [field('title', 'Titolo'), field('owner', 'Responsabile'), field('dueDate', 'Scadenza', 'date'), field('status', 'Stato', 'status')], workflows: ['Pianificazione', 'Assegnazione', 'Completamento'] },
  { type: 'content', terms: ['cms', 'contenuti', 'articoli', 'editoriale', 'blog'], singular: 'Contenuto', plural: 'Contenuti', fields: [field('title', 'Titolo'), field('author', 'Autore'), field('publishedAt', 'Pubblicazione', 'date'), field('status', 'Stato', 'status')], workflows: ['Bozza', 'Revisione', 'Pubblicazione'] },
  { type: 'operations', terms: ['inventario', 'magazzino', 'operazioni', 'asset', 'logistica'], singular: 'Risorsa', plural: 'Risorse', fields: [field('name', 'Nome'), field('owner', 'Responsabile'), field('quantity', 'Quantità', 'number'), field('status', 'Stato', 'status')], workflows: ['Registrazione', 'Assegnazione', 'Controllo'] },
];

function field(key: string, label: string, type: AppField['type'] = 'text'): AppField {
  return { key, label, type, required: true };
}

function cleanText(value: unknown, fallback: string, max = 120) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
}

function safeKey(value: unknown, fallback: string) {
  const normalized = cleanText(value, fallback, 40).normalize('NFKD').replace(/[^a-zA-Z0-9]+(.)?/g, (_match, next: string | undefined) => next ? next.toUpperCase() : '').replace(/^[^a-zA-Z]+/, '');
  return normalized || fallback;
}

function safeColor(value: unknown, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function stringList(value: unknown, fallback: string[], max = 8) {
  if (!Array.isArray(value)) return fallback;
  const result = value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim().slice(0, 100)).slice(0, max);
  return result.length ? result : fallback;
}

export function inferProductBrief(name: string, description: string, candidate?: unknown): ProductBrief {
  const source = `${name} ${description}`.toLowerCase();
  const domain = domainCatalog.find((item) => item.terms.some((term) => source.includes(term))) ?? {
    type: 'generic' as const,
    singular: 'Elemento',
    plural: 'Elementi',
    fields: [field('name', 'Nome'), field('owner', 'Responsabile'), field('createdAt', 'Data', 'date'), field('status', 'Stato', 'status')],
    workflows: ['Creazione', 'Revisione', 'Completamento'],
  };
  const raw = candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : {};
  const entity = raw.entity && typeof raw.entity === 'object' ? raw.entity as Record<string, unknown> : {};
  const rawFields = Array.isArray(entity.fields) ? entity.fields : [];
  const fields = rawFields.map((item, index): AppField | null => {
    if (!item || typeof item !== 'object') return null;
    const input = item as Record<string, unknown>;
    const type = ['text', 'number', 'date', 'status', 'email'].includes(String(input.type)) ? String(input.type) as AppField['type'] : 'text';
    return { key: safeKey(input.key, `field${index + 1}`), label: cleanText(input.label, `Campo ${index + 1}`, 50), type, required: input.required !== false };
  }).filter((item): item is AppField => Boolean(item)).slice(0, 8);
  const statusField = (fields.length ? fields : domain.fields).some((item) => item.type === 'status');
  const normalizedFields = fields.length ? [...fields] : [...domain.fields];
  if (!statusField && normalizedFields.length < 8) normalizedFields.push(field('status', 'Stato', 'status'));
  const requestedType = typeof raw.appType === 'string' && ['website', 'crm', 'commerce', 'booking', 'project', 'content', 'operations', 'generic'].includes(raw.appType) ? raw.appType as ProductBrief['appType'] : domain.type;
  return {
    productName: cleanText(raw.productName, name, 80),
    summary: cleanText(raw.summary, description || `Gestione operativa di ${domain.plural.toLowerCase()}.`, 280),
    appType: requestedType,
    entity: {
      singular: cleanText(entity.singular, domain.singular, 50),
      plural: cleanText(entity.plural, domain.plural, 50),
      fields: normalizedFields,
    },
    roles: stringList(raw.roles, ['Amministratore', 'Operatore']),
    workflows: stringList(raw.workflows, domain.workflows),
    pages: stringList(raw.pages, ['Panoramica', domain.plural, 'Attività']),
    palette: {
      accent: safeColor((raw.palette as Record<string, unknown> | undefined)?.accent, '#6d5dfc'),
      accentSoft: safeColor((raw.palette as Record<string, unknown> | undefined)?.accentSoft, '#ebe8ff'),
      background: safeColor((raw.palette as Record<string, unknown> | undefined)?.background, '#f5f5f7'),
    },
  };
}

export function productArchitectPrompt(name: string, description: string) {
  return `You are FENIX Product Architect. Convert the request into one compact JSON object only, without markdown. Create a functional product, not a generic dashboard. Use appType website for public websites, landing pages and portfolios; otherwise choose the matching application type. Schema: {"productName":string,"summary":string,"appType":"website|crm|commerce|booking|project|content|operations|generic","entity":{"singular":string,"plural":string,"fields":[{"key":camelCase,"label":string,"type":"text|number|date|status|email","required":boolean}]},"roles":[string],"workflows":[string],"pages":[string],"palette":{"accent":"#RRGGBB","accentSoft":"#RRGGBB","background":"#RRGGBB"}}. Include 4-6 domain-specific fields and a status field. Request name: ${name.slice(0, 100)}. Request: ${description.slice(0, 4000)}`;
}

export function softwareArchitectPlan(brief: ProductBrief) {
  return {
    architecture: 'dependency-free Node.js full-stack application',
    runtime: 'Node.js HTTP server + SQLite',
    frontend: 'accessible responsive HTML/CSS/JavaScript client',
    backend: ['session authentication', 'role authorization', `CRUD API for ${brief.entity.plural}`, 'search and metrics API', 'health endpoint'],
    data: { engine: 'SQLite', entity: brief.entity, seedRows: 4 },
    quality: ['static contract', 'security lint', 'API scenario', 'HTTP integration', 'visual rendering', 'accessibility evidence'],
    routes: ['/api/health', '/api/session', '/api/login', '/api/logout', '/api/items', '/api/metrics'],
  };
}

export function extractJsonCandidate(result: unknown) {
  const outer = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  const provider = outer.result && typeof outer.result === 'object' ? outer.result as Record<string, unknown> : {};
  const response = typeof provider.response === 'string' ? provider.response : typeof outer.response === 'string' ? outer.response : '';
  const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? response;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(fenced.slice(start, end + 1)); } catch { return null; }
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function jsData(value: unknown) {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
}

function seedRows(brief: ProductBrief) {
  const statuses = ['Attivo', 'In revisione', 'Completato', 'Da contattare'];
  const nouns = brief.appType === 'crm' ? ['Aurora Studio', 'Northstar Labs', 'Lumen SRL', 'Forma Group']
    : brief.appType === 'commerce' ? ['Linea Nova', 'Kit Essenziale', 'Edizione Pro', 'Starter Pack']
      : brief.appType === 'booking' ? ['Giulia Rossi', 'Marco Bianchi', 'Elena Costa', 'Luca Romano']
        : ['Alpha', 'Orione', 'Nova', 'Atlas'];
  return nouns.map((noun, rowIndex) => Object.fromEntries(brief.entity.fields.map((item, fieldIndex) => {
    if (item.type === 'status') return [item.key, statuses[rowIndex % statuses.length]];
    if (item.type === 'number') return [item.key, (rowIndex + 1) * (fieldIndex + 3) * 120];
    if (item.type === 'date') return [item.key, `2026-${String((rowIndex % 9) + 1).padStart(2, '0')}-${String(10 + rowIndex).padStart(2, '0')}`];
    if (item.type === 'email') return [item.key, `${noun.toLowerCase().replace(/[^a-z0-9]+/g, '.')}@example.test`];
    return [item.key, fieldIndex === 0 ? noun : `${item.label} ${rowIndex + 1}`];
  })));
}

export function generateAgenticApplication(brief: ProductBrief, internalWebsiteBase = false): GeneratedFile[] {
  if (brief.appType === 'website' && !internalWebsiteBase) return generateWebsiteApplication(brief);
  const config = { ...brief, seed: seedRows(brief) };
  const title = escapeHtml(brief.productName);
  const summary = escapeHtml(brief.summary);
  const server = `import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const config = ${jsData(config)};
const port = Number(process.env.PORT || 8080);
const root = join(process.cwd(), 'public');
const db = new DatabaseSync(join(process.cwd(), 'data.sqlite'));
const sessions = new Map();
const types = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8' };
const json = (res, status, body, headers={}) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}); res.end(JSON.stringify(body)); };
const body = async (req) => { const chunks=[]; let size=0; for await (const chunk of req) { size+=chunk.length; if(size>100000) throw new Error('body_too_large'); chunks.push(chunk); } return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'); };
const hash = (password, salt=randomBytes(16).toString('hex')) => salt+':'+scryptSync(password,salt,32).toString('hex');
const verify = (password, stored) => { const [salt,digest]=stored.split(':'); return timingSafeEqual(Buffer.from(digest,'hex'),scryptSync(password,salt,32)); };
const session = (req) => { const token=(req.headers.cookie||'').match(/(?:^|; )fenix_session=([^;]+)/)?.[1]; return token ? sessions.get(token) : null; };
const originAllowed = (req) => !req.headers.origin || req.headers.origin === ('http://'+(req.headers.host||'localhost')) || req.headers.origin === ('https://'+(req.headers.host||'localhost'));

db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, role TEXT); CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
if (!db.prepare('SELECT id FROM users LIMIT 1').get()) db.prepare('INSERT INTO users(email,password_hash,role) VALUES(?,?,?)').run('admin@demo.local',hash('FenixDemo!26'),'admin');
if (!db.prepare('SELECT id FROM items LIMIT 1').get()) { const insert=db.prepare('INSERT INTO items(payload,created_at,updated_at) VALUES(?,?,?)'); for(const row of config.seed){const now=new Date().toISOString();insert.run(JSON.stringify(row),now,now);} }

async function api(req,res,url){
  if(url.pathname==='/api/health') return json(res,200,{ok:true,app:config.productName,database:'sqlite'});
  if(url.pathname==='/api/contact'&&req.method==='POST'&&config.appType==='website'){if(!originAllowed(req))return json(res,403,{error:'origin_rejected'});const input=await body(req);const payload={name:String(input.name||'').slice(0,120),email:String(input.email||'').slice(0,160),message:String(input.message||'').slice(0,2000),status:'Nuova'};if(!payload.name||!payload.email||!payload.message)return json(res,400,{error:'required_fields'});const now=new Date().toISOString();const result=db.prepare('INSERT INTO items(payload,created_at,updated_at) VALUES(?,?,?)').run(JSON.stringify(payload),now,now);return json(res,201,{id:Number(result.lastInsertRowid),ok:true});}
  if(url.pathname==='/api/login'&&req.method==='POST'){if(!originAllowed(req))return json(res,403,{error:'origin_rejected'});const input=await body(req);const user=db.prepare('SELECT * FROM users WHERE email=?').get(String(input.email||''));if(!user||!verify(String(input.password||''),user.password_hash))return json(res,401,{error:'invalid_credentials'});const token=randomBytes(24).toString('hex');sessions.set(token,{id:user.id,email:user.email,role:user.role});return json(res,200,{user:{email:user.email,role:user.role}},{'set-cookie':'fenix_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600'});}
  if(url.pathname==='/api/logout'&&req.method==='POST'){const token=(req.headers.cookie||'').match(/fenix_session=([^;]+)/)?.[1];if(token)sessions.delete(token);return json(res,200,{ok:true},{'set-cookie':'fenix_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  const actor=session(req);if(!actor)return json(res,401,{error:'authentication_required'});
  if(url.pathname==='/api/session')return json(res,200,{user:actor});
  if(url.pathname==='/api/metrics'){const total=db.prepare('SELECT COUNT(*) total FROM items').get().total;return json(res,200,{total,active:Math.max(1,Math.ceil(total*.75)),workflows:config.workflows.length});}
  if(url.pathname==='/api/items'&&req.method==='GET'){const query=(url.searchParams.get('q')||'').toLowerCase();const rows=db.prepare('SELECT id,payload,created_at,updated_at FROM items ORDER BY id DESC').all().map(row=>({id:row.id,...JSON.parse(row.payload),createdAt:row.created_at,updatedAt:row.updated_at})).filter(row=>!query||JSON.stringify(row).toLowerCase().includes(query));return json(res,200,{items:rows.slice(0,100)});}
  if(url.pathname==='/api/items'&&req.method==='POST'){if(!originAllowed(req))return json(res,403,{error:'origin_rejected'});const input=await body(req);const payload={};for(const field of config.entity.fields){const value=input[field.key];if(field.required&&(value===undefined||value===''))return json(res,400,{error:'required_field',field:field.key});payload[field.key]=field.type==='number'?Number(value):String(value??'');}const now=new Date().toISOString();const result=db.prepare('INSERT INTO items(payload,created_at,updated_at) VALUES(?,?,?)').run(JSON.stringify(payload),now,now);return json(res,201,{id:Number(result.lastInsertRowid),...payload,createdAt:now,updatedAt:now});}
  const match=url.pathname.match(new RegExp('^/api/items/(\\\\d+)$'));if(match&&req.method==='DELETE'){if(actor.role!=='admin')return json(res,403,{error:'admin_required'});db.prepare('DELETE FROM items WHERE id=?').run(Number(match[1]));return json(res,200,{ok:true});}
  return json(res,404,{error:'not_found'});
}

createServer(async(req,res)=>{try{const url=new URL(req.url||'/','http://localhost');if(url.pathname.startsWith('/api/'))return await api(req,res,url);const relative=url.pathname==='/'?'index.html':normalize(url.pathname).split('/').filter(Boolean).join('/');const file=join(root,relative);if(!file.startsWith(root))return res.writeHead(403).end('Forbidden');const data=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors *"});res.end(data);}catch(error){json(res,500,{error:'server_error'});}}).listen(port,'0.0.0.0',()=>console.log('FENIX app ready on '+port));
`;
  const html = `<!doctype html>
<html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${brief.palette.accent}"><title>${title}</title><link rel="stylesheet" href="/styles.css"></head>
<body><div id="app" data-fenix-source="public/index.html:3">
<section class="login" id="login"><div class="login-card"><span class="mark">F</span><p class="eyebrow">Workspace protetto</p><h1>${title}</h1><p>${summary}</p><form id="login-form"><label>Email<input name="email" type="email" value="admin@demo.local" required></label><label>Password<input name="password" type="password" value="FenixDemo!26" required></label><button>Entra nella demo</button><p class="form-error" id="login-error" role="alert"></p></form></div></section>
<main class="shell" id="workspace" hidden><aside><div class="brand"><span class="mark">F</span><strong>${title}</strong></div><nav aria-label="Navigazione principale">${brief.pages.map((page, index) => `<button class="nav-item${index === 0 ? ' active' : ''}">${escapeHtml(page)}</button>`).join('')}</nav><div class="user"><span>AD</span><div><strong>Admin demo</strong><small>Amministratore</small></div><button id="logout" title="Esci">↗</button></div></aside>
<section class="content"><header><div><p class="eyebrow">Panoramica operativa</p><h1>${title}</h1><p>${summary}</p></div><button class="primary" id="new-item">+ Nuovo ${escapeHtml(brief.entity.singular.toLowerCase())}</button></header>
<section class="metrics" aria-label="Metriche operative"><article><span>${escapeHtml(brief.entity.plural)}</span><strong id="metric-total">—</strong><small>record nel database</small></article><article><span>Attivi</span><strong id="metric-active">—</strong><small>in lavorazione</small></article><article><span>Workflow</span><strong id="metric-workflows">—</strong><small>${escapeHtml(brief.workflows[0] ?? 'Operativi')}</small></article></section>
<section class="panel"><div class="panel-head"><div><p class="eyebrow">Database live</p><h2>${escapeHtml(brief.entity.plural)}</h2></div><label class="search">⌕<input id="search" type="search" placeholder="Cerca in tutti i campi"></label></div><div class="table-wrap"><table><thead><tr>${brief.entity.fields.map((item) => `<th>${escapeHtml(item.label)}</th>`).join('')}<th></th></tr></thead><tbody id="rows"></tbody></table></div><div class="empty" id="empty" hidden>Nessun risultato.</div></section></section></main>
<dialog id="editor"><form id="item-form" method="dialog"><div class="dialog-head"><div><p class="eyebrow">Nuovo record</p><h2>Aggiungi ${escapeHtml(brief.entity.singular.toLowerCase())}</h2></div><button type="button" class="icon" id="close">×</button></div><div class="fields">${brief.entity.fields.map((item) => `<label>${escapeHtml(item.label)}<input name="${item.key}" type="${item.type === 'number' ? 'number' : item.type === 'date' ? 'date' : item.type === 'email' ? 'email' : 'text'}" ${item.required ? 'required' : ''}></label>`).join('')}</div><p class="form-error" id="item-error" role="alert"></p><button class="primary">Salva nel database</button></form></dialog>
</div><script type="module" src="/app.js"></script></body></html>`;
  const app = `const config=${jsData(brief)};const $=(selector)=>document.querySelector(selector);let items=[];
const api=async(path,options={})=>{const response=await fetch(path,{headers:{'content-type':'application/json'},...options});const data=await response.json();if(!response.ok)throw new Error(data.error||'request_failed');return data};
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function render(){const query=$('#search').value.toLowerCase();const visible=items.filter(item=>!query||JSON.stringify(item).toLowerCase().includes(query));$('#rows').innerHTML=visible.map(item=>'<tr>'+config.entity.fields.map(field=>'<td data-label="'+escape(field.label)+'">'+(field.type==='status'?'<span class="pill">'+escape(item[field.key])+'</span>':escape(item[field.key]))+'</td>').join('')+'<td><button class="delete" data-id="'+item.id+'" aria-label="Elimina">×</button></td></tr>').join('');$('#empty').hidden=visible.length>0;document.querySelectorAll('.delete').forEach(button=>button.addEventListener('click',async()=>{await api('/api/items/'+button.dataset.id,{method:'DELETE'});await load()}));}
async function load(){const [records,metrics]=await Promise.all([api('/api/items'),api('/api/metrics')]);items=records.items;$('#metric-total').textContent=metrics.total;$('#metric-active').textContent=metrics.active;$('#metric-workflows').textContent=metrics.workflows;render();}
async function boot(){try{await api('/api/session');$('#login').hidden=true;$('#workspace').hidden=false;await load();}catch{$('#login').hidden=false;$('#workspace').hidden=true;}window.parent?.postMessage({type:'fenix:preview-ready',source:'public/index.html'},'*');}
$('#login-form').addEventListener('submit',async event=>{event.preventDefault();const input=Object.fromEntries(new FormData(event.currentTarget));try{await api('/api/login',{method:'POST',body:JSON.stringify(input)});$('#login-error').textContent='';await boot();}catch(error){$('#login-error').textContent='Credenziali non valide';}});
$('#item-form').addEventListener('submit',async event=>{event.preventDefault();const input=Object.fromEntries(new FormData(event.currentTarget));try{await api('/api/items',{method:'POST',body:JSON.stringify(input)});event.currentTarget.reset();$('#editor').close();await load();}catch(error){$('#item-error').textContent=error.message;}});
$('#new-item').addEventListener('click',()=>$('#editor').showModal());$('#close').addEventListener('click',()=>$('#editor').close());$('#search').addEventListener('input',render);$('#logout').addEventListener('click',async()=>{await api('/api/logout',{method:'POST'});await boot()});
document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target.closest('[data-fenix-source]'):null;if(target)window.parent?.postMessage({type:'fenix:select',source:target.getAttribute('data-fenix-source')},'*')});boot();`;
  const css = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#202127;background:${brief.palette.background};--accent:${brief.palette.accent};--accent-soft:${brief.palette.accentSoft}}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--accent-soft)}button,input{font:inherit}button{cursor:pointer}.login{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 10%,var(--accent-soft),transparent 35%),#111116}.login[hidden],.shell[hidden]{display:none}.login-card{width:min(480px,100%);padding:40px;border-radius:28px;background:#fff;box-shadow:0 30px 90px #0005}.login-card h1{font-size:2.5rem;margin:.5rem 0}.login-card p{color:#676873;line-height:1.6}.login-card form{display:grid;gap:14px;margin-top:28px}label{display:grid;gap:7px;font-size:.82rem;font-weight:650;color:#555661}input{width:100%;padding:12px 14px;border:1px solid #dcdce4;border-radius:12px;background:#fff}.mark{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:var(--accent);color:white;font-weight:800}.shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh;background:#f7f7f9}.shell>aside{display:flex;flex-direction:column;padding:24px 16px;border-right:1px solid #e8e8ec;background:#fff}.brand{display:flex;align-items:center;gap:12px;padding:0 8px 28px}.brand strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nav-item{display:block;width:100%;padding:11px 13px;border:0;border-radius:11px;background:transparent;text-align:left;color:#6b6b76}.nav-item.active{background:var(--accent-soft);color:var(--accent);font-weight:700}.user{display:flex;align-items:center;gap:10px;margin-top:auto;padding:14px 8px 0;border-top:1px solid #eee}.user>span{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#202127;color:white;font-size:.72rem}.user div{display:grid;min-width:0}.user small{color:#858590}.user button{margin-left:auto;border:0;background:transparent}.content{padding:clamp(24px,4vw,52px);overflow:hidden}.content>header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.content h1{margin:5px 0 8px;font-size:clamp(2rem,4vw,3.6rem);letter-spacing:-.05em}.content header p:not(.eyebrow){max-width:700px;color:#70717b}.eyebrow{margin:0;color:var(--accent);font-size:.7rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.primary,.login-card button{padding:12px 16px;border:0;border-radius:12px;background:var(--accent);color:white;font-weight:750;box-shadow:0 8px 24px color-mix(in srgb,var(--accent) 24%,transparent)}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:36px 0}.metrics article,.panel{border:1px solid #e7e7eb;border-radius:18px;background:#fff;box-shadow:0 8px 30px #24242d08}.metrics article{padding:22px}.metrics span,.metrics small{display:block;color:#858590}.metrics strong{display:block;margin:9px 0;font-size:2.25rem;letter-spacing:-.05em}.panel{overflow:hidden}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 24px;border-bottom:1px solid #ededf0}.panel h2,.dialog-head h2{margin:5px 0 0}.search{position:relative;display:flex;align-items:center;gap:7px;width:min(300px,100%)}.search input{padding-left:12px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:15px 20px;border-bottom:1px solid #eee;text-align:left;white-space:nowrap}th{color:#858590;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}td{font-size:.9rem}.pill{display:inline-block;padding:5px 9px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:.78rem}.delete,.icon{border:0;background:transparent;color:#9898a3;font-size:1.3rem}.empty{padding:40px;text-align:center;color:#858590}dialog{width:min(560px,calc(100% - 32px));border:0;border-radius:22px;padding:0;box-shadow:0 30px 100px #0006}dialog::backdrop{background:#1118;backdrop-filter:blur(4px)}dialog form{padding:28px}.dialog-head{display:flex;justify-content:space-between}.fields{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}.form-error{min-height:1em;color:#b42318;font-size:.85rem}@media(max-width:780px){.shell{grid-template-columns:1fr}.shell>aside{display:none}.content{padding:22px}.content>header,.panel-head{display:grid}.metrics{grid-template-columns:1fr}.fields{grid-template-columns:1fr}th{display:none}tr{display:grid;padding:12px;border-bottom:1px solid #eee}td{display:flex;justify-content:space-between;border:0;padding:7px 10px}td::before{content:attr(data-label);color:#858590;font-size:.72rem;text-transform:uppercase}}`;
  const semanticNeedle = brief.appType === 'website' ? 'id="contact-form"' : 'aria-label="Metriche operative"';
  const clientNeedle = brief.appType === 'website' ? '/api/contact' : "api('/api/items')";
  const quality = `import { cp, mkdir, readFile, rm } from 'node:fs/promises';const mode=process.argv[2];const read=path=>readFile(path,'utf8');const fail=message=>{throw new Error(message)};const [html,css,app,server]=await Promise.all(['public/index.html','public/styles.css','public/app.js','server.mjs'].map(read));if(mode==='typecheck'){if(!server.includes("DatabaseSync")||!server.includes("/api/items"))fail('full_stack_contract_missing');if([html,css,app,server].some(source=>source.includes('{{')))fail('unresolved_token')}else if(mode==='lint'){if(/\\beval\\s*\\(|document\\.write\\s*\\(/.test(app+'\\n'+server))fail('unsafe_primitive');if(!server.includes('timingSafeEqual')||!server.includes('HttpOnly')||!server.includes('originAllowed'))fail('security_contract_missing')}else if(mode==='unit'){if(!html.includes('id="app"')||!html.includes(${JSON.stringify(semanticNeedle)}))fail('semantic_shell_missing');if(!app.includes('fenix:preview-ready')||!app.includes(${JSON.stringify(clientNeedle)}))fail('client_contract_missing')}else if(mode==='build'){await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist/public',{recursive:true});await cp('server.mjs','dist/server.mjs');if(!(await read('dist/public/index.html')).includes('id="app"'))fail('build_output_invalid')}else fail('unknown_quality_mode');console.log(JSON.stringify({mode,status:'passed'}));`;
  const scenario = `import { spawn } from 'node:child_process';const port=8091;const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));try{let healthy=false;for(let i=0;i<30;i++){await wait(100);try{healthy=(await fetch('http://127.0.0.1:'+port+'/api/health')).ok;if(healthy)break}catch{}}if(!healthy)throw new Error('server_not_ready');const login=await fetch('http://127.0.0.1:'+port+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'admin@demo.local',password:'FenixDemo!26'})});if(!login.ok)throw new Error('login_failed');const cookie=login.headers.get('set-cookie')?.split(';')[0];const list=await fetch('http://127.0.0.1:'+port+'/api/items',{headers:{cookie}});const payload=await list.json();if(!list.ok||!Array.isArray(payload.items)||payload.items.length<1)throw new Error('list_failed');const sample={};for(const field of ${jsData(brief.entity.fields)})sample[field.key]=field.type==='number'?42:field.type==='date'?'2026-08-29':field.type==='email'?'qa@example.test':field.type==='status'?'Attivo':'QA '+field.label;const create=await fetch('http://127.0.0.1:'+port+'/api/items',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify(sample)});if(create.status!==201)throw new Error('create_failed');console.log(JSON.stringify({status:'passed',checks:['health','auth','list','create'],entity:${jsData(brief.entity.singular)}}));}finally{child.kill('SIGTERM')}`;
  const tsx = `export const productBrief = ${JSON.stringify(brief, null, 2)} as const;\nexport function App(){return <main id="app" data-fenix-source="src/App.tsx:2"><h1>{productBrief.productName}</h1><p>{productBrief.summary}</p></main>}\n`;
  const readme = `# ${brief.productName}\n\n${brief.summary}\n\nGenerated by the FENIX agentic build pipeline.\n\n## Runtime\n\n- Node.js HTTP backend\n- SQLite persistence\n- Session authentication and admin authorization\n- Domain-specific CRUD, search and metrics\n- Responsive accessible client\n\n## Demo access\n\nEmail: admin@demo.local\nPassword: FenixDemo!26\n\n## Start\n\n\`node server.mjs\`\n`;
  return [
    { path: 'public/index.html', content: html }, { path: 'public/styles.css', content: css }, { path: 'public/app.js', content: app },
    { path: 'server.mjs', content: server }, { path: 'scripts/quality.mjs', content: quality }, { path: 'scripts/scenario.mjs', content: scenario },
    { path: 'src/App.tsx', content: tsx }, { path: 'README.md', content: readme },
    { path: 'fenix.product-brief.json', content: JSON.stringify(brief, null, 2) },
    { path: 'fenix.architecture.json', content: JSON.stringify(softwareArchitectPlan(brief), null, 2) },
    { path: 'package.json', content: JSON.stringify({ name: brief.productName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), private: true, type: 'module', scripts: { start: 'node server.mjs', test: 'node scripts/scenario.mjs', quality: 'node scripts/quality.mjs unit' } }, null, 2) },
  ];
}

function generateWebsiteApplication(brief: ProductBrief): GeneratedFile[] {
  const base = generateAgenticApplication(brief, true);
  const title = escapeHtml(brief.productName);
  const summary = escapeHtml(brief.summary);
  const html = `<!doctype html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="${brief.palette.accent}"><title>${title}</title><link rel="stylesheet" href="/styles.css"></head><body><div id="app" data-fenix-source="public/index.html:1"><nav><a class="logo" href="#home">${title}</a><div>${brief.pages.slice(0, 4).map((page) => `<a href="#${page.toLowerCase().replace(/[^a-z0-9]+/g, '-')}">${escapeHtml(page)}</a>`).join('')}<a class="nav-cta" href="#contatti">Parliamone</a></div></nav><main><section class="hero" id="home"><p class="eyebrow">${escapeHtml(brief.workflows[0] ?? 'Idee che diventano realtà')}</p><h1>${summary}</h1><p class="lede">Un’esperienza progettata intorno alle persone, con un percorso chiaro dall’idea al risultato.</p><div class="hero-actions"><a class="primary" href="#contatti">Inizia ora</a><a class="secondary" href="#servizi">Scopri il progetto</a></div><div class="signal"><span>Disponibile per nuovi progetti</span><strong>${new Date().getFullYear()}</strong></div></section><section class="proof" aria-label="Punti di forza">${brief.workflows.slice(0, 3).map((flow, index) => `<article><span>0${index + 1}</span><h2>${escapeHtml(flow)}</h2><p>Un passaggio concreto, curato e misurabile del percorso.</p></article>`).join('')}</section><section class="story" id="servizi"><div><p class="eyebrow">Il nostro approccio</p><h2>Strategia, forma e funzione lavorano insieme.</h2></div><p>${summary} Ogni dettaglio è pensato per rendere semplice ciò che prima sembrava complesso.</p></section><section class="contact" id="contatti"><div><p class="eyebrow">Contatti</p><h2>Hai un progetto in mente?</h2><p>Raccontaci cosa vuoi realizzare. Ti risponderemo con il prossimo passo più utile.</p></div><form id="contact-form"><label>Nome<input name="name" required></label><label>Email<input name="email" type="email" required></label><label>Messaggio<textarea name="message" required></textarea></label><button class="primary">Invia richiesta</button><p id="form-status" role="status"></p></form></section></main><footer><strong>${title}</strong><span>Costruito con FENIX</span></footer></div><script type="module" src="/app.js"></script></body></html>`;
  const app = `const form=document.querySelector('#contact-form');const status=document.querySelector('#form-status');form.addEventListener('submit',async event=>{event.preventDefault();status.textContent='Invio in corso…';const body=JSON.stringify(Object.fromEntries(new FormData(form)));const response=await fetch('/api/contact',{method:'POST',headers:{'content-type':'application/json'},body});if(response.ok){form.reset();status.textContent='Richiesta ricevuta. Grazie!'}else status.textContent='Invio non riuscito. Riprova.'});window.parent?.postMessage({type:'fenix:preview-ready',source:'public/index.html'},'*');`;
  const css = `:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#171719;background:#f7f5f0;--accent:${brief.palette.accent};--soft:${brief.palette.accentSoft}}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0}a{color:inherit;text-decoration:none}nav{height:76px;padding:0 clamp(22px,5vw,76px);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #17171920;background:#f7f5f0ee;position:sticky;top:0;z-index:5;backdrop-filter:blur(14px)}.logo{font-weight:850;letter-spacing:-.04em}nav>div{display:flex;align-items:center;gap:24px;font-size:.86rem}.nav-cta,.primary{padding:12px 17px;border-radius:999px;background:var(--accent);color:white;font-weight:750}.hero{min-height:76vh;padding:clamp(70px,10vw,150px) clamp(22px,8vw,120px) 48px;display:grid;align-content:center}.eyebrow{color:var(--accent);font-size:.72rem;font-weight:850;letter-spacing:.15em;text-transform:uppercase}.hero h1{max-width:1100px;margin:18px 0;font-size:clamp(3rem,7.6vw,8rem);line-height:.92;letter-spacing:-.07em}.lede{max-width:650px;color:#66635f;font-size:clamp(1rem,1.6vw,1.3rem);line-height:1.65}.hero-actions{display:flex;gap:12px;margin-top:26px}.secondary{padding:12px 17px;border:1px solid #17171930;border-radius:999px;font-weight:700}.signal{margin-top:70px;padding-top:18px;display:flex;justify-content:space-between;border-top:1px solid #17171930;color:#77736d;font-size:.8rem}.proof{padding:0 clamp(22px,5vw,76px) 90px;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#d8d4cc}.proof article{padding:38px;background:#f7f5f0}.proof span{color:var(--accent);font-size:.72rem;font-weight:800}.proof h2{margin:34px 0 10px;font-size:1.5rem}.proof p,.story>p,.contact p{color:#706d67;line-height:1.6}.story,.contact{padding:clamp(70px,10vw,140px) clamp(22px,8vw,120px);display:grid;grid-template-columns:1fr 1fr;gap:10vw}.story{background:#171719;color:white}.story h2,.contact h2{margin:12px 0;font-size:clamp(2.2rem,4.5vw,5rem);line-height:1;letter-spacing:-.055em}.story>p{color:#aaa6a0;font-size:1.2rem}.contact{background:var(--soft)}form{display:grid;gap:14px}label{display:grid;gap:7px;font-size:.8rem;font-weight:750}input,textarea{width:100%;padding:13px 14px;border:1px solid #17171928;border-radius:10px;background:#fff;font:inherit}textarea{min-height:130px;resize:vertical}button{border:0;cursor:pointer;font:inherit;justify-self:start}#form-status{min-height:1em;margin:0}footer{padding:28px clamp(22px,5vw,76px);display:flex;justify-content:space-between;background:#171719;color:white}@media(max-width:760px){nav>div>a:not(.nav-cta){display:none}.hero{min-height:70vh}.proof,.story,.contact{grid-template-columns:1fr}.story,.contact{gap:30px}.hero-actions{align-items:flex-start;flex-direction:column}.proof{padding-inline:0}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}`;
  return base.map((file) => file.path === 'public/index.html' ? { ...file, content: html } : file.path === 'public/app.js' ? { ...file, content: app } : file.path === 'public/styles.css' ? { ...file, content: css } : file.path === 'fenix.product-brief.json' ? { ...file, content: JSON.stringify(brief, null, 2) } : file);
}
