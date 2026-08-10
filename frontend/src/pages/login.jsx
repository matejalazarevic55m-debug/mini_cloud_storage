import { useState } from "react";
import "./login.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function Login({
  naPocetnu,
  naRegistraciju,
  naUspesanLogin,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Forgot password
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");

  // LOGIN
  const hendlujLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    const cleanEmail = email.trim().toLowerCase();

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        credentials: "include",

        body: JSON.stringify({
          email: cleanEmail,
          password,
        }),
      });

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "Backend nije vratio ispravan odgovor."
        );
      }

      if (!response.ok) {
        let poruka = "Prijava nije uspela.";

        if (Array.isArray(data.detail)) {
          poruka =
            data.detail[0]?.msg ||
            "Proveri unete podatke.";
        } else if (typeof data.detail === "string") {
          poruka = data.detail;
        }

        throw new Error(poruka);
      }

      console.log(
        "Uspešno prijavljen korisnik:",
        data.user
      );

      // Na dashboard ide samo nakon uspešnog odgovora backenda
      naUspesanLogin(data.user);

    } catch (err) {
      console.error("Greška pri prijavi:", err);

      if (err instanceof TypeError) {
        setError(
          "Nije moguće povezati se sa serverom. Pokušaj ponovo."
        );
      } else {
        setError(
          err.message ||
            "Došlo je do greške pri prijavi."
        );
      }

    } finally {
      setLoading(false);
    }
  };

  // FORGOT PASSWORD
  const hendlujForgotPassword = async (e) => {
    e.preventDefault();

    setForgotError("");
    setForgotSuccess("");
    setForgotLoading(true);

    const cleanEmail =
      forgotEmail.trim().toLowerCase();

    try {
      const response = await fetch(
        `${API_URL}/auth/forgot-password`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            email: cleanEmail,
          }),
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "Backend nije vratio ispravan odgovor."
        );
      }

      if (!response.ok) {
        let poruka =
          "Nije moguće poslati zahtev za reset lozinke.";

        if (Array.isArray(data.detail)) {
          poruka =
            data.detail[0]?.msg ||
            "Proveri email adresu.";
        } else if (typeof data.detail === "string") {
          poruka = data.detail;
        }

        throw new Error(poruka);
      }

      setForgotSuccess(
        data.message ||
          "Ako nalog sa tom email adresom postoji, poslali smo link za promenu lozinke."
      );

    } catch (err) {
      console.error(
        "Greška pri resetovanju lozinke:",
        err
      );

      if (err instanceof TypeError) {
        setForgotError(
          "Nije moguće povezati se sa serverom. Pokušaj ponovo."
        );
      } else {
        setForgotError(
          err.message ||
            "Došlo je do greške. Pokušaj ponovo."
        );
      }

    } finally {
      setForgotLoading(false);
    }
  };

  const otvoriForgotPassword = () => {
    setForgotMode(true);

    // Ako je korisnik već uneo email u login,
    // automatski ga prebacujemo u reset formu.
    setForgotEmail(email);

    setForgotError("");
    setForgotSuccess("");
  };

  const nazadNaLogin = () => {
    setForgotMode(false);
    setForgotError("");
    setForgotSuccess("");
  };

  return (
    <main className="login-container">
      <button
        type="button"
        className="back-home-button"
        onClick={naPocetnu}
      >
        ← Nazad na početnu
      </button>

      <div className="login-card">
        <h1 className="login-title">
          Storio
        </h1>

        {!forgotMode ? (
          <>
            <p className="login-subtitle">
              Prijavi se na svoj nalog
            </p>

            <form
              onSubmit={hendlujLogin}
              className="login-form"
            >
              <div className="input-group">
                <label htmlFor="login-email">
                  Email adresa
                </label>

                <input
                  id="login-email"
                  type="email"
                  placeholder="unesi svoj email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  autoComplete="email"
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="login-password">
                  Lozinka
                </label>

                <input
                  id="login-password"
                  type="password"
                  placeholder="unesi lozinku"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="button"
                className="forgot-password-button"
                onClick={otvoriForgotPassword}
              >
                Zaboravili ste lozinku?
              </button>

              {error && (
                <p
                  className="login-message error"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="submit-login-button"
                disabled={loading}
              >
                {loading
                  ? "Prijavljivanje..."
                  : "Uloguj me"}
              </button>
            </form>

            <div className="login-footer">
              <p>Nemate nalog?</p>

              <button
                type="button"
                className="register-redirect-button"
                onClick={naRegistraciju}
              >
                Registruj se
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="login-subtitle">
              Resetovanje lozinke
            </p>

            {!forgotSuccess ? (
              <form
                onSubmit={hendlujForgotPassword}
                className="login-form"
              >
                <p className="forgot-password-info">
                  Unesite email adresu povezanu sa
                  vašim nalogom. Poslaćemo vam link za
                  postavljanje nove lozinke.
                </p>

                <div className="input-group">
                  <label htmlFor="forgot-email">
                    Email adresa
                  </label>

                  <input
                    id="forgot-email"
                    type="email"
                    placeholder="unesi svoj email"
                    value={forgotEmail}
                    onChange={(e) =>
                      setForgotEmail(e.target.value)
                    }
                    autoComplete="email"
                    required
                  />
                </div>

                {forgotError && (
                  <p
                    className="login-message error"
                    role="alert"
                  >
                    {forgotError}
                  </p>
                )}

                <button
                  type="submit"
                  className="submit-login-button"
                  disabled={forgotLoading}
                >
                  {forgotLoading
                    ? "Slanje..."
                    : "Pošalji reset link"}
                </button>

                <button
                  type="button"
                  className="back-to-login-button"
                  onClick={nazadNaLogin}
                >
                  ← Nazad na prijavu
                </button>
              </form>
            ) : (
              <div className="forgot-success">
                <div className="forgot-success-icon">
                  ✓
                </div>

                <h2>Proveri svoj mejl</h2>

                <p>
                  {forgotSuccess}
                </p>

                <p className="forgot-password-note">
                  Otvori poruku koju je poslao Storio
                  i klikni na dugme „Resetuj lozinku“.
                </p>

                <button
                  type="button"
                  className="submit-login-button"
                  onClick={nazadNaLogin}
                >
                  Nazad na prijavu
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}