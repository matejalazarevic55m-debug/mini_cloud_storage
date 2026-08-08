import { useState } from "react";
import "./register.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function Register({ naLogin, naPocetnu }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const hendlujRegistraciju = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Provera username-a
    if (cleanUsername.length < 3) {
      setError(
        "Korisničko ime mora imati najmanje 3 karaktera."
      );
      return;
    }

    // Provera lozinke
    if (password.length < 8) {
      setError(
        "Lozinka mora imati najmanje 8 karaktera."
      );
      return;
    }

    // Provera ponovljene lozinke
    if (password !== confirmPassword) {
      setError("Lozinke se ne poklapaju.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/auth/register`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            username: cleanUsername,
            email: cleanEmail,
            password,
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
        let poruka = "Registracija nije uspela.";

        if (Array.isArray(data.detail)) {
          poruka =
            data.detail[0]?.msg ||
            "Proveri unete podatke.";
        } else if (typeof data.detail === "string") {
          poruka = data.detail;
        }

        throw new Error(poruka);
      }

      setSuccess(
        data.message ||
          "Nalog je uspešno kreiran. Proveri svoj mejl i verifikuj nalog."
      );

      // Brišemo polja nakon uspešne registracije
      setUsername("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("Greška pri registraciji:", err);

      if (err instanceof TypeError) {
        setError(
          "Nije moguće povezati se sa serverom. Pokušaj ponovo."
        );
      } else {
        setError(
          err.message ||
            "Došlo je do greške. Pokušaj ponovo."
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="register-container">
      <button
        type="button"
        className="back-home-button"
        onClick={naPocetnu}
      >
        ← Nazad na početnu
      </button>

      <div className="register-card">
        <h1 className="register-title">
          Storio
        </h1>

        {success ? (
          <div className="verification-sent">
            <div className="verification-sent-icon">
              ✓
            </div>

            <h2>Proveri svoj mejl</h2>

            <p>{success}</p>

            <p className="verification-note">
              Otvori poruku koju je poslao Storio i
              klikni na dugme „Verifikuj nalog“.
            </p>

            <button
              type="button"
              className="submit-register-button"
              onClick={naLogin}
            >
              Idi na prijavu
            </button>
          </div>
        ) : (
          <>
            <p className="register-subtitle">
              Kreiraj svoj novi nalog
            </p>

            <form
              onSubmit={hendlujRegistraciju}
              className="register-form"
            >
              <div className="input-group">
                <label htmlFor="username">
                  Korisničko ime
                </label>

                <input
                  id="username"
                  type="text"
                  placeholder="izaberi korisničko ime"
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value)
                  }
                  minLength={3}
                  maxLength={50}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="email">
                  Email adresa
                </label>

                <input
                  id="email"
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
                <label htmlFor="password">
                  Lozinka
                </label>

                <input
                  id="password"
                  type="password"
                  placeholder="najmanje 8 karaktera"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="confirmPassword">
                  Potvrdi lozinku
                </label>

                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="ponovi lozinku"
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(
                      e.target.value
                    )
                  }
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </div>

              {error && (
                <p
                  className="register-message error"
                  role="alert"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="submit-register-button"
                disabled={loading}
              >
                {loading
                  ? "Kreiranje naloga..."
                  : "Registruj me"}
              </button>
            </form>

            <div className="register-footer">
              <p>Već imate nalog?</p>

              <button
                type="button"
                className="login-redirect-button"
                onClick={naLogin}
              >
                Prijavi se
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}