import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

type Route = "splash" | "auth" | "scan" | "device" | "irrigate" | "history";
type Mode = "login" | "registro";
type RegistroStep = "form" | "verify";
type Toast = { id: number; text: string; type?: "success" | "error" | "info" };

export default function AuthView({
  goTo,
  setUser,
}: {
  goTo: (r: Route) => void;
  setUser?: (u: unknown) => void;
}) {
  const { login: setAuthed } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [registroStep, setRegistroStep] = useState<RegistroStep>("form");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const [regNombre, setRegNombre] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regCode, setRegCode] = useState("");
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState("");

  //intentos y bloqueo
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockUntil, setLockUntil] = useState<string | null>(null);

  function notify(text: string, type: Toast["type"] = "info") {
    setToast({ id: Date.now(), text, type });
  }

/* =======================
   LOGIN
======================= */
async function onLogin() {
  const email = loginEmail.trim();
  const pass = loginPass.trim();
  if (!email || !pass) return notify("Completa email y contraseña", "error");

  try {
    setBusy(true);

    const { token, user } = await api.login({ email, password: pass });

    // login OK → limpiamos contador de intentos
    setRemainingAttempts(null);

    setAuthed(token);
    setUser?.(user);
    notify("Sesión iniciada con éxito", "success");
    goTo("scan");
  } catch (e: any) {
  
    const code = e?.code || e?.message || "";

    
    if (typeof e?.remainingAttempts === "number") {
      setRemainingAttempts(e.remainingAttempts);
    }

    if (code === "CREDENCIALES_INVALIDAS") {
      if (e?.locked) {
        setRemainingAttempts(0);
        return notify(
          "Cuenta bloqueada por múltiples intentos. Intenta de nuevo en 15 minutos.",
          "error"
        );
      }

      return notify("Correo o contraseña incorrectos.", "error");
    }

    if (code === "CUENTA_BLOQUEADA") {
      setRemainingAttempts(0);
      return notify(
        "Cuenta bloqueda por múltiples intentos. Intenta de nuevo en 15 minutos.",
        "error"
      );
    }

    if (code === "CORREO_NO_VERIFICADO") {
      notify("Necesitas verificar tu correo primero.", "error");
      setMode("registro");
      setRegistroStep("verify");
      setPendingVerifyEmail(email);
      setRegEmail(email);
      return;
    }

    if (code === "USUARIO_INACTIVO") {
      return notify(
        "Tu usuario está desactivado. Contacta al administrador.",
        "error"
      );
    }

    notify("El correo electrónico o la contraseña son incorrectos.", "error");
  } finally {
    setBusy(false);
  }
}


  /* =======================
     VALIDACIÓN PASSWORD
  ======================= */
  function validarPassword(pass: string): boolean {
    const regex =
      /^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+{}\[\]:;<>,.?~\\/-])[A-Za-z\d!@#$%^&*()_+{}\[\]:;<>,.?~\\/-]{8}$/;
    return regex.test(pass);
  }

  /* =======================
     REGISTRO
  ======================= */
  async function onRegister() {
    if (busy) return;

    const nombre = regNombre.trim();
    const email = regEmail.trim().toLowerCase();
    const pass = regPass.trim();

    if (!email || !pass) {
      return notify("Email y contraseña requeridos.", "error");
    }

    if (!validarPassword(pass)) {
      return notify(
        "La contraseña debe tener 8 caracteres, con una mayúscula, un número y un signo.",
        "error"
      );
    }

    try {
      setBusy(true);
      await api.register({ name: nombre, email, password: pass });

      notify(
        "Cuenta creada. Te enviamos un código a tu correo para validar la cuenta.",
        "success"
      );

      setPendingVerifyEmail(email);
      setRegistroStep("verify");
    } catch (e: any) {
      notify(e?.message || "Error al registrar.", "error");
    } finally {
      setBusy(false);
    }
  }

  /* =======================
     VERIFICAR CÓDIGO
  ======================= */
  async function onVerifyEmail() {
    if (busy) return;

    const code = regCode.trim();

    if (!pendingVerifyEmail || !code) {
      return notify("Escribe el código de verificación.", "error");
    }

    try {
      setBusy(true);
      await api.verifyEmail({ email: pendingVerifyEmail, code });

      notify(
        "Correo verificado correctamente. Ya puedes iniciar sesión.",
        "success"
      );

      setRegNombre("");
      setRegEmail("");
      setRegPass("");
      setRegCode("");
      setPendingVerifyEmail("");
      setRegistroStep("form");
      setMode("login");
    } catch (e: any) {
      notify(e?.message || "Error al verificar el correo.", "error");
    } finally {
      setBusy(false);
    }
  }

  // helper formato fecha bloqueo
  function formatLockUntil(value: string | null) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString();
  }

  return (
    <section className="view active">
      <style>{`
        .card {
          background: #fff;
          border-radius: 14px;
          padding: 28px;
          box-shadow: 0 0 8px rgba(0,0,0,0.1);
        }
        .tabs {
          display: flex;
          justify-content: center;
          background: #f3f4f6;
          border-radius: 50px;
          padding: 4px;
          margin-bottom: 20px;
        }
        .tabs button {
          flex: 1;
          border: none;
          background: transparent;
          padding: 10px;
          border-radius: 50px;
          cursor: pointer;
          font-weight: 600;
          color: #111827;
          transition: all .2s ease;
        }
        .tabs button.active {
          background: #fff;
          color: #22c55e;
          box-shadow: 0 0 0 1px #22c55e inset;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .field input {
          padding: 10px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          transition: border-color .2s;
        }
        .field input:focus {
          border-color: #22c55e;
        }
        .btn.primary {
          background: #22c55e;
          border: none;
          color: white;
          font-weight: 600;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          transition: background .2s ease;
        }
        .btn.primary:hover {
          background: #16a34a;
        }
        .btn.primary:disabled {
          opacity: .7;
          cursor: default;
        }
        .password-field {
          position: relative;
          display: flex;
          align-items: center;
        }
        .password-field input {
          width: 100%;
          padding-right: 70px;
        }
        .toggle-btn {
          position: absolute;
          right: 10px;
          background: none;
          border: none;
          color: #22c55e;
          font-size: 13px;
          cursor: pointer;
          font-weight: 600;
        }
        .toast-modal {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }
        .toast-box {
          background: #ffffff;
          border: 2px solid #22c55e;
          color: #14532d;
          border-radius: 10px;
          padding: 18px 24px;
          text-align: center;
          box-shadow: 0 6px 24px rgba(0,0,0,0.1);
          font-weight: 500;
          max-width: 400px;
        }
        .toast-box.success {
          border-color: #22c55e;
          color: #14532d;
        }
        .toast-box.error {
          background: #f0fdf4;
          border-color: #86efac;
          color: #166534;
        }
        .toast-box.info {
          background: #ecfdf5;
          border-color: #34d399;
          color: #065f46;
        }
        .toast-box button {
          margin-top: 12px;
          background: #22c55e;
          border: none;
          color: white;
          border-radius: 6px;
          padding: 6px 16px;
          cursor: pointer;
          font-weight: 600;
          transition: background .2s;
        }
        .toast-box button:hover {
          background: #16a34a;
        }
      `}</style>

      {toast && (
        <div className="toast-modal">
          <div className={`toast-box ${toast.type}`}>
            {toast.text}
            <br />
            <button onClick={() => setToast(null)}>Aceptar</button>
          </div>
        </div>
      )}

      <div className="card" style={{ maxWidth: 520, marginInline: "auto" }}>
        <div className="tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setRegistroStep("form");
            }}
          >
            Login
          </button>
          <button
            className={mode === "registro" ? "active" : ""}
            onClick={() => setMode("registro")}
          >
            Registro
          </button>
        </div>

        {/* LOGIN */}
        {mode === "login" && (
          <div style={{ marginTop: 14 }} className="grid">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                placeholder="Correo electrónico."
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Contraseña</span>
              <div className="password-field">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  maxLength={8}
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !busy && onLogin()
                  }
                />
                <button
                  type="button"
                  className="toggle-btn"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? "Ocultar" : "Ver"}
                </button>
              </div>
            </label>

            <button
              className="btn primary"
              onClick={onLogin}
              disabled={busy}
            >
              {busy ? "Procesando..." : "Acceder"}
            </button>

            {/*Info de intentos / bloqueo */}
            {remainingAttempts !== null && (
              <p className="muted" style={{ marginTop: 8 }}>
                Intentos restantes antes de bloqueo:{" "}
                <b>{remainingAttempts}</b>
              </p>
            )}
            {lockUntil && (
              <p className="muted" style={{ marginTop: 4 }}>
                Tu cuenta está bloqueada hasta:{" "}
                <b>{formatLockUntil(lockUntil)}</b>
              </p>
            )}
          </div>
        )}

        {/* REGISTRO */}
        {mode === "registro" && (
          <div className="grid" style={{ marginTop: 14 }}>
            {registroStep === "form" ? (
              <>
                <label className="field">
                  <span>Nombre</span>
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    value={regNombre}
                    onChange={(e) => setRegNombre(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    placeholder="Correo electrónico."
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Contraseña</span>
                  <div className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Debe tener mayúscula, número y signo (8)"
                      maxLength={8}
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && !busy && onRegister()
                      }
                    />
                    <button
                      type="button"
                      className="toggle-btn"
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? "Ocultar" : "Ver"}
                    </button>
                  </div>
                </label>

                <button
                  className="btn primary"
                  onClick={onRegister}
                  disabled={busy}
                >
                  {busy ? "Procesando..." : "Crear cuenta"}
                </button>
              </>
            ) : (
              <>
                <p>
                  Te enviamos un código de verificación a{" "}
                  <b>{pendingVerifyEmail}</b>. Escríbelo para activar tu cuenta.
                </p>

                <label className="field">
                  <span>Código de verificación</span>
                  <input
                    type="text"
                    placeholder="Ej. 123456"
                    value={regCode}
                    onChange={(e) => setRegCode(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !busy && onVerifyEmail()
                    }
                  />
                </label>

                <button
                  className="btn primary"
                  onClick={onVerifyEmail}
                  disabled={busy}
                >
                  {busy ? "Verificando..." : "Verificar correo"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
