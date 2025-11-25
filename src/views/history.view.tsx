import React, { useEffect, useState } from "react";
import { api, Telemetry } from "../api";

type Route = "splash" | "auth" | "scan" | "device" | "irrigate" | "history";

export type HistoryItem = {
  fecha: string;
  planta: string;
  dispositivo: string;
  minutos: number;
  humedad: number;
  pureza: number;
};

type Props = {
  goTo: (r: Route) => void;
  items?: HistoryItem[];
  deviceId?: string;
};

export default function HistoryView({
  goTo,
  items: initialItems = [],
  deviceId,
}: Props) {
  const [items, setItems] = useState<HistoryItem[]>(initialItems);
  const [loading, setLoading] = useState<boolean>(initialItems.length === 0);

  useEffect(() => {
    // si ya vienen items precargados, no llamamos a la API
    if (initialItems.length > 0) return;

    // si no tenemos deviceId, no podemos consultar nada
    if (!deviceId) {
      setItems([]);
      setLoading(false);
      return;
    }

    async function loadHistory() {
      try {
        setLoading(true);

        const data: Telemetry[] = await api.getTelemetryHistory(deviceId);

        const mapped: HistoryItem[] = data.map((d) => ({
          fecha: d.createdAt
            ? new Date(d.createdAt).toLocaleString()
            : new Date().toLocaleString(),
          planta: "Pasto",
          dispositivo: d.name || d.deviceId,
          minutos: (d as any).minutos ?? 0, // por si "minutos" viene en el doc
          humedad: d.humedad ?? 0,
          pureza: d.pureza ?? 0,
        }));

        setItems(mapped);
      } catch (e) {
        console.error("No se pudo obtener el historial:", e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [initialItems.length, deviceId]);

  function exportCsv() {
    const header = [
      "Fecha",
      "Planta",
      "Dispositivo",
      "Minutos",
      "Humedad",
      "Pureza",
    ];

    const rows: (string | number)[][] = [
      header,
      ...items.map((h) => [
        h.fecha,
        h.planta,
        h.dispositivo,
        h.minutos,
        `${h.humedad}%`,
        `${h.pureza}%`,
      ]),
    ];

    const csv = rows
      .map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historial_greendrop.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="view active">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <h3 style={{ margin: "10px 0", fontSize: 20 }}>Historial de riego</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" id="btn-export" onClick={exportCsv}>
            Exportar CSV
          </button>
          <button
            className="btn"
            id="btn-back-device"
            onClick={() => goTo("device")}
          >
            Volver
          </button>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {loading ? (
          <div className="muted" style={{ textAlign: "center", padding: 10 }}>
            Cargando registros...
          </div>
        ) : (
          <table id="tbl-history">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Planta</th>
                <th>Dispositivo</th>
                <th>Minutos</th>
                <th>Humedad inicial</th>
                <th>Pureza</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="muted"
                    style={{ textAlign: "center" }}
                  >
                    Sin registros aún.
                  </td>
                </tr>
              ) : (
                items.map((h, i) => (
                  <tr key={`${h.fecha}-${h.dispositivo}-${i}`}>
                    <td>{h.fecha}</td>
                    <td>{h.planta}</td>
                    <td>{h.dispositivo}</td>
                    <td>{h.minutos}</td>
                    <td>{h.humedad}%</td>
                    <td>{h.pureza}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
        <small className="muted">
          En móvil, desliza horizontalmente para ver todas las columnas.
        </small>
      </div>
    </section>
  );
}
