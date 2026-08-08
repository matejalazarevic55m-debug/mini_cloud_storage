import { useState } from "react";
import "./resetPassword.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function ResetPassword({ naLogin }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");

  const hendlujReset = async (e) => {
    e.preventDefault();

    setError("");
    setSuccess("");

    if (!token) {
      setError("Reset link nije ispravan.");
      return;
    }

    if (password.length < 8) {
      setError("Lozinka mora imati najmanje 8 karaktera.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Lozinke se ne poklapaju.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/auth/reset-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token,
            new_password: password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "Promena lozinke nije uspela."
        );
      }

      setSuccess(
        data.message || "Lozinka je uspešno promenjena."
      );

      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err.message ||
          "Došlo je do greške prilikom promene lozinke."
      );
    } finally {
      setLoading(false);
    }
  };

  const idiNaLogin = () => {
    window.history.replaceState({}, "", "/");
    naLogin();
  };

  return (
    <main className="reset-password-container">
      <div className="reset-password-card">
        <h1 className="reset-password-title">
          Storio
        </h1>

        {success ? (
          <div className="reset-success">
            <div className="reset-success-icon">
              ✓
            </div>

            <h2>Lozinka je promenjena</h2>

            <p>{success}</p>

            <button
              type="button"
              className="reset-submit-button"
              onClick={idiNaLogin}
            >
              Prijavi se
            </button>
          </div>
        ) : (
          <>
            <p className="reset-password-subtitle">
              Postavi novu lozinku
            </p>

            <form
              className="reset-password-form"
              onSubmit={hendlujReset}
            >
              <div className="reset-input-group">
                <label htmlFor="new-password">
                  Nova lozinka
                </label>

                <input
                  id="new-password"
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

              <div className="reset-input-group">
                <label htmlFor="confirm-new-password">
                  Potvrdi novu lozinku
                </label>

                <input
                  id="confirm-new-password"
                  type="password"
                  placeholder="ponovi novu lozinku"
                  value={confirmPassword}
                  onChange={(e) =>
                    setConfirmPassword(e.target.value)
                  }
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </div>

              {error && (
                <p className="reset-message error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="reset-submit-button"
                disabled={loading}
              >
                {loading
                  ? "Čuvanje..."
                  : "Promeni lozinku"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}