import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { bleSendCommand } from "../bleControl";
import type { Route, LiveTelemetry } from "../App";

type Sensors = {
  humedad: number;
  pureza: number;
  estado: string;
};

type Props = {
  goTo: (r: Route) => void;
  connected?: { id: string; name?: string } | null;
  onStartIrrigation?: (payload: { durationMin: number; plant: string }) => void;
  onOpenHistory?: () => void;
  liveTelemetry?: LiveTelemetry | null; 
};

const BASE_DUR: Record<string, number> = {
  Pasto: 12,
};

const DEFAULT_DEVICE_ID = "ESP32-Riego";

export default function DeviceView({
  goTo,
  connected,
  onStartIrrigation,
  onOpenHistory,
  liveTelemetry,
}: Props) {
  const [sensors, setSensors] = useState<Sensors>({
    humedad: 50,
    pureza: 90,
    estado: "OK",
  });

  const [plant, setPlant] = useState<string>("Pasto");
  const [autoByPlant, setAutoByPlant] = useState<boolean>(true);
  const [durationMin, setDurationMin] = useState<number>(
    BASE_DUR["Pasto"] ?? 10
  );

  // id del dispositivo
  const deviceId = connected?.id ?? DEFAULT_DEVICE_ID;
  const deviceName =
    connected?.name ?? `${DEFAULT_DEVICE_ID} (predeterminado)`;
  const usingFallback = !connected?.id;

  const durationLabel = useMemo(() => `${durationMin} min`, [durationMin]);

 
  useEffect(() => {
    if (connected?.id) return; 

    let alive = true;
    let timer: number | undefined;

    const pull = async () => {
      try {
        const data = await api.getLatestTelemetry(deviceId);
        if (!alive) return;

        if (data) {
          setSensors({
            humedad: typeof data.humedad === "number" ? data.humedad : 0,
            pureza: typeof data.pureza === "number" ? data.pureza : 0,
            estado: data.estado ?? "OK",
          });
        } else {
          setSensors((p) => ({ ...p, estado: "SIN DATOS" }));
        }
      } catch (e) {
        console.error("getLatestTelemetry error:", e);
        if (!alive) return;
        setSensors((p) => ({ ...p, estado: "ERROR" }));
      } finally {
        if (alive) timer = window.setTimeout(pull, 2000);
      }
    };

    pull();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [deviceId, connected?.id]);

  
  useEffect(() => {
    if (!liveTelemetry) return;
    if (liveTelemetry.deviceId !== deviceId) return;

    setSensors((prev) => ({
      humedad:
        typeof liveTelemetry.humedad === "number"
          ? liveTelemetry.humedad
          : prev.humedad,
      pureza:
        typeof liveTelemetry.pureza === "number"
          ? liveTelemetry.pureza
          : prev.pureza,
      estado: liveTelemetry.estado ?? prev.estado,
    }));
  }, [liveTelemetry, deviceId]);

  useEffect(() => {
    if (!autoByPlant) return;
    const value = BASE_DUR[plant] ?? 8;
    setDurationMin(value);
  }, [plant, autoByPlant]);

  function handleStart() {
    bleSendCommand("IRR_ON").catch((e) =>
      console.error("Error enviando IRR_ON:", e)
    );

    onStartIrrigation?.({ durationMin, plant });
    goTo("irrigate");
  }

  function handleHistory() {
    onOpenHistory?.();
    goTo("history");
  }

  return (
    <section className="view active">
      <style>
        {`.stat-emoji { font-size: 20px; margin-right: 6px; vertical-align: -2px; }`}
      </style>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <h3 id="device-title" style={{ margin: "10px 0", fontSize: 20 }}>
          {deviceName}
        </h3>

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" id="btn-history" onClick={handleHistory}>
            📜 Historial
          </button>
        </div>
      </div>

      {usingFallback && (
        <div className="card" style={{ marginBottom: 10 }}>
          <small className="muted">
            Mostrando lecturas por defecto de <strong>{DEFAULT_DEVICE_ID}</strong>.
            Escanea/selecciona un dispositivo para ver sus datos en vivo.
          </small>
        </div>
      )}

      <div className="grid grid-2" style={{ marginTop: 10 }}>
        <div
          className="grid"
          style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div className="card">
            <div className="muted">
              <span className="stat-emoji">🌿</span>Humedad del suelo
            </div>
            <div style={{ fontSize: 26, fontWeight: 800 }} id="stat-humedad">
              {sensors.humedad}%
            </div>
            <small className="muted">Óptimo: 45–60%</small>
          </div>

          <div className="card">
            <div className="muted">
              <span className="stat-emoji">💧</span>Pureza del agua
            </div>
            <div style={{ fontSize: 26, fontWeight: 800 }} id="stat-pureza">
              {sensors.pureza}%
            </div>
            <small className="muted">&gt;85% recomendado</small>
          </div>

          <div className="card" id="status-card">
            <div className="muted">
              <span className="stat-emoji">📟</span>Estado
            </div>
            <div style={{ fontSize: 18, fontWeight: 700 }} id="stat-estado">
              {sensors.estado || "—"}
            </div>
            <small className="muted">
              Calibrando flujo para evitar sobre/infra riego.
            </small>
          </div>

          <div className="card">
            <div className="muted">
              <span className="stat-emoji">🌱</span>Planta
            </div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>Pasto</div>

            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginTop: 10,
                fontSize: 14,
              }}
            >
              <input
                id="chk-auto"
                type="checkbox"
                checked={autoByPlant}
                onChange={(e) => setAutoByPlant(e.target.checked)}
              />{" "}
              Ajuste automático por planta
            </label>

            <small className="muted">Se sugiere tiempo automático.</small>
          </div>
        </div>

        <div className="card">
          <strong>
            <span className="stat-emoji">⏱️</span>Temporizador de riego
          </strong>
          <p className="muted">
            Define cuánto tiempo regará esta electroválvula.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <span className="muted">Duración</span>
            <span style={{ fontWeight: 700 }}>{durationLabel}</span>
          </div>

          <input
            id="range-duracion"
            className="range"
            type="range"
            min={1}
            max={30}
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            disabled={autoByPlant}
          />

          <button
            className="btn primary"
            style={{ marginTop: 12, width: "100%" }}
            onClick={handleStart}
          >
            Comenzar riego
          </button>
        </div>
      </div>
    </section>
  );
}
