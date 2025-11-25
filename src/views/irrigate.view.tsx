import { useEffect, useMemo, useRef, useState } from "react";
import { bleSendCommand } from "../bleControl";

type Route = "splash" | "auth" | "scan" | "device" | "irrigate" | "history";

type TimerState = {
  total: number;   // segundos totales
  left: number;    // segundos restantes
  running: boolean;
};

type Props = {
  goTo: (r: Route) => void;
  connected?: { id: string; name?: string } | null;

  // Estado global del temporizador (viene de App)
  timer: TimerState;
  // Para sincronizar cambios de aquí hacia App
  setTimer?: (t: TimerState) => void;
  // Callback opcional cuando se detiene el riego
  onStopped?: (manual: boolean) => Promise<void> | void;
};

function toMMSS(s: number) {
  const mm = Math.max(0, Math.floor(s / 60));
  const ss = Math.max(0, Math.floor(s % 60));
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export default function IrrigateView({
  goTo,
  connected,
  timer,
  setTimer,
  onStopped,
}: Props) {
  const [local, setLocal] = useState<TimerState>(timer);
  const tickRef = useRef<number | null>(null);
  const stoppingRef = useRef(false); 

 
  useEffect(() => {
    setLocal(timer);
  }, [timer.total, timer.left, timer.running]);

  const pct = useMemo(() => {
    if (!local.total) return 0;
    const p = 100 - Math.round((local.left / local.total) * 100);
    return Math.max(0, Math.min(100, p));
  }, [local.left, local.total]);

  useEffect(() => {
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }

    if (!local.running || local.left <= 0) return;

    tickRef.current = window.setInterval(() => {
      setLocal((prev) => {
        if (!prev.running) return prev;
        const nextLeft = Math.max(0, prev.left - 1);
        const next: TimerState = { ...prev, left: nextLeft };

        // sincroniza con App
        setTimer?.(next);

        if (nextLeft <= 0) {
          // Cuando llegue a 0, paramos automáticamente (no manual)
          queueMicrotask(() => stop(false));
          return { ...next, running: false };
        }

        return next;
      });
    }, 1000);

    return () => {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local.running]);

  async function stop(manual: boolean) {
    // Si ya estamos deteniendo, no repetir
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    try {
      // Avisamos al ESP32 para que apague el riego y calcule minutos
      await bleSendCommand("IRR_OFF");
    } catch (e) {
      console.error("Error enviando IRR_OFF:", e);
    }

    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }

    const stopped: TimerState = { ...local, running: false, left: 0 };
    setLocal(stopped);
    setTimer?.(stopped);

    try {
      await onStopped?.(manual);
    } catch {
      /* no-op */
    }

    goTo("device");
  }

  return (
    <section className="view active">
      <div
        className="card"
        style={{ maxWidth: 560, marginInline: "auto", textAlign: "center" }}
      >
        <p className="muted">
          Regando:{" "}
          <b id="irrigate-device">{connected?.name || "Válvula"}</b>
        </p>

        <div className="progress" style={{ marginTop: 8 }}>
          <i id="prog" style={{ width: `${pct}%` }} />
        </div>

        <div
          id="clock"
          style={{
            marginTop: 8,
            fontSize: 40,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {toMMSS(local.left)}
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            marginTop: 14,
          }}
        >

          <button className="btn" id="btn-hide" onClick={() => goTo("device")}>
            Ocultar
          </button>

         
          <button
            className="btn danger"
            id="btn-stop"
            onClick={() => stop(true)}
          >
            Detener
          </button>
        </div>
      </div>
    </section>
  );
}
