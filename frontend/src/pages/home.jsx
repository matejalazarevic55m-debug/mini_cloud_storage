import { useState } from "react";
import "./home.css";

export default function Home({naLogin}) {
  const [prikaziPomoc, setPrikaziPomoc] = useState(false);

  const togglePomoc = () => {
    setPrikaziPomoc(!prikaziPomoc);
  };

  return (
    <main className="home-container">
      {/* Dugme u gornjem desnom uglu */}
      <div className="help-container" onClick={togglePomoc}>
        <button className="help-button" type="button">
          Pomoć
        </button>

        <div className="help-tooltip">
          <p className="tooltip-title">Potrebna pomoć?</p>
          <p className="tooltip-text">
            Klikni za detaljan vodič i uputstva o aplikaciji Storio.
          </p>
        </div>
      </div>

      {/* GLAVNI EKRAN SA VIDEOM */}
      <section className="content-wrapper">
        <h1 className="main-logo-title">Storio</h1>

        <video className="intro-video" autoPlay loop muted playsInline>
          <source src="/storio_intro2.mp4?v=3" type="video/mp4" />
          Tvoj pregledač ne podržava video.
        </video>

        <button className="login-button" type="button" onClick = {naLogin}> 
          Uloguj se
        </button>

        <p className="footer-text">
          Tvoji fajlovi, na jednom mestu. Bezbedno, brzo i jednostavno.
        </p>
      </section>

      {/* PANEL ZA POMOĆ */}
      <div
        className={`side-help-panel ${prikaziPomoc ? "open" : ""}`}
      >
        <button
          className="close-panel-button"
          type="button"
          onClick={togglePomoc}
        >
          &times;
        </button>

        <div className="side-help-content">
          <h2>Kako Storio funkcioniše?</h2>

          <p>
            Storio ti omogućava da bezbedno skladištiš svoje podatke u oblaku,
            organizuješ ih u foldere i deliš sa prijateljima u samo nekoliko
            klikova.
          </p>
        </div>
      </div>
    </main>
  );
}