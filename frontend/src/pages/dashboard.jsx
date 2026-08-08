import { useState } from "react";
import "./dashboard.css";

export default function Dashboard({ naOdjavu }) {
  // Postavljamo foldere u stanje da bismo mogli dinamički da dodajemo nove
  const [folderi, setFolderi] = useState([
    { id: 1, ime: "Dokumenti" },
    { id: 2, ime: "Slike sa mora" },
    { id: 3, ime: "Projekat Faks" },
  ]);

  const [fajlovi, setFajlovi] = useState([
    { id: 1, ime: "biografija.pdf", velicina: "1.2 MB" },
    { id: 2, ime: "baza_podataka.sql", velicina: "450 KB" },
    { id: 3, ime: "logo_storio.png", velicina: "2.1 MB" },
  ]);

  // Stanja za kontrolu iskacuceg prozora (modala)
  const [prikaziModal, setPrikaziModal] = useState(false);
  const [novoImeFoldera, setNovoImeFoldera] = useState("");

  // Funkcija koja kreira novi folder i dodaje ga na ekran
  const kreirajFolder = (e) => {
    e.preventDefault();
    if (!novoImeFoldera.trim()) return; // Ako je prazno, ne radi nista

    const noviFolder = {
      id: Date.now(), // Generisemo privremeni unikatni ID
      ime: novoImeFoldera,
    };

    setFolderi([...folderi, noviFolder]); // Dodajemo novi folder u postojecu listu
    setNovoImeFoldera(""); // Resetujemo input polje
    setPrikaziModal(false); // Zatvaramo prozorcic
  };

  return (
    <div className="dashboard-container">
      {/* 1. Bočni meni (Sidebar) */}
      <aside className="dash-sidebar">
        <div className="dash-logo">Storio</div>
        
        {/* Klikom na ovo dugme palimo prozorcic */}
        <button className="new-upload-btn" onClick={() => setPrikaziModal(true)}>
          <span className="plus-icon">+</span> Novo
        </button>

        <nav className="dash-nav">
          <a href="#" className="nav-item active">📁 Moj Disk</a>
          <a href="#" className="nav-item">👥 Deljeno sa mnom</a>
          <a href="#" className="nav-item">⭐ Zvezdice</a>
          <a href="#" className="nav-item">🗑️ Otpad</a>
        </nav>

        <button className="logout-btn" onClick={naOdjavu}>
          Odjavi se
        </button>
      </aside>

      {/* 2. Glavni sadržaj */}
      <main className="dash-main-content">
        <header className="dash-header">
          <input type="text" placeholder="Pretraži fajlove i foldere..." className="search-bar" />
          <div className="user-profile">M</div>
        </header>

        <div className="dash-scroll-area">
          {/* SEKCIJA SA FOLDERIMA */}
          <section className="storage-section">
            <h3 className="section-title">Folderi</h3>
            <div className="folders-grid">
              {folderi.map((folder) => (
                <div key={folder.id} className="folder-card">
                  <span className="folder-icon">📁</span>
                  <span className="folder-name">{folder.ime}</span>
                </div>
              ))}
            </div>
          </section>

          {/* SEKCIJA SA FAJLOVIMA */}
          <section className="storage-section">
            <h3 className="section-title">Fajlovi</h3>
            <div className="files-list">
              <div className="files-header">
                <span>Ime fajla</span>
                <span>Veličina</span>
              </div>
              {fajlovi.map((fajl) => (
                <div key={fajl.id} className="file-row">
                  <span className="file-name-wrapper">
                    <span className="file-icon">📄</span>
                    {fajl.ime}
                  </span>
                  <span className="file-size">{fajl.velicina}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* 3. ISKAČUĆI PROZOR (MODAL) ZA NOVI FOLDER */}
      {prikaziModal && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h3>Novi folder</h3>
            <form onSubmit={kreirajFolder}>
              <input 
                type="text" 
                placeholder="Bez naslova" 
                value={novoImeFoldera}
                onChange={(e) => setNovoImeFoldera(e.target.value)}
                autoFocus
                required
              />
              <div className="modal-actions">
                <button type="button" className="modal-cancel-btn" onClick={() => setPrikaziModal(false)}>
                  Otkaži
                </button>
                <button type="submit" className="modal-submit-btn">
                  Kreiraj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}