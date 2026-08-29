import {
  generateAgenticApplication,
  inferProductBrief,
  type GeneratedFile,
  type ProductBrief,
} from './agentic-generator';

export type PreviewBundle = {
  files: GeneratedFile[];
  productBrief: ProductBrief;
};

function decodeBase64(value: string) {
  const binary = atob(value);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

export function decodePreviewBundle(base64: string): PreviewBundle {
  const payload = JSON.parse(decodeBase64(base64)) as Partial<PreviewBundle>;
  if (!Array.isArray(payload.files) || !payload.productBrief) {
    throw new Error('preview_bundle_invalid');
  }
  const files = payload.files.filter(
    (file): file is GeneratedFile =>
      Boolean(file) &&
      typeof file.path === 'string' &&
      typeof file.content === 'string',
  );
  if (!files.some((file) => file.path === 'public/index.html')) {
    throw new Error('preview_html_missing');
  }
  return { files, productBrief: payload.productBrief };
}

export function refreshPreviewBundle(
  bundle: PreviewBundle,
  project: { name: string; description: string },
) {
  const productBrief = inferProductBrief(
    project.name,
    project.description,
    bundle.productBrief,
  );
  const html = bundle.files.find((file) => file.path === 'public/index.html')?.content ?? '';
  const hasCurrentIconSystem = html.includes('data-icon-system="lucide-v1"');
  if (
    hasCurrentIconSystem &&
    JSON.stringify(productBrief) === JSON.stringify(bundle.productBrief)
  ) {
    return bundle;
  }
  return {
    productBrief,
    files: generateAgenticApplication(productBrief),
  } satisfies PreviewBundle;
}

function escapeInline(value: string, closingTag: 'script' | 'style') {
  return value.replace(new RegExp(`</${closingTag}`, 'gi'), `<\\/${closingTag}`);
}

export function buildDurablePreviewHtml(bundle: PreviewBundle, endpoint: string) {
  const html = bundle.files.find((file) => file.path === 'public/index.html')?.content;
  const css = bundle.files.find((file) => file.path === 'public/styles.css')?.content ?? '';
  const source = bundle.files.find((file) => file.path === 'public/app.js')?.content ?? '';
  if (!html) throw new Error('preview_html_missing');
  const replacements: Array<[string, string]> = [
    ["'/api/session'", `'${endpoint}&api=session'`],
    ["'/api/metrics'", `'${endpoint}&api=metrics'`],
    ["'/api/contact'", `'${endpoint}&api=contact'`],
    ["'/api/items/'", `'${endpoint}&api=items&id='`],
    ["'/api/items'", `'${endpoint}&api=items'`],
  ];
  const javascript = replacements.reduce(
    (result, [needle, replacement]) => result.replaceAll(needle, replacement),
    source,
  )
    .replaceAll('fetch(', 'window.fenixPreviewFetch(');
  const bridge = `<script>${escapeInline(`(()=>{let sequence=0;const pending=new Map();window.fenixPreviewFetch=(path,options={})=>{if(window.parent===window)return window.fetch(path,{credentials:'include',...options});return new Promise((resolve,reject)=>{const requestId='preview-'+Date.now()+'-'+(++sequence);const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('preview_bridge_timeout'))},15000);pending.set(requestId,{resolve,reject,timer});window.parent.postMessage({type:'fenix:preview-request',requestId,path:String(path),method:String(options.method||'GET'),body:typeof options.body==='string'?options.body:null},'*')})};window.addEventListener('message',event=>{if(event.source!==window.parent||!event.data||event.data.type!=='fenix:preview-response')return;const entry=pending.get(event.data.requestId);if(!entry)return;clearTimeout(entry.timer);pending.delete(event.data.requestId);entry.resolve(new Response(String(event.data.body||''),{status:Number(event.data.status)||500,headers:{'content-type':'application/json'}}))})})();`, 'script')}</script>`;
  return html
    .replace(/<link[^>]+href=["']\/styles\.css["'][^>]*>/i, '')
    .replace(/<script[^>]+src=["']\/app\.js["'][^>]*><\/script>/i, '')
    .replace('</head>', `<style>${escapeInline(css, 'style')}</style></head>`)
    .replace('</body>', `${bridge}<script type="module">${escapeInline(javascript, 'script')}</script></body>`);
}
