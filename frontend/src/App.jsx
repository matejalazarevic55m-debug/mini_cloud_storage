import { useEffect, useState } from "react";

import Home from "./pages/home";
import Login from "./pages/login";
import Register from "./pages/register";
import Dashboard from "./pages/dashboard";
import ResetPassword from "./pages/resetPassword";

const API_URL =
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

export default function App() {
  const [stranica, setStranica] =
    useState("home");

  const [korisnik, setKorisnik] =
    useState(null);

  const [proveraSesije, setProveraSesije] =
    useState(true);

  const isResetPassword =
    window.location.pathname ===
    "/reset-password";

  useEffect(() => {
    if (isResetPassword) {
      setProveraSesije(false);
      return;
    }

    const proveriSesiju = async () => {
      try {
        const response = await fetch(
          `${API_URL}/auth/me`,
          {
            method: "GET",
            credentials: "include",
          }
        );

        if (!response.ok) {
          setKorisnik(null);
          setStranica("home");
          return;
        }

        const data = await response.json();

        setKorisnik(data.user);
        setStranica("dashboard");
      } catch (error) {
        console.error(
          "Greška pri proveri sesije:",
          error
        );

        setKorisnik(null);
        setStranica("home");
      } finally {
        setProveraSesije(false);
      }
    };

    proveriSesiju();
  }, []);

  const uspesanLogin = (user) => {
    setKorisnik(user);
    setStranica("dashboard");
  };

  const odjava = async () => {
    try {
      await fetch(
        `${API_URL}/auth/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );
    } catch (error) {
      console.error(
        "Greška pri odjavi:",
        error
      );
    } finally {
      setKorisnik(null);
      setStranica("home");
    }
  };

  if (proveraSesije) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Učitavanje...
      </div>
    );
  }

  if (isResetPassword) {
    return (
      <ResetPassword
        naLogin={() => {
          window.history.replaceState(
            {},
            "",
            "/"
          );

          setStranica("login");
        }}
      />
    );
  }

  return (
    <>
      {stranica === "home" && (
        <Home
          naLogin={() =>
            setStranica("login")
          }
        />
      )}

      {stranica === "login" && (
        <Login
          naPocetnu={() =>
            setStranica("home")
          }
          naRegistraciju={() =>
            setStranica("register")
          }
          naUspesanLogin={uspesanLogin}
        />
      )}

      {stranica === "register" && (
        <Register
          naLogin={() =>
            setStranica("login")
          }
          naPocetnu={() =>
            setStranica("home")
          }
        />
      )}

      {stranica === "dashboard" &&
        korisnik && (
          <Dashboard
            korisnik={korisnik}
            naOdjavu={odjava}
          />
        )}
    </>
  );
}