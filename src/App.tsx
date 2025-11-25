import { useEffect, useMemo, useState, Dispatch, SetStateAction } from "react";
import SplashView from "./views/splash.view";
import HistoryView, { type HistoryItem } from "./views/history.view";
import AuthView from "./views/auth.view";
import DeviceView from "./views/device.view";
import IrrigateView from "./views/irrigate.view";
import ScanView from "./views/scan.view";
import { api } from "./api";
import { useAuth } from "./auth";

export type Route = "splash" | "auth" | "scan" | "device" | "irrigate" | "history";

type TimerState = {
  total: number; // segundos totales
  left: number;  // segundos restantes
  running: boolean;
};


export type LiveTelemetry = {
  deviceId: string;
  name?: string;
  humedad?: number;
  pureza?: number;
  estado?: string;
  minutos?: number;
};

const routes: { key: Route; label: string }[] = [
  { key: "splash", label: "Inicio" },
  { key: "auth", label: "Acceso" },
  { key: "scan", label: "Buscar" },
  { key: "device", label: "Dispositivo" },
  { key: "irrigate", label: "Riego" },
  { key: "history", label: "Historial" },
];

// Define qué rutas son privadas
const PRIVATE = new Set<Route>(["scan", "device", "irrigate", "history"]);

export default function App() {
  const { isAuth, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [route, setRoute] = useState<Route>("splash");
  const [connectedLabel, setConnectedLabel] = useState("");
  const [user, setUser] = useState<unknown>(null);

  // Estado global
  const [timer, setTimer] = useState<TimerState>({
    total: 0,
    left: 0,
    running: false,
  });
  const [connected, setConnected] = useState<{ id: string; name?: string } | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);

 
  const [bleDisconnect, setBleDisconnect] = useState<null | (() => Promise<void>)>(null);

 
  const [liveTelemetry, setLiveTelemetry] = useState<LiveTelemetry | null>(null);

  const mainNavId = useMemo(() => "mainNav", []);

  useEffect(() => {
    let ok = true;
    api.getStatus().then((s) => ok && setConnectedLabel(s.label));
    return () => {
      ok = false;
    };
  }, []);

  // cerrar menú al click fuera
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const nav = document.getElementById(mainNavId);
      const btn = document.getElementById("menuBtn");
      const t = e.target as Node | null;
      if (!t || !nav || !btn) return;
      if (!nav.contains(t) && !btn.contains(t)) setMenuOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [mainNavId]);

  useEffect(() => {
    if (isAuth && route === "auth") {
      setRoute("device"); // Dirige al dispositivo una vez logeado
    }
  }, [isAuth, route]);

  const goToGuard = (r: Route) => {
    if (!isAuth && PRIVATE.has(r)) {
      setRoute("auth");
      return;
    }
    if ((r === "device" || r === "irrigate" || r === "history") && !connected?.id) {
      setRoute("scan");
      return;
    }
    setRoute(r);
  };

  useEffect(() => {
    // redirección si se pierde conexión estando en vistas que la requieren
    if (!connected?.id && (route === "device" || route === "irrigate" || route === "history")) {
      setRoute("scan");
    }
  }, [connected?.id, route]);

  // Rutas visibles según estado de sesión (para el menú)
  const visibleRoutes = routes.filter((r) =>
    isAuth ? r.key !== "auth" : r.key === "splash" || r.key === "auth"
  );

  return (
    <div data-auth={isAuth ? "1" : "0"}>
      {/* Header */}
      <header className="hdr">
        <div className="container topbar">
          <div className="brand">
            <div className="logo">
              <img src="/src/assets/logosr.jpg" alt="GreenDrop" className="logo-img" />
            </div>
            <div>
              <div className="brand-title">GreenDrop</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {connectedLabel}
              </div>
            </div>
          </div>

          <button
            id="menuBtn"
            className={`menu-icon ${menuOpen ? "active" : ""}`}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            aria-controls={mainNavId}
            onClick={() => setMenuOpen((v) => !v)}
          >
            &#9776;
          </button>

          <nav id={mainNavId} className={`nav ${menuOpen ? "show" : ""}`}>
            {visibleRoutes.map((r) => (
              <button
                key={r.key}
                className={`navbtn ${route === r.key ? "active" : ""} ${
                  PRIVATE.has(r.key) ? "only-auth" : ""
                }`}
                onClick={() => {
                  goToGuard(r.key);
                  setMenuOpen(false);
                }}
              >
                {r.label}
              </button>
            ))}

            {isAuth && (
              <button
                className="navbtn only-auth"
                onClick={async () => {
                  
                  if (bleDisconnect) {
                    try {
                      await bleDisconnect();
                    } catch (e) {
                      console.warn("Error desconectando BLE en logout:", e);
                    }
                  }

                  logout();
                  setMenuOpen(false);
                  setConnected(null);      
                  setLiveTelemetry(null); 
                  setHistoryItems([]);     
                  setRoute("splash");
                }}
              >
                Salir
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="container" style={{ paddingBottom: 80 }}>
        <View
          route={route}
          goTo={goToGuard}
          setUser={setUser}
          connected={connected}
          setConnected={setConnected}
          timer={timer}
          setTimer={setTimer}
          historyItems={historyItems}
          setHistoryItems={setHistoryItems}
          bleDisconnect={bleDisconnect}
          setBleDisconnect={setBleDisconnect}
          liveTelemetry={liveTelemetry}
          setLiveTelemetry={setLiveTelemetry}
        />
      </main>
    </div>
  );
}

function View({
  route,
  goTo,
  setUser,
  connected,
  setConnected,
  timer,
  setTimer,
  historyItems,
  setHistoryItems,
  bleDisconnect,
  setBleDisconnect,
  liveTelemetry,
  setLiveTelemetry,
}: {
  route: Route;
  goTo: (r: Route) => void;
  setUser: (u: unknown) => void;
  connected: { id: string; name?: string } | null;
  setConnected: Dispatch<SetStateAction<{ id: string; name?: string } | null>>;
  timer: TimerState;
  setTimer: Dispatch<SetStateAction<TimerState>>;
  historyItems: HistoryItem[];
  setHistoryItems: Dispatch<SetStateAction<HistoryItem[]>>;
  bleDisconnect: null | (() => Promise<void>);
  setBleDisconnect: Dispatch<SetStateAction<null | (() => Promise<void>)>>;
  liveTelemetry: LiveTelemetry | null;
  setLiveTelemetry: Dispatch<SetStateAction<LiveTelemetry | null>>;
}) {
  switch (route) {
    case "splash":
      return <SplashView goTo={goTo} />;

    case "auth":
      return <AuthView goTo={goTo} setUser={setUser} />;

    case "scan":
      return (
        <ScanView
          goTo={goTo}
          setConnected={setConnected}
          onLiveTelemetry={setLiveTelemetry}
          setBleDisconnect={setBleDisconnect}
        />
      );

    case "device":
      return (
        <DeviceView
          goTo={goTo}
          connected={connected}
          liveTelemetry={liveTelemetry}
          onStartIrrigation={({ durationMin, plant }) => {
            const total = durationMin * 60;
            setTimer({ total, left: total, running: true });
            goTo("irrigate");
          }}
        />
      );


    case "irrigate":
      return (
        <IrrigateView
          goTo={goTo}
          connected={connected}
          timer={timer}
          setTimer={setTimer}
          onStopped={async (manual) => {
            console.log("Irrigation stopped. Manual:", manual);
          }}
        />
      );

case "history":
  return (
    <HistoryView
      goTo={goTo}
      deviceId={connected?.id || undefined}
      items={[]} 
    />
  );


    default:
      return <p className="muted">Vista no encontrada.</p>;
  }
}
