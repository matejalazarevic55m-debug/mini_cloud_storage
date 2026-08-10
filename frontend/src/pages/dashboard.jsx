import { useEffect, useMemo, useRef, useState } from "react";
import "./dashboard.css";

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

  if (sekcija === "Moj Disk") {
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
    sekcija === "Moj Disk" &&
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

  const [fajlZaPreimenovanje, setFajlZaPreimenovanje] = useState(null);
  const [novoImeFajla, setNovoImeFajla] = useState("");
  const [fajlZaDetalje, setFajlZaDetalje] = useState(null);

  const [folderZaPreimenovanje, setFolderZaPreimenovanje] = useState(null);
  const [novoImeFolderaRename, setNovoImeFolderaRename] = useState("");
  const [folderZaDetalje, setFolderZaDetalje] = useState(null);

  const fileInputRef = useRef(null);
  const zipInputRef = useRef(null);

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

  const osveziStorage = async () => {
    const response = await api("/storage/usage");
    const usage = await response.json();
    setStorage(usage);
  };

  const ucitajPodatke = async (folderId, sekcija) => {
    try {
      setGreska("");
      setUcitavanje(true);

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
    ucitajPodatke(currentFolderId, aktivnaSekcija);
  }, [currentFolderId, aktivnaSekcija]);

  const osveziTrenutniPrikaz = async () => {
    await ucitajPodatke(currentFolderId, aktivnaSekcija);
  };

  const zatvoriMenije = () => {
    setPrikaziNoviMeni(false);
    setOtvorenMeniFajla(null);
    setOtvorenMeniFoldera(null);
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

    setAktivnaSekcija("Moj Disk");
    setCurrentFolderId(folder.folder_id);
    setPretraga("");
    zatvoriMenije();

    sacuvajDashboardNavigaciju(
      "Moj Disk",
      folder.folder_id
    );
  };

  const idiUFolder = (folderId) => {
    if (
      aktivnaSekcija === "Moj Disk" &&
      currentFolderId === folderId
    ) {
      zatvoriMenije();
      return;
    }

    setAktivnaSekcija("Moj Disk");
    setCurrentFolderId(folderId);
    setPretraga("");
    zatvoriMenije();

    sacuvajDashboardNavigaciju(
      "Moj Disk",
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
    link.href = `${API_URL}/files/${fajl.file_id}/download`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setOtvorenMeniFajla(null);
  };

  const otvoriFajl = (fajl) => {
    window.open(
      `${API_URL}/files/${fajl.file_id}/content`,
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

  const podeliFajl = async (fajl) => {
    try {
      const blob = await fetchFileBlob(fajl);
      const shareFile = new window.File([blob], fajl.name, {
        type: fajl.type || blob.type || "application/octet-stream",
      });

      if (
        navigator.share &&
        (!navigator.canShare || navigator.canShare({ files: [shareFile] }))
      ) {
        await navigator.share({
          title: fajl.name,
          files: [shareFile],
        });
      } else {
        alert(
          "Browser ne podržava direktno deljenje fajla. Storio link za deljenje možemo dodati kao sledeću backend funkciju."
        );
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        alert(error.message || "Deljenje nije uspelo.");
      }
    } finally {
      setOtvorenMeniFajla(null);
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
  // FILTERI
  // ---------------------------------------------------------

  const prikazaniFolderi = useMemo(() => {
    const query = pretraga.trim().toLowerCase();
    let rezultat = [...folderi];

    if (aktivnaSekcija === "Deljeno sa mnom") return [];

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

    if (aktivnaSekcija === "Deljeno sa mnom") return [];

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
        tekst: "Pravo Storio deljenje dodaćemo kao sledeću backend funkciju.",
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
    korisnik?.username?.charAt(0)?.toUpperCase() ||
    korisnik?.email?.charAt(0)?.toUpperCase() ||
    "S";

  const naslovStranice =
    aktivnaSekcija === "Moj Disk" && currentFolder
      ? currentFolder.name
      : aktivnaSekcija;

  return (
    <div
      className="dashboard-container"
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
          <button className="logout-btn" onClick={naOdjavu}>
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
            <button className="header-icon-btn">?</button>
            <button className="header-icon-btn">⚙</button>
            <div className="user-profile">{avatarSlovo}</div>
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
                            {folder.name}
                            {folder.is_starred && (
                              <span className="star-indicator">★</span>
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
                              {aktivnaSekcija === "Otpad" ? (
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
                              {fajl.name}
                              {fajl.is_starred && (
                                <span className="star-indicator">★</span>
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
                                {aktivnaSekcija === "Otpad" ? (
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
                                    <button onClick={() => podeliFajl(fajl)}>
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
    </div>
  );
}
