import { useEffect, useMemo, useRef, useState } from "react";
import "./dashboard.css";
import "./settings.css";
import "./deleteAccount.css";
import "./securitySettings.css";
import "./profile.css";
import "./help.css";
import "./share.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const SEKCIJA_U_URL = {
  "Moj Disk": "drive",
  "Deljeno sa mnom": "shared",
  "Nedavno": "recent",
  "Zvezdice": "starred",
  "Otpad": "trash",
};

const URL_U_SEKCIJU = Object.fromEntries(
  Object.entries(SEKCIJA_U_URL).map(([sekcija, value]) => [value, sekcija])
);

const procitajDashboardNavigaciju = () => {
  const params = new URLSearchParams(window.location.search);

  const sekcija =
    URL_U_SEKCIJU[params.get("view")] || "Moj Disk";

  let folderId = null;

  if (
    sekcija === "Moj Disk" ||
    sekcija === "Deljeno sa mnom"
  ) {
    const rawFolderId = params.get("folder");

    if (rawFolderId && /^\d+$/.test(rawFolderId)) {
      folderId = Number(rawFolderId);
    }
  }

  return {
    sekcija,
    folderId,
  };
};

const sacuvajDashboardNavigaciju = (
  sekcija,
  folderId,
  replace = false
) => {
  const url = new URL(window.location.href);

  url.searchParams.delete("view");
  url.searchParams.delete("folder");

  if (sekcija !== "Moj Disk") {
    url.searchParams.set(
      "view",
      SEKCIJA_U_URL[sekcija] || "drive"
    );
  }

  if (
    (sekcija === "Moj Disk" ||
      sekcija === "Deljeno sa mnom") &&
    folderId !== null &&
    folderId !== undefined
  ) {
    url.searchParams.set("folder", String(folderId));
  }

  const state = {
    storioDashboard: true,
    sekcija,
    folderId: folderId ?? null,
  };

  const novaPutanja =
    url.pathname + url.search + url.hash;

  if (replace) {
    window.history.replaceState(
      state,
      "",
      novaPutanja
    );
  } else {
    window.history.pushState(
      state,
      "",
      novaPutanja
    );
  }
};

export default function Dashboard({ korisnik, naOdjavu }) {
  const [folderi, setFolderi] = useState([]);
  const [fajlovi, setFajlovi] = useState([]);
  const [storage, setStorage] = useState({
    used_bytes: 0,
    limit_bytes: 15 * 1024 * 1024 * 1024,
  });

  const [aktivnaSekcija, setAktivnaSekcija] = useState(
    () => procitajDashboardNavigaciju().sekcija
  );
  const [currentFolderId, setCurrentFolderId] = useState(
    () => procitajDashboardNavigaciju().folderId
  );
  const [currentFolder, setCurrentFolder] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);

  const [pretraga, setPretraga] = useState("");
  const [ucitavanje, setUcitavanje] = useState(true);
  const [greska, setGreska] = useState("");

  const [uploadUToku, setUploadUToku] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  const [prikaziNoviMeni, setPrikaziNoviMeni] = useState(false);
  const [prikaziFolderModal, setPrikaziFolderModal] = useState(false);
  const [novoImeFoldera, setNovoImeFoldera] = useState("");

  const [otvorenMeniFajla, setOtvorenMeniFajla] = useState(null);
  const [otvorenMeniFoldera, setOtvorenMeniFoldera] = useState(null);

  const [stavkaZaDeljenje, setStavkaZaDeljenje] = useState(null);
  const [primalacDeljenja, setPrimalacDeljenja] = useState("");
  const [deljenjeUToku, setDeljenjeUToku] = useState(false);
  const [deljenjeGreska, setDeljenjeGreska] = useState("");
  const [deljenjeUspeh, setDeljenjeUspeh] = useState("");

  const [fajlZaPreimenovanje, setFajlZaPreimenovanje] = useState(null);
  const [novoImeFajla, setNovoImeFajla] = useState("");
  const [fajlZaDetalje, setFajlZaDetalje] = useState(null);

  const [folderZaPreimenovanje, setFolderZaPreimenovanje] = useState(null);
  const [novoImeFolderaRename, setNovoImeFolderaRename] = useState("");
  const [folderZaDetalje, setFolderZaDetalje] = useState(null);

  const [prikaziPodesavanja, setPrikaziPodesavanja] = useState(false);
  const [tema, setTema] = useState(
    () => localStorage.getItem("storio-theme") || "light"
  );
  const [resetLozinkaUToku, setResetLozinkaUToku] = useState(false);
  const [resetLozinkaStatus, setResetLozinkaStatus] = useState("");
  const [odjavaSvudaUToku, setOdjavaSvudaUToku] = useState(false);

  const [profil, setProfil] = useState(() => ({
    ...(korisnik || {}),
  }));
  const [prikaziProfil, setPrikaziProfil] = useState(false);
  const [prikaziPomoc, setPrikaziPomoc] = useState(false);
  const [profilUToku, setProfilUToku] = useState(false);
  const [profilGreska, setProfilGreska] = useState("");
  const [avatarVersion, setAvatarVersion] = useState(() => Date.now());

  const [prikaziUsernameModal, setPrikaziUsernameModal] = useState(false);
  const [novoKorisnickoIme, setNovoKorisnickoIme] = useState(
    () => korisnik?.username || ""
  );

  const [prikaziBrisanjeNaloga, setPrikaziBrisanjeNaloga] = useState(false);
  const [potvrdaBrisanja, setPotvrdaBrisanja] = useState("");
  const [brisanjeNalogaUToku, setBrisanjeNalogaUToku] = useState(false);
  const [brisanjeNalogaGreska, setBrisanjeNalogaGreska] = useState("");

  const fileInputRef = useRef(null);
  const zipInputRef = useRef(null);
  const avatarInputRef = useRef(null);

  const formatVelicine = (bytes) => {
    if (!bytes) return "0 B";

    const jedinice = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      jedinice.length - 1
    );

    const vrednost = bytes / Math.pow(1024, index);

    return `${vrednost.toFixed(index === 0 ? 0 : 2)} ${jedinice[index]}`;
  };

  const formatVremena = (sekunde) => {
    if (
      sekunde === null ||
      sekunde === undefined ||
      !Number.isFinite(sekunde) ||
      sekunde < 0
    ) {
      return "Računam...";
    }

    const ukupnoSekundi = Math.max(0, Math.ceil(sekunde));

    if (ukupnoSekundi <= 4) {
      return "Još nekoliko sekundi";
    }

    const sati = Math.floor(ukupnoSekundi / 3600);
    const minuti = Math.floor((ukupnoSekundi % 3600) / 60);
    const sek = ukupnoSekundi % 60;

    if (sati > 0) return `${sati} h ${minuti} min`;
    if (minuti > 0) return `${minuti} min ${sek} s`;
    return `${sek} s`;
  };

  const formatDatuma = (value) => {
    if (!value) return "-";

    return new Date(value).toLocaleString("sr-RS");
  };

  const procenatStoragea = Math.min(
    storage.limit_bytes > 0
      ? (storage.used_bytes / storage.limit_bytes) * 100
      : 0,
    100
  );

  const api = async (url, options = {}) => {
    const response = await fetch(`${API_URL}${url}`, {
      credentials: "include",
      ...options,
    });

    if (!response.ok) {
      let poruka = "Došlo je do greške.";
      let payload = null;

      try {
        payload = await response.json();

        if (typeof payload?.detail === "string") {
          poruka = payload.detail;
        } else if (payload?.detail?.message) {
          poruka = payload.detail.message;
        }
      } catch {
        // Nema JSON tela.
      }

      const error = new Error(poruka);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return response;
  };

  const ucitajProfil = async () => {
    try {
      const response = await api("/auth/me");
      const data = await response.json();

      setProfil(data.user || {});
      setNovoKorisnickoIme(data.user?.username || "");
    } catch (error) {
      console.error("Ne mogu da učitam profil:", error);
    }
  };

  const promeniProfilnu = async (e) => {
    const fajl = e.target.files?.[0];
    e.target.value = "";

    if (!fajl) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(fajl.type)) {
      setProfilGreska("Profilna slika mora biti JPG, PNG ili WEBP.");
      return;
    }

    if (fajl.size > 5 * 1024 * 1024) {
      setProfilGreska("Profilna slika može imati najviše 5 MB.");
      return;
    }

    try {
      setProfilUToku(true);
      setProfilGreska("");

      const formData = new FormData();
      formData.append("avatar", fajl);

      const response = await api("/auth/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      setProfil(data.user || profil);
      setAvatarVersion(Date.now());
    } catch (error) {
      setProfilGreska(
        error.message || "Promena profilne slike nije uspela."
      );
    } finally {
      setProfilUToku(false);
    }
  };

  const ukloniProfilnu = async () => {
    try {
      setProfilUToku(true);
      setProfilGreska("");

      const response = await api("/auth/profile/avatar", {
        method: "DELETE",
      });

      const data = await response.json();

      setProfil(data.user || profil);
      setAvatarVersion(Date.now());
    } catch (error) {
      setProfilGreska(
        error.message || "Uklanjanje profilne slike nije uspelo."
      );
    } finally {
      setProfilUToku(false);
    }
  };

  const sacuvajKorisnickoIme = async (e) => {
    e.preventDefault();

    const username = novoKorisnickoIme.trim();

    if (username.length < 3) {
      setProfilGreska("Korisničko ime mora imati najmanje 3 karaktera.");
      return;
    }

    try {
      setProfilUToku(true);
      setProfilGreska("");

      const response = await api("/auth/profile/username", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
      });

      const data = await response.json();

      setProfil(data.user || profil);
      setNovoKorisnickoIme(data.user?.username || username);
      setPrikaziUsernameModal(false);
    } catch (error) {
      setProfilGreska(
        error.message || "Promena korisničkog imena nije uspela."
      );
    } finally {
      setProfilUToku(false);
    }
  };

  const osveziStorage = async () => {
    const response = await api("/storage/usage");
    const usage = await response.json();
    setStorage(usage);
  };

  const ucitajPodatke = async (folderId, sekcija) => {
    try {
      setGreska("");
      setUcitavanje(true);

      if (sekcija === "Deljeno sa mnom") {
        const sharedUrl =
          folderId === null
            ? "/shares/received"
            : `/shares/folders/${folderId}/items`;

        const [itemsResponse, usageResponse] = await Promise.all([
          api(sharedUrl),
          api("/storage/usage"),
        ]);

        const items = await itemsResponse.json();
        const usage = await usageResponse.json();

        setFolderi(items.folders || []);
        setFajlovi(items.files || []);
        setCurrentFolder(items.current_folder || null);
        setBreadcrumbs(items.breadcrumbs || []);
        setStorage(usage);
        return;
      }

      const globalniPrikaz = sekcija !== "Moj Disk";
      const params = new URLSearchParams({
        include_deleted: "true",
        recursive: globalniPrikaz ? "true" : "false",
      });

      if (!globalniPrikaz && folderId !== null) {
        params.set("folder_id", String(folderId));
      }

      const [itemsResponse, usageResponse] = await Promise.all([
        api(`/storage/items?${params.toString()}`),
        api("/storage/usage"),
      ]);

      const items = await itemsResponse.json();
      const usage = await usageResponse.json();

      setFolderi(items.folders || []);
      setFajlovi(items.files || []);
      setCurrentFolder(items.current_folder || null);
      setBreadcrumbs(items.breadcrumbs || []);
      setStorage(usage);
    } catch (error) {
      setGreska(error.message || "Ne mogu da učitam Storio sadržaj.");
    } finally {
      setUcitavanje(false);
    }
  };

  useEffect(() => {
    const navigacija =
      procitajDashboardNavigaciju();

    sacuvajDashboardNavigaciju(
      navigacija.sekcija,
      navigacija.folderId,
      true
    );

    const obradiBrowserNavigaciju = () => {
      const novaNavigacija =
        procitajDashboardNavigaciju();

      setAktivnaSekcija(
        novaNavigacija.sekcija
      );
      setCurrentFolderId(
        novaNavigacija.folderId
      );

      setPretraga("");
      setPrikaziNoviMeni(false);
      setOtvorenMeniFajla(null);
      setOtvorenMeniFoldera(null);
    };

    window.addEventListener(
      "popstate",
      obradiBrowserNavigaciju
    );

    return () => {
      window.removeEventListener(
        "popstate",
        obradiBrowserNavigaciju
      );
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("storio-theme", tema);
  }, [tema]);

  useEffect(() => {
    ucitajProfil();
  }, []);

  useEffect(() => {
    ucitajPodatke(currentFolderId, aktivnaSekcija);
  }, [currentFolderId, aktivnaSekcija]);

  const osveziTrenutniPrikaz = async () => {
    await ucitajPodatke(currentFolderId, aktivnaSekcija);
  };

  const zatvoriMenije = () => {
    setPrikaziNoviMeni(false);
    setOtvorenMeniFajla(null);
    setOtvorenMeniFoldera(null);
    setPrikaziProfil(false);
    setPrikaziPomoc(false);
  };

  const promeniSekciju = (sekcija) => {
    if (
      sekcija === aktivnaSekcija &&
      currentFolderId === null
    ) {
      zatvoriMenije();
      return;
    }

    setAktivnaSekcija(sekcija);
    setCurrentFolderId(null);
    setCurrentFolder(null);
    setBreadcrumbs([]);
    setPretraga("");
    setOtvorenMeniFajla(null);
    setOtvorenMeniFoldera(null);

    sacuvajDashboardNavigaciju(
      sekcija,
      null
    );
  };

  const otvoriFolder = (folder) => {
    if (!folder?.folder_id) return;

    const ciljnaSekcija =
      folder.shared || aktivnaSekcija === "Deljeno sa mnom"
        ? "Deljeno sa mnom"
        : "Moj Disk";

    setAktivnaSekcija(ciljnaSekcija);
    setCurrentFolderId(folder.folder_id);
    setPretraga("");
    zatvoriMenije();

    sacuvajDashboardNavigaciju(
      ciljnaSekcija,
      folder.folder_id
    );
  };

  const idiUFolder = (folderId) => {
    const ciljnaSekcija =
      aktivnaSekcija === "Deljeno sa mnom"
        ? "Deljeno sa mnom"
        : "Moj Disk";

    if (
      aktivnaSekcija === ciljnaSekcija &&
      currentFolderId === folderId
    ) {
      zatvoriMenije();
      return;
    }

    setAktivnaSekcija(ciljnaSekcija);
    setCurrentFolderId(folderId);
    setPretraga("");
    zatvoriMenije();

    sacuvajDashboardNavigaciju(
      ciljnaSekcija,
      folderId
    );
  };

  // ---------------------------------------------------------
  // FOLDERI
  // ---------------------------------------------------------

  const kreirajFolder = async (e) => {
    e.preventDefault();

    const ime = novoImeFoldera.trim();
    if (!ime) return;

    try {
      await api("/folders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: ime,
          parent_id: currentFolderId,
        }),
      });

      setNovoImeFoldera("");
      setPrikaziFolderModal(false);
      await osveziTrenutniPrikaz();
    } catch (error) {
      alert(error.message);
    }
  };

  const otvoriPreimenovanjeFoldera = (folder) => {
    setFolderZaPreimenovanje(folder);
    setNovoImeFolderaRename(folder.name);
    setOtvorenMeniFoldera(null);
  };

  const preimenujFolder = async (e) => {
    e.preventDefault();

    const ime = novoImeFolderaRename.trim();
    if (!ime || !folderZaPreimenovanje) return;

    try {
      await api(`/folders/${folderZaPreimenovanje.folder_id}/rename`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: ime }),
      });

      setFolderZaPreimenovanje(null);
      setNovoImeFolderaRename("");
      await osveziTrenutniPrikaz();
    } catch (error) {
      alert(error.message);
    }
  };

  const toggleFolderZvezdica = async (folder) => {
    try {
      await api(`/folders/${folder.folder_id}/star`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_starred: !folder.is_starred,
        }),
      });

      await osveziTrenutniPrikaz();
    } catch (error) {
      alert(error.message);
    } finally {
      setOtvorenMeniFoldera(null);
    }
  };

  const kopirajNazivFoldera = async (folder) => {
    try {
      await navigator.clipboard.writeText(folder.name);
    } catch {
      alert("Browser nije dozvolio kopiranje naziva.");
    } finally {
      setOtvorenMeniFoldera(null);
    }
  };

  const premestiFolderUOtpad = async (folder) => {
    if (
      !window.confirm(
        `Premestiti folder "${folder.name}" u Otpad?\n\nSadržaj foldera će ostati sačuvan dok ga trajno ne obrišeš.`
      )
    ) {
      return;
    }

    try {
      await api(`/folders/${folder.folder_id}`, {
        method: "DELETE",
      });

      await osveziTrenutniPrikaz();
    } catch (error) {
      alert(error.message);
    } finally {
      setOtvorenMeniFoldera(null);
    }
  };

  const vratiFolderIzOtpada = async (folder) => {
    try {
      await api(`/folders/${folder.folder_id}/restore`, {
        method: "POST",
      });

      await osveziTrenutniPrikaz();
    } catch (error) {
      alert(error.message);
    } finally {
      setOtvorenMeniFoldera(null);
    }
  };

  const trajnoObrisiFolder = async (folder) => {
    if (
      !window.confirm(
        `Trajno obrisati folder "${folder.name}" i SAV njegov sadržaj?\n\nOvu radnju nije moguće poništiti.`
      )
    ) {
      return;
    }

    try {
      await api(`/folders/${folder.folder_id}/permanent`, {
        method: "DELETE",
      });

      await Promise.all([
        osveziTrenutniPrikaz(),
        osveziStorage(),
      ]);
    } catch (error) {
      alert(error.message);
    } finally {
      setOtvorenMeniFoldera(null);
    }
  };

  // ---------------------------------------------------------
  // CHUNKED UPLOAD
  // ---------------------------------------------------------

  const sleep = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const uploadLocalStorageKey = (file, folderId) => {
    const userId = korisnik?.user_id || "user";
    const folderPart = folderId ?? "root";

    return [
      "storio-upload",
      userId,
      folderPart,
      file.name,
      file.size,
      file.lastModified,
    ].join(":");
  };

  const getOrCreateUploadSession = async (file, folderId) => {
    const storageKey = uploadLocalStorageKey(file, folderId);
    const savedUploadId = localStorage.getItem(storageKey);

    if (savedUploadId) {
      try {
        const response = await api(`/uploads/${savedUploadId}`);
        const session = await response.json();

        if (
          session.name === file.name &&
          session.total_size === file.size &&
          (session.folder_id ?? null) === (folderId ?? null)
        ) {
          return {
            ...session,
            storageKey,
          };
        }

        localStorage.removeItem(storageKey);
      } catch (error) {
        if (error.status === 404) {
          localStorage.removeItem(storageKey);
        } else {
          throw error;
        }
      }
    }

    const response = await api("/uploads/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        mime_type: file.type || "application/octet-stream",
        folder_id: folderId,
      }),
    });

    const session = await response.json();

    localStorage.setItem(storageKey, session.upload_id);

    return {
      ...session,
      storageKey,
    };
  };

  const posaljiChunkSaRetry = async ({
    uploadId,
    offset,
    chunk,
  }) => {
    const MAX_POKUSAJA = 4;

    for (let pokusaj = 1; pokusaj <= MAX_POKUSAJA; pokusaj += 1) {
      try {
        const response = await api(
          `/uploads/${uploadId}/chunk?offset=${offset}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
            },
            body: chunk,
          }
        );

        return await response.json();
      } catch (error) {
        const expectedOffset =
          error?.payload?.detail?.expected_offset;

        if (
          error.status === 409 &&
          Number.isInteger(expectedOffset) &&
          expectedOffset >= offset
        ) {
          return {
            bytes_received: expectedOffset,
          };
        }

        const privremenaGreska =
          !error.status || error.status >= 500;

        if (!privremenaGreska || pokusaj === MAX_POKUSAJA) {
          throw error;
        }

        await sleep(1000 * pokusaj);
      }
    }

    throw new Error("Upload chunk nije uspeo.");
  };

  const uploadJednogFajla = async (
    file,
    redniBroj,
    ukupanBroj,
    folderId
  ) => {
    const session = await getOrCreateUploadSession(file, folderId);

    const uploadId = session.upload_id;
    const storageKey = session.storageKey;
    const chunkSize = session.chunk_size || 20 * 1024 * 1024;

    let offset = session.bytes_received || 0;

    const pocetniOffset = offset;
    const vremePocetka = performance.now();

    if (offset > file.size) {
      throw new Error(
        "Sačuvana upload sesija nije validna za ovaj fajl."
      );
    }

    const osveziProgress = () => {
      const procenat =
        file.size === 0
          ? 100
          : Math.min(
              Math.round((offset / file.size) * 100),
              100
            );

      const protekloSekundi = Math.max(
        (performance.now() - vremePocetka) / 1000,
        0
      );

      const poslatoUTokuOveSesije = Math.max(
        offset - pocetniOffset,
        0
      );

      const brzinaBps =
        protekloSekundi > 0.25 && poslatoUTokuOveSesije > 0
          ? poslatoUTokuOveSesije / protekloSekundi
          : 0;

      const preostaloBajtova = Math.max(file.size - offset, 0);
      const preostaloSekundi =
        brzinaBps > 0 ? preostaloBajtova / brzinaBps : null;

      let statusTekst = "Priprema uploada...";

      if (offset >= file.size) {
        statusTekst = "Finalizujem fajl...";
      } else if (poslatoUTokuOveSesije > 0) {
        statusTekst = "Otpremanje u toku";
      } else if (pocetniOffset > 0) {
        statusTekst = "Nastavljam prethodni upload...";
      }

      setUploadStatus({
        name: file.name,
        procenat,
        poslato: offset,
        ukupno: file.size,
        redniBroj,
        ukupanBroj,
        brzinaBps,
        preostaloSekundi,
        statusTekst,
        nastavljen: pocetniOffset > 0,
      });
    };

    osveziProgress();

    while (offset < file.size) {
      const kraj = Math.min(offset + chunkSize, file.size);
      const chunk = file.slice(offset, kraj);

      const result = await posaljiChunkSaRetry({
        uploadId,
        offset,
        chunk,
      });

      const noviOffset = Number(result.bytes_received);

      if (
        !Number.isFinite(noviOffset) ||
        noviOffset <= offset ||
        noviOffset > file.size
      ) {
        throw new Error(
          "Backend je vratio nevažeći upload offset."
        );
      }

      offset = noviOffset;
      osveziProgress();
    }

    const completeResponse = await api(
      `/uploads/${uploadId}/complete`,
      {
        method: "POST",
      }
    );

    const data = await completeResponse.json();
    localStorage.removeItem(storageKey);

    return data.file;
  };

  const uploaduj = async (fileList, targetFolderId) => {
    const lista = Array.from(fileList || []);
    if (lista.length === 0) return;

    try {
      setUploadUToku(true);
      setGreska("");

      for (let i = 0; i < lista.length; i += 1) {
        await uploadJednogFajla(
          lista[i],
          i + 1,
          lista.length,
          targetFolderId
        );

        await osveziStorage();
      }

      await osveziTrenutniPrikaz();
    } catch (error) {
      console.error("Chunked upload greška:", error);

      alert(
        `${error.message}\n\nAko je mreža pukla, ponovo izaberi isti fajl i Storio će nastaviti od poslednjeg potvrđenog dela.`
      );
    } finally {
      setUploadUToku(false);
      setUploadStatus(null);
    }
  };

  const uploadFajlova = async (e) => {
    const targetFolderId = currentFolderId;
    await uploaduj(e.target.files, targetFolderId);
    e.target.value = "";
  };

  const uploadZipFajla = async (e) => {
    const targetFolderId = currentFolderId;
    await uploaduj(e.target.files, targetFolderId);
    e.target.value = "";
  };

  // ---------------------------------------------------------
  // FAJLOVI
  // ---------------------------------------------------------

  const getFileInfo = (fajl) => {
    const ime = (fajl.name || "").toLowerCase();
    const mime = (fajl.type || "").toLowerCase();

    if (mime.startsWith("image/"))
      return { naziv: "Slika", oznaka: "IMG", klasa: "image" };
    if (mime.startsWith("video/"))
      return { naziv: "Video", oznaka: "VID", klasa: "video" };
    if (mime.startsWith("audio/"))
      return { naziv: "Audio", oznaka: "AUD", klasa: "audio" };
    if (mime === "application/pdf" || ime.endsWith(".pdf"))
      return { naziv: "PDF dokument", oznaka: "PDF", klasa: "pdf" };
    if ([".zip", ".rar", ".7z", ".tar", ".gz"].some((ext) => ime.endsWith(ext)))
      return { naziv: "Arhiva", oznaka: "ZIP", klasa: "archive" };
    if ([".doc", ".docx", ".odt"].some((ext) => ime.endsWith(ext)))
      return { naziv: "Dokument", oznaka: "DOC", klasa: "document" };
    if ([".xls", ".xlsx", ".ods", ".csv"].some((ext) => ime.endsWith(ext)))
      return { naziv: "Tabela", oznaka: "XLS", klasa: "spreadsheet" };
    if ([".ppt", ".pptx", ".odp"].some((ext) => ime.endsWith(ext)))
      return { naziv: "Prezentacija", oznaka: "PPT", klasa: "presentation" };
    if ([".txt", ".md", ".log"].some((ext) => ime.endsWith(ext)))
      return { naziv: "Tekstualni fajl", oznaka: "TXT", klasa: "text" };
    if (
      [
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".py",
        ".java",
        ".cpp",
        ".c",
        ".h",
        ".html",
        ".css",
        ".sql",
        ".json",
        ".xml",
        ".sh",
      ].some((ext) => ime.endsWith(ext))
    )
      return { naziv: "Izvorni kod", oznaka: "</>", klasa: "code" };

    return { naziv: "Fajl", oznaka: "FILE", klasa: "generic" };
  };

  const fetchFileBlob = async (fajl) => {
    const response = await api(`/files/${fajl.file_id}/download`);
    return await response.blob();
  };

  const preuzmiFajl = (fajl) => {
    const link = document.createElement("a");
    link.href = fajl.shared
      ? `${API_URL}/shares/files/${fajl.file_id}/download`
      : `${API_URL}/files/${fajl.file_id}/download`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setOtvorenMeniFajla(null);
  };

  const otvoriFajl = (fajl) => {
    const contentUrl = fajl.shared
      ? `${API_URL}/shares/files/${fajl.file_id}/content`
      : `${API_URL}/files/${fajl.file_id}/content`;

    window.open(
      contentUrl,
      "_blank",
      "noopener,noreferrer"
    );

    setOtvorenMeniFajla(null);
  };

  const otvoriPreimenovanje = (fajl) => {
    setFajlZaPreimenovanje(fajl);
    setNovoImeFajla(fajl.name);
    setOtvorenMeniFajla(null);
  };

  const preimenujFajl = async (e) => {
    e.preventDefault();

    const ime = novoImeFajla.trim();
    if (!ime || !fajlZaPreimenovanje) return;

    try {
      await api(`/files/${fajlZaPreimenovanje.file_id}/rename`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: ime }),
      });

      setFajlZaPreimenovanje(null);
      setNovoImeFajla("");
      await osveziTrenutniPrikaz();
    } catch (error) {
      alert(error.message);
    }
  };

  const toggleZvezdica = async (fajl) => {
    try {
      await api(`/files/${fajl.file_id}/star`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_starred: !fajl.is_starred,
        }),
      });

      await osveziTrenutniPrikaz();
    } catch (error) {
      alert(error.message);
    } finally {
      setOtvorenMeniFajla(null);
    }
  };

  const otvoriDeljenjeFajla = (fajl) => {
    setStavkaZaDeljenje({
      tip: "file",
      id: fajl.file_id,
      naziv: fajl.name,
    });
    setPrimalacDeljenja("");
    setDeljenjeGreska("");
    setDeljenjeUspeh("");
    setOtvorenMeniFajla(null);
  };

  const otvoriDeljenjeFoldera = (folder) => {
    setStavkaZaDeljenje({
      tip: "folder",
      id: folder.folder_id,
      naziv: folder.name,
    });
    setPrimalacDeljenja("");
    setDeljenjeGreska("");
    setDeljenjeUspeh("");
    setOtvorenMeniFoldera(null);
  };

  const zatvoriDeljenje = () => {
    if (deljenjeUToku) return;

    setStavkaZaDeljenje(null);
    setPrimalacDeljenja("");
    setDeljenjeGreska("");
    setDeljenjeUspeh("");
  };

  const podeliNaStorio = async (e) => {
    e.preventDefault();

    const recipient = primalacDeljenja.trim();

    if (!stavkaZaDeljenje || !recipient) {
      setDeljenjeGreska(
        "Unesi korisničko ime ili email Storio korisnika."
      );
      return;
    }

    try {
      setDeljenjeUToku(true);
      setDeljenjeGreska("");
      setDeljenjeUspeh("");

      const endpoint =
        stavkaZaDeljenje.tip === "folder"
          ? `/shares/folders/${stavkaZaDeljenje.id}`
          : `/shares/files/${stavkaZaDeljenje.id}`;

      const response = await api(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recipient }),
      });

      const data = await response.json();

      setDeljenjeUspeh(
        data.message || "Stavka je uspešno podeljena."
      );
      setPrimalacDeljenja("");
    } catch (error) {
      setDeljenjeGreska(
        error.message || "Deljenje nije uspelo."
      );
    } finally {
      setDeljenjeUToku(false);
    }
  };

  const premestiUOtpad = async (fajl) => {
    if (!window.confirm(`Premestiti "${fajl.name}" u Otpad?`)) return;

    try {
      await api(`/files/${fajl.file_id}`, {
        method: "DELETE",
      });

      await osveziTrenutniPrikaz();
    } catch (error) {
      alert(error.message);
    } finally {
      setOtvorenMeniFajla(null);
    }
  };

  const vratiIzOtpada = async (fajl) => {
    try {
      await api(`/files/${fajl.file_id}/restore`, {
        method: "POST",
      });

      await osveziTrenutniPrikaz();
    } catch (error) {
      alert(error.message);
    } finally {
      setOtvorenMeniFajla(null);
    }
  };

  const trajnoObrisiFajl = async (fajl) => {
    if (
      !window.confirm(
        `Trajno obrisati "${fajl.name}"?\n\nOvu radnju nije moguće poništiti.`
      )
    ) {
      return;
    }

    try {
      await api(`/files/${fajl.file_id}/permanent`, {
        method: "DELETE",
      });

      await Promise.all([
        osveziTrenutniPrikaz(),
        osveziStorage(),
      ]);
    } catch (error) {
      alert(error.message);
    } finally {
      setOtvorenMeniFajla(null);
    }
  };

  // ---------------------------------------------------------
  // PODEŠAVANJA
  // ---------------------------------------------------------

  const posaljiLinkZaPromenuLozinke = async () => {
    const profilEmail = profil?.email || korisnik?.email;

    if (!profilEmail) {
      setResetLozinkaStatus("Email korisnika nije dostupan.");
      return;
    }

    try {
      setResetLozinkaUToku(true);
      setResetLozinkaStatus("");

      const response = await api("/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: profilEmail,
        }),
      });

      const data = await response.json();

      setResetLozinkaStatus(
        data.message ||
          "Poslali smo ti link za promenu lozinke na email."
      );
    } catch (error) {
      setResetLozinkaStatus(
        error.message || "Slanje linka za promenu lozinke nije uspelo."
      );
    } finally {
      setResetLozinkaUToku(false);
    }
  };

  const odjaviSe = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Odjava sa servera nije uspela:", error);
    } finally {
      naOdjavu();
    }
  };

  const odjaviSaSvihUredjaja = async () => {
    const potvrda = window.confirm(
      "Bićeš odjavljen sa svih uređaja, uključujući i ovaj. Nastaviti?"
    );

    if (!potvrda) return;

    try {
      setOdjavaSvudaUToku(true);
      setResetLozinkaStatus("");

      await api("/auth/logout-all", {
        method: "POST",
      });

      setPrikaziPodesavanja(false);
      naOdjavu();
    } catch (error) {
      setResetLozinkaStatus(
        error.message || "Odjava sa svih uređaja nije uspela."
      );
    } finally {
      setOdjavaSvudaUToku(false);
    }
  };

  const zatvoriBrisanjeNaloga = () => {
    if (brisanjeNalogaUToku) return;

    setPrikaziBrisanjeNaloga(false);
    setPotvrdaBrisanja("");
    setBrisanjeNalogaGreska("");
  };

  const obrisiNalog = async (e) => {
    e.preventDefault();

    if (potvrdaBrisanja.trim() !== "OBRISI") {
      setBrisanjeNalogaGreska('Za potvrdu upiši tačno "OBRISI".');
      return;
    }

    try {
      setBrisanjeNalogaUToku(true);
      setBrisanjeNalogaGreska("");

      await api("/auth/delete-account", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirmation: potvrdaBrisanja.trim(),
        }),
      });

      Object.keys(localStorage)
        .filter((key) => key.startsWith("storio-upload:"))
        .forEach((key) => localStorage.removeItem(key));

      localStorage.removeItem("storio-theme");
      setPrikaziBrisanjeNaloga(false);
      naOdjavu();
    } catch (error) {
      setBrisanjeNalogaGreska(
        error.message || "Brisanje naloga nije uspelo."
      );
    } finally {
      setBrisanjeNalogaUToku(false);
    }
  };

  // ---------------------------------------------------------
  // FILTERI
  // ---------------------------------------------------------

  const prikazaniFolderi = useMemo(() => {
    const query = pretraga.trim().toLowerCase();
    let rezultat = [...folderi];

    if (aktivnaSekcija === "Otpad") {
      rezultat = rezultat.filter((folder) => folder.deleted_at);
    } else {
      rezultat = rezultat.filter((folder) => !folder.deleted_at);
    }

    if (aktivnaSekcija === "Zvezdice") {
      rezultat = rezultat.filter((folder) => folder.is_starred);
    }

    if (aktivnaSekcija === "Nedavno") {
      rezultat.sort(
        (a, b) =>
          new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
    }

    return rezultat.filter((folder) =>
      folder.name.toLowerCase().includes(query)
    );
  }, [folderi, pretraga, aktivnaSekcija]);

  const prikazaniFajlovi = useMemo(() => {
    const query = pretraga.trim().toLowerCase();
    let rezultat = [...fajlovi];

    if (aktivnaSekcija === "Otpad") {
      rezultat = rezultat.filter((fajl) => fajl.deleted_at);
    } else {
      rezultat = rezultat.filter((fajl) => !fajl.deleted_at);
    }

    if (aktivnaSekcija === "Zvezdice") {
      rezultat = rezultat.filter((fajl) => fajl.is_starred);
    }

    if (aktivnaSekcija === "Nedavno") {
      rezultat.sort(
        (a, b) =>
          new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );
    }

    return rezultat.filter((fajl) =>
      fajl.name.toLowerCase().includes(query)
    );
  }, [fajlovi, pretraga, aktivnaSekcija]);

  const emptyText = useMemo(() => {
    if (pretraga.trim()) {
      return {
        naslov: "Nema rezultata",
        tekst: "Nema fajlova ili foldera koji odgovaraju pretrazi.",
      };
    }

    if (aktivnaSekcija === "Zvezdice") {
      return {
        naslov: "Nema označenih stavki",
        tekst: "Fajlove i foldere koje označiš zvezdicom pronaći ćeš ovde.",
      };
    }

    if (aktivnaSekcija === "Nedavno") {
      return {
        naslov: "Nema nedavnih stavki",
        tekst: "Fajlovi i folderi koje dodaš pojaviće se ovde.",
      };
    }

    if (aktivnaSekcija === "Otpad") {
      return {
        naslov: "Otpad je prazan",
        tekst: "Obrisani fajlovi i folderi pojaviće se ovde.",
      };
    }

    if (aktivnaSekcija === "Deljeno sa mnom") {
      return {
        naslov: "Ništa nije podeljeno sa tobom",
        tekst:
          "Fajlovi i folderi koje drugi Storio korisnici podele sa tobom pojaviće se ovde.",
      };
    }

    if (currentFolder) {
      return {
        naslov: "Folder je prazan",
        tekst: "Klikni na + Novo da napraviš podfolder ili uploaduješ fajl ovde.",
      };
    }

    return {
      naslov: "Tvoj Storio je prazan",
      tekst: "Klikni na + Novo da napraviš folder ili uploaduješ fajl.",
    };
  }, [aktivnaSekcija, pretraga, currentFolder]);

  const avatarSlovo =
    profil?.username?.charAt(0)?.toUpperCase() ||
    profil?.email?.charAt(0)?.toUpperCase() ||
    korisnik?.username?.charAt(0)?.toUpperCase() ||
    korisnik?.email?.charAt(0)?.toUpperCase() ||
    "S";

  const avatarUrl = profil?.avatar_url
    ? `${API_URL}${profil.avatar_url}?v=${avatarVersion}`
    : null;

  const datumKreiranjaNaloga = profil?.created_at
    ? new Date(profil.created_at).toLocaleDateString("sr-RS", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "Nije dostupno";

  const naslovStranice =
    aktivnaSekcija === "Moj Disk" && currentFolder
      ? currentFolder.name
      : aktivnaSekcija;

  return (
    <div
      className={`dashboard-container ${tema === "dark" ? "dark-mode" : ""}`}
      onClick={zatvoriMenije}
    >
      <aside className="dash-sidebar">
        <div className="dash-logo-wrapper">
          <div className="dash-logo">Storio</div>
        </div>

        <div className="new-wrapper">
          <button
            className="new-upload-btn"
            onClick={(e) => {
              e.stopPropagation();
              setOtvorenMeniFajla(null);
              setOtvorenMeniFoldera(null);
              setPrikaziNoviMeni((stanje) => !stanje);
            }}
          >
            <span className="plus-icon">+</span>
            <span>
              {uploadUToku
                ? `${uploadStatus?.procenat ?? 0}%`
                : "Novo"}
            </span>
          </button>

          {prikaziNoviMeni && (
            <div
              className="new-dropdown"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setPrikaziNoviMeni(false);
                  setPrikaziFolderModal(true);
                }}
              >
                <strong>Novi folder</strong>
                <small>
                  {currentFolder
                    ? `Kreiraj u folderu ${currentFolder.name}`
                    : "Kreiraj novi folder"}
                </small>
              </button>

              <div className="new-dropdown-separator" />

              <button
                disabled={uploadUToku}
                onClick={() => {
                  setPrikaziNoviMeni(false);
                  fileInputRef.current?.click();
                }}
              >
                <strong>Upload fajla</strong>
                <small>Izaberi bilo koji tip fajla</small>
              </button>

              <button
                disabled={uploadUToku}
                onClick={() => {
                  setPrikaziNoviMeni(false);
                  zipInputRef.current?.click();
                }}
              >
                <strong>Upload ZIP fajla</strong>
                <small>Izaberi ZIP arhivu</small>
              </button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={uploadFajlova}
        />

        <input
          ref={zipInputRef}
          type="file"
          multiple
          hidden
          accept=".zip,application/zip,application/x-zip-compressed"
          onChange={uploadZipFajla}
        />

        <nav className="dash-nav">
          {["Moj Disk", "Deljeno sa mnom", "Nedavno", "Zvezdice", "Otpad"].map(
            (sekcija) => (
              <button
                key={sekcija}
                className={`nav-item ${
                  aktivnaSekcija === sekcija ? "active" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  promeniSekciju(sekcija);
                }}
              >
                {sekcija}
              </button>
            )
          )}
        </nav>

        <div className="storage-box">
          <div className="storage-title">Storage</div>

          <div className="storage-progress">
            <div
              className="storage-progress-used"
              style={{ width: `${procenatStoragea}%` }}
            />
          </div>

          <p>
            {formatVelicine(storage.used_bytes)} od{" "}
            {formatVelicine(storage.limit_bytes)} iskorišćeno
          </p>
        </div>

        <div className="sidebar-bottom">
          <button className="logout-btn" onClick={odjaviSe}>
            Odjavi se
          </button>
        </div>
      </aside>

      <main className="dash-main-content">
        <header className="dash-header">
          <div className="search-wrapper">
            <input
              type="text"
              className="search-bar"
              placeholder={
                currentFolder && aktivnaSekcija === "Moj Disk"
                  ? `Pretraži u ${currentFolder.name}`
                  : "Pretraži u Storio"
              }
              value={pretraga}
              onChange={(e) => setPretraga(e.target.value)}
            />

            {pretraga && (
              <button
                className="clear-search"
                onClick={() => setPretraga("")}
              >
                ×
              </button>
            )}
          </div>

          <div className="header-actions">
            <div
              className="help-menu-wrapper"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="header-icon-btn"
                aria-label="Storio pomoć"
                title="Pomoć"
                onClick={() => {
                  setPrikaziProfil(false);
                  setPrikaziPodesavanja(false);
                  setPrikaziPomoc((stanje) => !stanje);
                }}
              >
                ?
              </button>

              {prikaziPomoc && (
                <div className="help-popover">
                  <div className="help-popover-header">
                    <div>
                      <span className="help-kicker">STORIO</span>
                      <h3>Pomoć</h3>
                    </div>

                    <button
                      type="button"
                      className="help-close-btn"
                      aria-label="Zatvori pomoć"
                      onClick={() => setPrikaziPomoc(false)}
                    >
                      ×
                    </button>
                  </div>

                  <section className="help-section">
                    <div className="help-section-heading">
                      <h4>Kako koristiti Storio</h4>
                      <p>Brzi vodič kroz osnovne funkcije.</p>
                    </div>

                    <div className="help-guide-list">
                      <div className="help-guide-item">
                        <span className="help-guide-icon">↑</span>
                        <div>
                          <strong>Upload fajlova</strong>
                          <p>
                            Klikni na + Novo i izaberi Upload fajla ili ZIP arhive.
                          </p>
                        </div>
                      </div>

                      <div className="help-guide-item">
                        <span className="help-guide-icon">＋</span>
                        <div>
                          <strong>Kreiranje foldera</strong>
                          <p>
                            Klikni na + Novo → Novi folder i unesi naziv foldera.
                          </p>
                        </div>
                      </div>

                      <div className="help-guide-item">
                        <span className="help-guide-icon">★</span>
                        <div>
                          <strong>Zvezdice</strong>
                          <p>
                            U meniju fajla ili foldera izaberi Dodaj u zvezdice.
                          </p>
                        </div>
                      </div>

                      <div className="help-guide-item">
                        <span className="help-guide-icon">↶</span>
                        <div>
                          <strong>Otpad i vraćanje</strong>
                          <p>
                            Obrisane stavke ostaju u Otpadu dok ih ne vratiš ili trajno obrišeš.
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="help-section help-about-section">
                    <div className="help-section-heading">
                      <h4>O aplikaciji</h4>
                    </div>

                    <div className="help-about-card">
                      <div>
                        <span>Naziv</span>
                        <strong>Storio</strong>
                      </div>
                      <div>
                        <span>Verzija</span>
                        <strong>1.0.0</strong>
                      </div>
                      <div>
                        <span>Tip</span>
                        <strong>Privatni cloud storage</strong>
                      </div>
                    </div>
                  </section>

                  <section className="help-section help-support-section">
                    <div className="help-section-heading">
                      <h4>Prijavi problem</h4>
                      <p>
                        Ako nešto ne radi kako treba, pošalji opis problema.
                      </p>
                    </div>

                    <a
                      className="help-support-btn"
                      href="mailto:support@storiocloud.net?subject=Storio%20-%20prijava%20problema"
                    >
                      Pošalji prijavu
                    </a>

                    <span className="help-support-email">
                      support@storiocloud.net
                    </span>
                  </section>
                </div>
              )}
            </div>
            <button
              className="header-icon-btn"
              aria-label="Podešavanja"
              title="Podešavanja"
              onClick={(e) => {
                e.stopPropagation();
                setResetLozinkaStatus("");
                setPrikaziProfil(false);
                setPrikaziPomoc(false);
                setPrikaziPodesavanja(true);
              }}
            >
              ⚙
            </button>
            <div
              className="profile-menu-wrapper"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="user-profile user-profile-button"
                aria-label="Otvori profil"
                title="Profil"
                onClick={() => {
                  setPrikaziPodesavanja(false);
                  setPrikaziPomoc(false);
                  setProfilGreska("");
                  setPrikaziProfil((stanje) => !stanje);
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profilna slika"
                    className="header-profile-image"
                  />
                ) : (
                  avatarSlovo
                )}
              </button>

              {prikaziProfil && (
                <div className="profile-popover">
                  <div className="profile-popover-top">
                    <span className="profile-kicker">STORIO PROFIL</span>

                    <button
                      type="button"
                      className="profile-popover-close"
                      aria-label="Zatvori profil"
                      onClick={() => setPrikaziProfil(false)}
                    >
                      ×
                    </button>
                  </div>

                  <div className="profile-hero">
                    <div className="profile-avatar-large">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Profilna slika" />
                      ) : (
                        avatarSlovo
                      )}
                    </div>

                    <div className="profile-identity">
                      <strong>
                        {profil?.username ||
                          korisnik?.username ||
                          "Storio korisnik"}
                      </strong>
                      <span>
                        {profil?.email ||
                          korisnik?.email ||
                          "Email nije dostupan"}
                      </span>

                      {profil?.is_verified !== false && (
                        <small className="profile-verified">
                          ✓ Verifikovan nalog
                        </small>
                      )}
                    </div>
                  </div>

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    onChange={promeniProfilnu}
                  />

                  <div className="profile-actions-grid">
                    <button
                      type="button"
                      className="profile-action-primary"
                      disabled={profilUToku}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      Promeni profilnu
                    </button>

                    <button
                      type="button"
                      className="profile-action-secondary"
                      disabled={profilUToku}
                      onClick={() => {
                        setNovoKorisnickoIme(
                          profil?.username || korisnik?.username || ""
                        );
                        setPrikaziUsernameModal(true);
                        setPrikaziProfil(false);
                      }}
                    >
                      Promeni korisničko ime
                    </button>
                  </div>

                  {avatarUrl && (
                    <button
                      type="button"
                      className="profile-remove-avatar"
                      disabled={profilUToku}
                      onClick={ukloniProfilnu}
                    >
                      Ukloni profilnu sliku
                    </button>
                  )}

                  <div className="profile-info-card">
                    <div className="profile-info-row">
                      <span>Nalog napravljen</span>
                      <strong>{datumKreiranjaNaloga}</strong>
                    </div>

                    <div className="profile-info-row">
                      <span>Email</span>
                      <strong>
                        {profil?.email ||
                          korisnik?.email ||
                          "Nije dostupan"}
                      </strong>
                    </div>

                    <div className="profile-info-row">
                      <span>Status</span>
                      <strong className="profile-status-active">
                        Aktivan
                      </strong>
                    </div>
                  </div>

                  {profilGreska && (
                    <p className="profile-error-message">
                      {profilGreska}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {uploadStatus && (
          <div
            className="upload-window"
            role="status"
            aria-live="polite"
          >
            <div className="upload-window-header">
              <div className="upload-window-title">
                <span>Otpremanje fajla</span>
                <strong title={uploadStatus.name}>
                  {uploadStatus.name}
                </strong>
              </div>

              <span className="upload-file-counter">
                {uploadStatus.ukupanBroj > 1
                  ? `Fajl ${uploadStatus.redniBroj} od ${uploadStatus.ukupanBroj}`
                  : "Storio upload"}
              </span>
            </div>

            <div className="upload-window-main">
              <div
                className="upload-progress-ring"
                style={{
                  "--upload-progress": `${uploadStatus.procenat * 3.6}deg`,
                }}
              >
                <div className="upload-progress-ring-inner">
                  <strong>{uploadStatus.procenat}%</strong>
                  <span>završeno</span>
                </div>
              </div>

              <div className="upload-window-info">
                <div className="upload-live-status">
                  <span className="upload-live-dot" />
                  <span>{uploadStatus.statusTekst}</span>
                </div>

                <div className="upload-stats-grid">
                  <div className="upload-stat">
                    <span>Preostalo vreme</span>
                    <strong>
                      {formatVremena(uploadStatus.preostaloSekundi)}
                    </strong>
                  </div>

                  <div className="upload-stat">
                    <span>Brzina</span>
                    <strong>
                      {uploadStatus.brzinaBps > 0
                        ? `${formatVelicine(uploadStatus.brzinaBps)}/s`
                        : "Računam..."}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <div className="upload-linear-progress">
              <div
                className="upload-linear-progress-used"
                style={{ width: `${uploadStatus.procenat}%` }}
              />
            </div>

            <div className="upload-transfer-footer">
              <span>
                {formatVelicine(uploadStatus.poslato)} od{" "}
                {formatVelicine(uploadStatus.ukupno)}
              </span>

              <span>
                {uploadStatus.nastavljen
                  ? "Nastavljeni upload"
                  : "Sigurno se čuva na serveru"}
              </span>
            </div>
          </div>
        )}

        <div className="drive-content">
          {aktivnaSekcija === "Moj Disk" && (
            <div className="folder-breadcrumbs" aria-label="Putanja foldera">
              <button
                className={currentFolderId === null ? "current" : ""}
                onClick={() => idiUFolder(null)}
              >
                Moj Disk
              </button>

              {breadcrumbs.map((crumb, index) => {
                const poslednji = index === breadcrumbs.length - 1;

                return (
                  <span className="breadcrumb-part" key={crumb.folder_id}>
                    <span className="breadcrumb-separator">›</span>
                    <button
                      className={poslednji ? "current" : ""}
                      disabled={poslednji}
                      onClick={() => idiUFolder(crumb.folder_id)}
                    >
                      {crumb.name}
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div className="content-heading">
            <div>
              <h1>{naslovStranice}</h1>
              {aktivnaSekcija === "Moj Disk" && (
                <p>
                  {currentFolder
                    ? "Folderi i fajlovi unutar ovog foldera."
                    : "Tvoji fajlovi i folderi na jednom mestu."}
                </p>
              )}
            </div>
          </div>

          {greska && <div className="error-banner">{greska}</div>}

          {ucitavanje ? (
            <div className="empty-drive">
              <div className="empty-drive-logo">Storio</div>
              <h2>Učitavanje...</h2>
            </div>
          ) : (
            <>
              {prikazaniFolderi.length > 0 && (
                <section className="storage-section">
                  <div className="section-heading">
                    <h2>Folderi</h2>
                  </div>

                  <div className="folders-grid">
                    {prikazaniFolderi.map((folder) => (
                      <div
                        key={folder.folder_id}
                        className="folder-card"
                        role="button"
                        tabIndex={0}
                        onDoubleClick={() => {
                          if (aktivnaSekcija !== "Otpad") {
                            otvoriFolder(folder);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            aktivnaSekcija !== "Otpad"
                          ) {
                            otvoriFolder(folder);
                          }
                        }}
                      >
                        <div
                          className="folder-card-main"
                          onClick={() => {
                            if (aktivnaSekcija !== "Otpad") {
                              otvoriFolder(folder);
                            }
                          }}
                        >
                          <span className="folder-symbol" aria-hidden="true" />

                          <span className="folder-name">
                            <span>
                              {folder.name}
                              {folder.is_starred && !folder.shared && (
                                <span className="star-indicator">★</span>
                              )}
                            </span>

                            {folder.shared && folder.shared_by_username && (
                              <small className="shared-by-label">
                                Podelio: {folder.shared_by_username}
                              </small>
                            )}
                          </span>
                        </div>

                        <div
                          className="folder-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="folder-menu-button"
                            aria-label="Opcije foldera"
                            onClick={() => {
                              setOtvorenMeniFajla(null);
                              setOtvorenMeniFoldera((trenutni) =>
                                trenutni === folder.folder_id
                                  ? null
                                  : folder.folder_id
                              );
                            }}
                          >
                            ⋮
                          </button>

                          {otvorenMeniFoldera === folder.folder_id && (
                            <div className="file-dropdown folder-dropdown">
                              {aktivnaSekcija === "Deljeno sa mnom" ? (
                                <>
                                  <button onClick={() => otvoriFolder(folder)}>
                                    Otvori
                                  </button>

                                  <button
                                    onClick={() => {
                                      setFolderZaDetalje(folder);
                                      setOtvorenMeniFoldera(null);
                                    }}
                                  >
                                    Detalji
                                  </button>
                                </>
                              ) : aktivnaSekcija === "Otpad" ? (
                                <>
                                  <button
                                    onClick={() => vratiFolderIzOtpada(folder)}
                                  >
                                    Vrati
                                  </button>

                                  <button
                                    onClick={() => {
                                      setFolderZaDetalje(folder);
                                      setOtvorenMeniFoldera(null);
                                    }}
                                  >
                                    Detalji
                                  </button>

                                  <div className="file-dropdown-separator" />

                                  <button
                                    className="delete-file-action"
                                    onClick={() => trajnoObrisiFolder(folder)}
                                  >
                                    Trajno obriši
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button onClick={() => otvoriFolder(folder)}>
                                    Otvori
                                  </button>

                                  <button
                                    onClick={() =>
                                      otvoriPreimenovanjeFoldera(folder)
                                    }
                                  >
                                    Preimenuj
                                  </button>

                                  <button
                                    onClick={() => otvoriDeljenjeFoldera(folder)}
                                  >
                                    Deli
                                  </button>

                                  <button
                                    onClick={() => toggleFolderZvezdica(folder)}
                                  >
                                    {folder.is_starred
                                      ? "Ukloni iz zvezdica"
                                      : "Dodaj u zvezdice"}
                                  </button>

                                  <button
                                    onClick={() => kopirajNazivFoldera(folder)}
                                  >
                                    Kopiraj naziv
                                  </button>

                                  <button
                                    onClick={() => {
                                      setFolderZaDetalje(folder);
                                      setOtvorenMeniFoldera(null);
                                    }}
                                  >
                                    Detalji
                                  </button>

                                  <div className="file-dropdown-separator" />

                                  <button
                                    className="delete-file-action"
                                    onClick={() => premestiFolderUOtpad(folder)}
                                  >
                                    Obriši
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {prikazaniFajlovi.length > 0 && (
                <section className="storage-section files-section">
                  <div className="section-heading">
                    <h2>Fajlovi</h2>
                  </div>

                  <div className="files-list">
                    <div className="files-header">
                      <span>Ime</span>
                      <span>Tip</span>
                      <span>Veličina</span>
                      <span></span>
                    </div>

                    {prikazaniFajlovi.map((fajl) => {
                      const info = getFileInfo(fajl);

                      return (
                        <div
                          key={fajl.file_id}
                          className="file-row"
                          onDoubleClick={() => otvoriFajl(fajl)}
                        >
                          <div className="file-name-wrapper">
                            <div className={`file-icon file-${info.klasa}`}>
                              {info.oznaka}
                            </div>

                            <span className="file-visible-name">
                              <span>
                                {fajl.name}
                                {fajl.is_starred && !fajl.shared && (
                                  <span className="star-indicator">★</span>
                                )}
                              </span>

                              {fajl.shared && fajl.shared_by_username && (
                                <small className="shared-by-label">
                                  Podelio: {fajl.shared_by_username}
                                </small>
                              )}
                            </span>
                          </div>

                          <span className="file-type">{info.naziv}</span>
                          <span className="file-size">
                            {formatVelicine(fajl.size)}
                          </span>

                          <div
                            className="file-actions"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              className="file-menu"
                              aria-label="Opcije fajla"
                              onClick={() => {
                                setOtvorenMeniFoldera(null);
                                setOtvorenMeniFajla((trenutni) =>
                                  trenutni === fajl.file_id
                                    ? null
                                    : fajl.file_id
                                );
                              }}
                            >
                              ⋮
                            </button>

                            {otvorenMeniFajla === fajl.file_id && (
                              <div className="file-dropdown">
                                {aktivnaSekcija === "Deljeno sa mnom" ? (
                                  <>
                                    <button onClick={() => otvoriFajl(fajl)}>
                                      Otvori
                                    </button>
                                    <button onClick={() => preuzmiFajl(fajl)}>
                                      Preuzmi
                                    </button>
                                    <button
                                      onClick={() => {
                                        setFajlZaDetalje(fajl);
                                        setOtvorenMeniFajla(null);
                                      }}
                                    >
                                      Detalji
                                    </button>
                                  </>
                                ) : aktivnaSekcija === "Otpad" ? (
                                  <>
                                    <button onClick={() => vratiIzOtpada(fajl)}>
                                      Vrati
                                    </button>
                                    <button onClick={() => preuzmiFajl(fajl)}>
                                      Preuzmi
                                    </button>
                                    <button
                                      onClick={() => {
                                        setFajlZaDetalje(fajl);
                                        setOtvorenMeniFajla(null);
                                      }}
                                    >
                                      Detalji
                                    </button>
                                    <div className="file-dropdown-separator" />
                                    <button
                                      className="delete-file-action"
                                      onClick={() => trajnoObrisiFajl(fajl)}
                                    >
                                      Trajno obriši
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => otvoriFajl(fajl)}>
                                      Otvori
                                    </button>
                                    <button onClick={() => preuzmiFajl(fajl)}>
                                      Preuzmi
                                    </button>
                                    <button
                                      onClick={() => otvoriPreimenovanje(fajl)}
                                    >
                                      Preimenuj
                                    </button>
                                    <button onClick={() => otvoriDeljenjeFajla(fajl)}>
                                      Deli
                                    </button>
                                    <button onClick={() => toggleZvezdica(fajl)}>
                                      {fajl.is_starred
                                        ? "Ukloni iz zvezdica"
                                        : "Dodaj u zvezdice"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setFajlZaDetalje(fajl);
                                        setOtvorenMeniFajla(null);
                                      }}
                                    >
                                      Detalji
                                    </button>
                                    <div className="file-dropdown-separator" />
                                    <button
                                      className="delete-file-action"
                                      onClick={() => premestiUOtpad(fajl)}
                                    >
                                      Obriši
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {prikazaniFolderi.length === 0 &&
                prikazaniFajlovi.length === 0 && (
                  <div className="empty-drive">
                    <div className="empty-drive-logo">Storio</div>
                    <h2>{emptyText.naslov}</h2>
                    <p>{emptyText.tekst}</p>
                  </div>
                )}
            </>
          )}
        </div>
      </main>

      {prikaziFolderModal && (
        <div
          className="modal-overlay"
          onMouseDown={() => {
            setPrikaziFolderModal(false);
            setNovoImeFoldera("");
          }}
        >
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Novi folder</h3>

            <form onSubmit={kreirajFolder}>
              <input
                type="text"
                placeholder="Naziv foldera"
                value={novoImeFoldera}
                onChange={(e) => setNovoImeFoldera(e.target.value)}
                autoFocus
              />

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => {
                    setPrikaziFolderModal(false);
                    setNovoImeFoldera("");
                  }}
                >
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

      {folderZaPreimenovanje && (
        <div
          className="modal-overlay"
          onMouseDown={() => {
            setFolderZaPreimenovanje(null);
            setNovoImeFolderaRename("");
          }}
        >
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Preimenuj folder</h3>

            <form onSubmit={preimenujFolder}>
              <input
                type="text"
                value={novoImeFolderaRename}
                onChange={(e) => setNovoImeFolderaRename(e.target.value)}
                autoFocus
              />

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => {
                    setFolderZaPreimenovanje(null);
                    setNovoImeFolderaRename("");
                  }}
                >
                  Otkaži
                </button>

                <button type="submit" className="modal-submit-btn">
                  Sačuvaj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {fajlZaPreimenovanje && (
        <div
          className="modal-overlay"
          onMouseDown={() => {
            setFajlZaPreimenovanje(null);
            setNovoImeFajla("");
          }}
        >
          <div className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
            <h3>Preimenuj fajl</h3>

            <form onSubmit={preimenujFajl}>
              <input
                type="text"
                value={novoImeFajla}
                onChange={(e) => setNovoImeFajla(e.target.value)}
                autoFocus
              />

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-cancel-btn"
                  onClick={() => {
                    setFajlZaPreimenovanje(null);
                    setNovoImeFajla("");
                  }}
                >
                  Otkaži
                </button>

                <button type="submit" className="modal-submit-btn">
                  Sačuvaj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {folderZaDetalje && (
        <div
          className="modal-overlay"
          onMouseDown={() => setFolderZaDetalje(null)}
        >
          <div
            className="modal-card details-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3>Detalji foldera</h3>

            <div className="details-list">
              <div className="details-row">
                <span>Naziv</span>
                <strong>{folderZaDetalje.name}</strong>
              </div>

              <div className="details-row">
                <span>Lokacija</span>
                <strong>
                  {folderZaDetalje.parent_id ? "Podfolder" : "Moj Disk"}
                </strong>
              </div>

              <div className="details-row">
                <span>Zvezdica</span>
                <strong>{folderZaDetalje.is_starred ? "Da" : "Ne"}</strong>
              </div>

              <div className="details-row">
                <span>Kreirano</span>
                <strong>{formatDatuma(folderZaDetalje.created_at)}</strong>
              </div>

              <div className="details-row">
                <span>Izmenjeno</span>
                <strong>{formatDatuma(folderZaDetalje.updated_at)}</strong>
              </div>
            </div>

            <div className="modal-actions details-actions">
              <button
                type="button"
                className="modal-submit-btn"
                onClick={() => setFolderZaDetalje(null)}
              >
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}

      {fajlZaDetalje && (
        <div
          className="modal-overlay"
          onMouseDown={() => setFajlZaDetalje(null)}
        >
          <div
            className="modal-card details-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3>Detalji</h3>

            <div className="details-list">
              <div className="details-row">
                <span>Naziv</span>
                <strong>{fajlZaDetalje.name}</strong>
              </div>

              <div className="details-row">
                <span>Tip</span>
                <strong>{getFileInfo(fajlZaDetalje).naziv}</strong>
              </div>

              <div className="details-row">
                <span>Veličina</span>
                <strong>{formatVelicine(fajlZaDetalje.size)}</strong>
              </div>

              <div className="details-row">
                <span>MIME tip</span>
                <strong>{fajlZaDetalje.type || "Nepoznat"}</strong>
              </div>

              <div className="details-row">
                <span>Dodato</span>
                <strong>{formatDatuma(fajlZaDetalje.created_at)}</strong>
              </div>
            </div>

            <div className="modal-actions details-actions">
              <button
                type="button"
                className="modal-submit-btn"
                onClick={() => setFajlZaDetalje(null)}
              >
                Zatvori
              </button>
            </div>
          </div>
        </div>
      )}

      {stavkaZaDeljenje && (
        <div
          className="share-modal-overlay"
          onMouseDown={zatvoriDeljenje}
        >
          <div
            className="share-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="share-modal-header">
              <div>
                <span className="share-kicker">STORIO DELJENJE</span>
                <h3>
                  Deli {stavkaZaDeljenje.tip === "folder" ? "folder" : "fajl"}
                </h3>
              </div>

              <button
                type="button"
                className="share-modal-close"
                onClick={zatvoriDeljenje}
                disabled={deljenjeUToku}
                aria-label="Zatvori"
              >
                ×
              </button>
            </div>

            <div className="share-item-preview">
              <span
                className={
                  stavkaZaDeljenje.tip === "folder"
                    ? "share-item-icon share-folder-icon"
                    : "share-item-icon"
                }
              >
                {stavkaZaDeljenje.tip === "folder" ? "▰" : "FILE"}
              </span>

              <div>
                <strong>{stavkaZaDeljenje.naziv}</strong>
                <small>
                  Pristup dobija samo postojeći Storio korisnik.
                </small>
              </div>
            </div>

            <form onSubmit={podeliNaStorio}>
              <label className="share-recipient-label">
                <span>Korisničko ime ili email</span>
                <input
                  type="text"
                  value={primalacDeljenja}
                  onChange={(e) => {
                    setPrimalacDeljenja(e.target.value);
                    setDeljenjeGreska("");
                    setDeljenjeUspeh("");
                  }}
                  placeholder="npr. korisnik ili korisnik@gmail.com"
                  autoFocus
                />
              </label>

              {deljenjeGreska && (
                <p className="share-message share-error">
                  {deljenjeGreska}
                </p>
              )}

              {deljenjeUspeh && (
                <p className="share-message share-success">
                  {deljenjeUspeh}
                </p>
              )}

              <div className="share-modal-actions">
                <button
                  type="button"
                  className="share-cancel-btn"
                  onClick={zatvoriDeljenje}
                  disabled={deljenjeUToku}
                >
                  Poništi
                </button>

                <button
                  type="submit"
                  className="share-submit-btn"
                  disabled={
                    deljenjeUToku ||
                    !primalacDeljenja.trim()
                  }
                >
                  {deljenjeUToku ? "Delim..." : "Podeli"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {prikaziUsernameModal && (
        <div
          className="profile-modal-overlay"
          onMouseDown={() => {
            if (!profilUToku) {
              setPrikaziUsernameModal(false);
              setProfilGreska("");
            }
          }}
        >
          <div
            className="profile-username-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="profile-kicker">STORIO PROFIL</span>
            <h3>Promeni korisničko ime</h3>
            <p>
              Novo korisničko ime će se odmah prikazati na tvom nalogu.
            </p>

            <form onSubmit={sacuvajKorisnickoIme}>
              <label>
                <span>Korisničko ime</span>
                <input
                  type="text"
                  value={novoKorisnickoIme}
                  onChange={(e) => setNovoKorisnickoIme(e.target.value)}
                  minLength={3}
                  maxLength={50}
                  autoFocus
                />
              </label>

              {profilGreska && (
                <p className="profile-error-message">
                  {profilGreska}
                </p>
              )}

              <div className="profile-modal-actions">
                <button
                  type="button"
                  className="profile-modal-cancel"
                  disabled={profilUToku}
                  onClick={() => {
                    setPrikaziUsernameModal(false);
                    setProfilGreska("");
                  }}
                >
                  Poništi
                </button>

                <button
                  type="submit"
                  className="profile-modal-save"
                  disabled={
                    profilUToku ||
                    novoKorisnickoIme.trim().length < 3
                  }
                >
                  {profilUToku ? "Čuvam..." : "Sačuvaj"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {prikaziPodesavanja && (
        <div
          className="settings-overlay"
          onMouseDown={() => setPrikaziPodesavanja(false)}
        >
          <section
            className="settings-panel"
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Podešavanja"
          >
            <div className="settings-header">
              <div>
                <span className="settings-kicker">Storio</span>
                <h2>Podešavanja</h2>
              </div>

              <button
                type="button"
                className="settings-close-btn"
                aria-label="Zatvori podešavanja"
                onClick={() => setPrikaziPodesavanja(false)}
              >
                ×
              </button>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <div>
                  <h3>Izgled</h3>
                  <p>Izaberi izgled koji ti više odgovara.</p>
                </div>
              </div>

              <div className="theme-choice">
                <button
                  type="button"
                  className={`theme-choice-btn ${
                    tema === "light" ? "active" : ""
                  }`}
                  onClick={() => setTema("light")}
                >
                  <span className="theme-choice-icon">☀</span>
                  <span>
                    <strong>Svetli</strong>
                    <small>Klasični Storio izgled</small>
                  </span>
                </button>

                <button
                  type="button"
                  className={`theme-choice-btn ${
                    tema === "dark" ? "active" : ""
                  }`}
                  onClick={() => setTema("dark")}
                >
                  <span className="theme-choice-icon">☾</span>
                  <span>
                    <strong>Tamni</strong>
                    <small>Prijatniji za rad uveče</small>
                  </span>
                </button>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <div>
                  <h3>Nalog</h3>
                  <p>Podaci trenutno prijavljenog korisnika.</p>
                </div>
              </div>

              <div className="account-card">
                <div className="settings-avatar">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Profilna slika"
                      className="settings-profile-image"
                    />
                  ) : (
                    avatarSlovo
                  )}
                </div>

                <div className="account-card-main">
                  <strong>
                    {profil?.username ||
                      korisnik?.username ||
                      "Storio korisnik"}
                  </strong>
                  <span>
                    {profil?.email ||
                      korisnik?.email ||
                      "Email nije dostupan"}
                  </span>
                </div>

                <span className="verified-badge">✓ Verifikovan</span>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <div>
                  <h3>Storage</h3>
                  <p>Pregled trenutno zauzetog prostora.</p>
                </div>
              </div>

              <div className="settings-storage-card">
                <div className="settings-storage-numbers">
                  <strong>{formatVelicine(storage.used_bytes)}</strong>
                  <span>od {formatVelicine(storage.limit_bytes)}</span>
                </div>

                <div className="settings-storage-progress">
                  <div
                    className="settings-storage-progress-used"
                    style={{ width: `${procenatStoragea}%` }}
                  />
                </div>

                <small>{procenatStoragea.toFixed(1)}% iskorišćeno</small>
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-heading">
                <div>
                  <h3>Bezbednost</h3>
                  <p>Upravljaj lozinkom i aktivnim prijavama na nalogu.</p>
                </div>
              </div>

              <div className="settings-security-actions">
                <button
                  type="button"
                  className="settings-security-btn"
                  disabled={resetLozinkaUToku || odjavaSvudaUToku}
                  onClick={posaljiLinkZaPromenuLozinke}
                >
                  {resetLozinkaUToku
                    ? "Šaljem link..."
                    : "Pošalji link za promenu lozinke"}
                </button>

                <button
                  type="button"
                  className="settings-logout-all-btn"
                  disabled={resetLozinkaUToku || odjavaSvudaUToku}
                  onClick={odjaviSaSvihUredjaja}
                >
                  {odjavaSvudaUToku
                    ? "Odjavljujem..."
                    : "Odjavi me sa svih uređaja"}
                </button>
              </div>

              <p className="settings-security-note">
                Ova opcija prekida sve aktivne Storio sesije i traži novu prijavu.
              </p>

              {resetLozinkaStatus && (
                <p className="settings-status-message">
                  {resetLozinkaStatus}
                </p>
              )}
            </div>

            <div className="settings-section settings-danger-section">
              <div className="settings-section-heading">
                <div>
                  <h3>Opasna zona</h3>
                  <p>
                    Brisanje naloga je trajno. Svi tvoji fajlovi, folderi i
                    podaci biće nepovratno obrisani.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="settings-delete-account-btn"
                onClick={() => {
                  setBrisanjeNalogaGreska("");
                  setPotvrdaBrisanja("");
                  setPrikaziPodesavanja(false);
                  setPrikaziBrisanjeNaloga(true);
                }}
              >
                Obriši nalog
              </button>
            </div>
          </section>
        </div>
      )}

      {prikaziBrisanjeNaloga && (
        <div
          className="delete-account-overlay"
          onMouseDown={zatvoriBrisanjeNaloga}
        >
          <div
            className="delete-account-modal"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
          >
            <div className="delete-account-icon">!</div>

            <h3 id="delete-account-title">Obriši Storio nalog?</h3>

            <p className="delete-account-warning">
              Ova radnja se ne može poništiti. Nalog, fajlovi, folderi i svi
              podaci povezani sa nalogom biće trajno obrisani.
            </p>

            <form onSubmit={obrisiNalog}>
              <label className="delete-account-field">
                <span>Za potvrdu upiši OBRISI</span>
                <input
                  type="text"
                  value={potvrdaBrisanja}
                  onChange={(e) => setPotvrdaBrisanja(e.target.value)}
                  placeholder="OBRISI"
                  autoComplete="off"
                  autoFocus
                />
              </label>

              {brisanjeNalogaGreska && (
                <p className="delete-account-error">
                  {brisanjeNalogaGreska}
                </p>
              )}

              <div className="delete-account-actions">
                <button
                  type="button"
                  className="delete-account-cancel-btn"
                  onClick={zatvoriBrisanjeNaloga}
                  disabled={brisanjeNalogaUToku}
                >
                  Otkaži
                </button>

                <button
                  type="submit"
                  className="delete-account-confirm-btn"
                  disabled={
                    brisanjeNalogaUToku ||
                    potvrdaBrisanja.trim() !== "OBRISI"
                  }
                >
                  {brisanjeNalogaUToku
                    ? "Brišem nalog..."
                    : "Trajno obriši nalog"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
