export function App() {
  return <main id="app" data-fenix-source="src/App.tsx:2">
    <header><div><p className="eyebrow">Built with FENIX</p><h1>{{projectName}}</h1><p className="lede">{{projectDescription}}</p></div><span className="status">Operativo</span></header>
    <section className="metrics" aria-label="Metriche operative">
      <article><span>Disponibilità</span><strong>99,98%</strong><small>+0,12% questa settimana</small></article>
      <article><span>Automazioni</span><strong>128</strong><small>14 completate oggi</small></article>
      <article><span>Tempo medio</span><strong>1m 42s</strong><small>−18s rispetto a ieri</small></article>
    </section>
    <section className="activity"><div><p className="eyebrow">Attività recente</p><h2>Pipeline sotto controllo</h2></div><ul><li><span className="dot"/>Build di produzione verificata <time>2 min</time></li><li><span className="dot"/>Controlli qualità superati <time>8 min</time></li><li><span className="dot"/>Snapshot di recupero creato <time>14 min</time></li></ul></section>
  </main>;
}
