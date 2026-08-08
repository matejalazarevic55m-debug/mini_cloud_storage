import { useState } from "react";

import Home from "./pages/home";
import Login from "./pages/login";
import Register from "./pages/register";
import Dashboard from "./pages/dashboard";
import ResetPassword from "./pages/resetPassword";

export default function App() {
  const [stranica, setStranica] = useState("home");

  const isResetPassword =
    window.location.pathname === "/reset-password";

  if (isResetPassword) {
    return (
      <ResetPassword
        naLogin={() => {
          window.history.replaceState({}, "", "/");
          setStranica("login");
        }}
      />
    );
  }

  return (
    <>
      {stranica === "home" && (
        <Home
          naLogin={() => setStranica("login")}
        />
      )}

      {stranica === "login" && (
        <Login
          naPocetnu={() => setStranica("home")}
          naRegistraciju={() =>
            setStranica("register")
          }
          naUspesanLogin={() =>
            setStranica("dashboard")
          }
        />
      )}

      {stranica === "register" && (
        <Register
          naLogin={() => setStranica("login")}
          naPocetnu={() => setStranica("home")}
        />
      )}

      {stranica === "dashboard" && (
        <Dashboard
          naOdjavu={() => setStranica("home")}
        />
      )}
    </>
  );
}