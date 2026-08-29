import type { GeneratedFile, ProductBrief } from './agentic-generator';

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
    .replaceAll("fetch(path,{headers", "fetch(path,{credentials:'include',headers")
    .replaceAll(
      `fetch('${endpoint}&api=contact',{`,
      `fetch('${endpoint}&api=contact',{credentials:'include',`,
    );
  return html
    .replace(/<link[^>]+href=["']\/styles\.css["'][^>]*>/i, '')
    .replace(/<script[^>]+src=["']\/app\.js["'][^>]*><\/script>/i, '')
    .replace('</head>', `<style>${escapeInline(css, 'style')}</style></head>`)
    .replace('</body>', `<script type="module">${escapeInline(javascript, 'script')}</script></body>`);
}
