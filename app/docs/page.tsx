import Link from 'next/link';

const modes = [
  ['Build', 'Chat, preview, inspector e task dock per il lavoro quotidiano.'],
  ['Focus Preview', 'Nasconde i pannelli e dedica lo spazio al prodotto.'],
  ['Visual Edit', 'Attiva il bridge nella preview, ispeziona un selector, apre il file mappato e applica patch con recovery point.'],
  ['Debug', 'Apre Quality e Console con eventi reali del Control Plane.'],
  ['Compare', 'Affianca la preview corrente all’ultima baseline evidence disponibile.'],
  ['Mobile Studio', 'Passa al viewport mobile grande e mantiene l’Inspector raggiungibile.'],
];

export default function Documentation() {
  return <main className="docs-shell"><header><div className="brand-mark">F</div><div><span className="eyebrow">FENIX / DOCUMENTAZIONE</span><h1>Costruire, verificare, pubblicare.</h1><p>Guida operativa del workspace visuale.</p></div><Link className="button secondary" href="/">Torna a FENIX</Link></header><section><h2>Flusso Visual Edit</h2><ol><li>Apri un progetto con preview live e scegli <strong>Visual Edit</strong>.</li><li>Clicca un elemento nella preview oppure inserisci un selector CSS.</li><li>Conferma <strong>Ispeziona elemento</strong>: FENIX salva screenshot, mapping e scope.</li><li>Se il source mapping è valido, modifica il file nel patch editor.</li><li>Applica la patch. Ogni modifica idonea crea una recovery point persistente.</li><li>Usa <strong>Undo</strong> per ripristinare file e repository index.</li></ol></section><section><h2>Modalità</h2><div className="docs-grid">{modes.map(([title,text])=><article key={title}><strong>{title}</strong><p>{text}</p></article>)}</div></section><section><h2>Gate di sicurezza</h2><p>Freeze, file protetti, precondizioni hash, quality evidence, approvazioni e rollback sono applicati dal server. Un pulsante non può aggirare queste policy.</p></section></main>;
}
