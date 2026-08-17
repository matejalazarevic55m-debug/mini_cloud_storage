import { useState } from "react";
import "./home.css";

export default function Home({ naLogin }) {
  const [prikaziPomoc, setPrikaziPomoc] = useState(false);

  const togglePomoc = () => {
    setPrikaziPomoc((prev) => !prev);
  };

  return (
    <main className="home-container">
      {/* Dekorativna animirana pozadina */}
      <div className="home-background" aria-hidden="true">
        <div className="home-orb orb-one"></div>
        <div className="home-orb orb-two"></div>
        <div className="home-orb orb-three"></div>
        <div className="home-grid"></div>
      </div>

      {/* HEADER */}
      <header className="home-header">
        <div className="home-brand">
          <span className="home-brand-mark">S</span>
          <span className="home-brand-name">Storio</span>
        </div>

        <button
          className="help-button"
          type="button"
          onClick={togglePomoc}
        >
          Pomoć
        </button>
      </header>

      {/* HERO */}
      <section className="home-hero">
        <div className="hero-badge">
          <span className="hero-badge-dot"></span>
          Privatni cloud storage
        </div>

        <h1 className="hero-title">
          Tvoji fajlovi.
          <span> Na jednom mestu.</span>
        </h1>

        <p className="hero-description">
          Bezbedno čuvaj, organizuj i deli svoje fajlove.
          Storio ti pruža jednostavan pristup tvojim podacima
          gde god da se nalaziš.
        </p>

        <div className="hero-actions">
          <button
            className="login-button"
            type="button"
            onClick={naLogin}
          >
            Uloguj se
            <span className="login-arrow">→</span>
          </button>
        </div>

        <div className="home-features">
          <article className="feature-card">
            <div className="feature-icon">
              <span>☁</span>
            </div>

            <div>
              <h3>Čuvanje u oblaku</h3>
              <p>Pristupi svojim fajlovima sa bilo kog uređaja.</p>
            </div>
          </article>

          <article className="feature-card">
            <div className="feature-icon">
              <span>✓</span>
            </div>

            <div>
              <h3>Bezbedan pristup</h3>
              <p>Tvoji podaci dostupni su samo autorizovanim korisnicima.</p>
            </div>
          </article>

          <article className="feature-card">
            <div className="feature-icon">
              <span>↗</span>
            </div>

            <div>
              <h3>Jednostavno deljenje</h3>
              <p>Podeli fajlove sa drugim korisnicima u nekoliko klikova.</p>
            </div>
          </article>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="home-footer">
        <span>Storio</span>
        <span className="footer-separator">•</span>
        <span>Private Cloud Storage</span>
      </footer>

      {/* HELP OVERLAY */}
      <div
        className={`help-overlay ${prikaziPomoc ? "open" : ""}`}
        onClick={togglePomoc}
      ></div>

      {/* HELP PANEL */}
      <aside
        className={`side-help-panel ${prikaziPomoc ? "open" : ""}`}
      >
        <button
          className="close-panel-button"
          type="button"
          onClick={togglePomoc}
          aria-label="Zatvori pomoć"
        >
          ×
        </button>

        <div className="side-help-content">
          <span className="help-kicker">STORIO POMOĆ</span>

          <h2>Kako Storio funkcioniše?</h2>

          <p>
            Storio ti omogućava da svoje fajlove čuvaš na jednom mestu
            i pristupaš im sa različitih uređaja.
          </p>

          <div className="help-item">
            <span>01</span>
            <div>
              <strong>Otpremi fajlove</strong>
              <p>Dodaj dokumente, slike, arhive i druge fajlove.</p>
            </div>
          </div>

          <div className="help-item">
            <span>02</span>
            <div>
              <strong>Organizuj sadržaj</strong>
              <p>Kreiraj foldere i organizuj svoje podatke.</p>
            </div>
          </div>

          <div className="help-item">
            <span>03</span>
            <div>
              <strong>Podeli sa drugima</strong>
              <p>Bezbedno deli fajlove sa drugim Storio korisnicima.</p>
            </div>
          </div>
        </div>
      </aside>
    </main>
  );
}