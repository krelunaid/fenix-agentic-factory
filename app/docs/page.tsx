import Link from "next/link";

const modes = [
  ["Preview", "Usa immediatamente il prodotto generato, senza lasciare FENIX."],
  ["Codice", "Controlla i file reali prodotti dal team di agenti."],
  ["Test", "Consulta le verifiche eseguite da QA e Security Agent."],
  ["Desktop e mobile", "Prova l’interfaccia nelle due dimensioni principali."],
  ["Revisioni", "Scrivi una modifica: gli agenti generano e verificano una nuova versione."],
];

export default function Documentation() {
  return (
    <main className="docs-shell">
      <header>
        <div className="brand-mark">F</div>
        <div>
          <span className="eyebrow">FENIX / DOCUMENTAZIONE</span>
          <h1>Dal brief a un’app funzionante.</h1>
          <p>Scrivi ciò che vuoi, segui gli agenti e prova il risultato.</p>
        </div>
        <Link className="button secondary" href="/">
          Torna a FENIX
        </Link>
      </header>
      <section>
        <h2>Cosa costruisce oggi</h2>
        <p>
          Puoi scegliere applicazione, sito web o prototipo. Il progetto viene analizzato dal Product Architect,
          progettato da UX Director e Software Architect e costruito da agenti frontend,
          backend e dati. Le applicazioni includono interfaccia specifica per il
          dominio, API autenticate, ruoli, SQLite, CRUD, ricerca e metriche. I
          siti hanno una struttura pubblica distinta e un modulo contatti
          persistente. In entrambi i casi FENIX salva codice, attività degli
          agenti, test e una preview permanente servita direttamente da FENIX.
        </p>
        <p>
          <strong>Confine della beta:</strong> GitHub OAuth, deploy su provider
          esterno, domini, app Expo native, pagamenti e MCP remoto richiedono
          ancora una connessione o un builder dedicato e non vengono dichiarati
          completati automaticamente.
        </p>
      </section>
      <section>
        <h2>Flusso di creazione</h2>
        <ol>
          <li>
            Scegli il tipo, descrivi il prodotto e premi <strong>Costruisci</strong>.
          </li>
          <li>FENIX genera e valida un Product Brief strutturato.</li>
          <li>Gli agenti producono codice full-stack in un sandbox isolato.</li>
          <li>
            Il QA esegue controlli statici, login, database, lettura, creazione,
            HTTP, visuale e accessibilità.
          </li>
          <li>
            Solo dopo i gate viene resa disponibile la preview verificata e uno
            snapshot recuperabile.
          </li>
        </ol>
      </section>
      <section>
        <h2>Modificare ciò che vedi</h2>
        <ol>
          <li>Prova il risultato direttamente nella scheda Preview.</li>
          <li>
            Scrivi la modifica nella chat, per esempio “rendi la home più
            minimale”.
          </li>
          <li>FENIX aggiorna il brief e avvia una nuova build tracciata.</li>
          <li>
            Il team rigenera codice, test e preview senza perdere il progetto.
          </li>
        </ol>
      </section>
      <section>
        <h2>Modalità</h2>
        <div className="docs-grid">
          {modes.map(([title, text]) => (
            <article key={title}>
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2>Gate di sicurezza</h2>
        <p>
          Freeze, file protetti, precondizioni hash, autenticazione,
          autorizzazione, quality evidence, approvazioni e rollback sono
          applicati dal server. Un pulsante non può aggirare queste policy.
        </p>
      </section>
    </main>
  );
}
