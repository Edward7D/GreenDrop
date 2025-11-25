import { useRef, useState, useEffect } from "react";
import { api } from "../api";
import { setWriteCharacteristic } from "../bleControl";
import type { Route, LiveTelemetry } from "../App";

type Props = {
  goTo: (r: Route) => void;
  setConnected: (dev: { id: string; name?: string } | null) => void;
  onLiveTelemetry?: (data: LiveTelemetry) => void;
  setBleDisconnect?: (fn: () => Promise<void>) => void;
};

type FoundDevice = {
  id: string;
  name: string;
  rssi: number;
  device: BluetoothDevice;
};

type Toast = { id: number; text: string; type?: "success" | "error" | "info" };

const SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
const CHAR_UUID = "abcd1234-abcd-1234-abcd-1234567890ab";

/** ===== Singleton para persistir sesión BLE entre montajes ===== */
const bleStore: {
  device: BluetoothDevice | null;
  char: BluetoothRemoteGATTCharacteristic | null;
  onNotify: ((ev: Event) => void) | null;
  sessionOpen: boolean;
  currentDeviceId: string | null;
  lastName?: string;
} = {
  device: null,
  char: null,
  onNotify: null,
  sessionOpen: false,
  currentDeviceId: null,
  lastName: undefined,
};

export default function ScanView({
  goTo,
  setConnected,
  onLiveTelemetry,
  setBleDisconnect,
}: Props) {
  const [devices, setDevices] = useState<FoundDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [banner, setBanner] = useState<string>("");

  const [toast, setToast] = useState<Toast | null>(null);
  function notify(text: string, type: Toast["type"] = "info") {
    setToast({ id: Date.now(), text, type });
  }

  const deviceRef = useRef<BluetoothDevice | null>(bleStore.device);
  const charRef = useRef<BluetoothRemoteGATTCharacteristic | null>(bleStore.char);
  const onNotifyRef = useRef<((ev: Event) => void) | null>(bleStore.onNotify);

  const sessionOpenRef = useRef(bleStore.sessionOpen);
  const currentDeviceIdRef = useRef<string | null>(bleStore.currentDeviceId);

  useEffect(() => {
    if (bleStore.device?.gatt?.connected) {
      deviceRef.current = bleStore.device;
      charRef.current = bleStore.char;
      onNotifyRef.current = bleStore.onNotify;
      sessionOpenRef.current = bleStore.sessionOpen;
      currentDeviceIdRef.current = bleStore.currentDeviceId;

      setConnected({
        id: bleStore.currentDeviceId || bleStore.device.id,
        name: bleStore.lastName || bleStore.device.name || "ESP32",
      });
      setBanner(
        `✅ Conectado a ${bleStore.lastName || bleStore.device.name || "ESP32"}.`
      );
    }
  }, [setConnected]);

  function rssiFake() {
    return Math.floor(Math.random() * 51) - 90;
  }

  async function onScan() {
    if (!("bluetooth" in navigator)) {
      notify(
        "Este navegador no soporta Web Bluetooth. Prueba Chrome/Edge en HTTPS o localhost.",
        "error"
      );
      return;
    }

    setScanning(true);
    setDevices([]);

    try {
      const dev = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "ESP32" }],
        optionalServices: [SERVICE_UUID],
      });

      setDevices([
        {
          id: dev.id,
          name: dev.name || "ESP32",
          rssi: rssiFake(),
          device: dev,
        },
      ]);
      setBanner("");
    } catch (e) {
      console.warn(e);
      notify("No se pudo buscar dispositivos o se canceló la búsqueda.", "info");
    } finally {
      setScanning(false);
    }
  }

  async function connectDevice(d: FoundDevice) {
    try {
      if (deviceRef.current?.gatt?.connected) {
        setBanner(`✅ Ya estás conectado a ${bleStore.lastName || d.name}.`);
        setConnected({
          id: currentDeviceIdRef.current || d.id,
          name: bleStore.lastName || d.name,
        });
        return;
      }

      const btDevice = d.device;
      deviceRef.current = btDevice;
      bleStore.device = btDevice;

      if (btDevice.gatt?.connected) btDevice.gatt.disconnect();

      const server = await btDevice.gatt!.connect();
      const service = await server.getPrimaryService(SERVICE_UUID);
      const characteristic = await service.getCharacteristic(CHAR_UUID);
      setWriteCharacteristic(characteristic);
      charRef.current = characteristic;
      bleStore.char = characteristic;

      const onNotify = async (ev: Event) => {
        try {
          const target = ev.target as BluetoothRemoteGATTCharacteristic;
          const value = target.value;
          if (!value) return;

          const txt = new TextDecoder().decode(value);
          const data = JSON.parse(txt) as {
            deviceId?: string;
            name?: string;
            humedad?: number;
            pureza?: number;
            estado?: string;
            minutos?: number;
          };

          const realId = String(data.deviceId || d.id);

          if (!sessionOpenRef.current) {
            currentDeviceIdRef.current = realId;
            bleStore.currentDeviceId = realId;

            await api.openBleSession(realId);
            sessionOpenRef.current = true;
            bleStore.sessionOpen = true;

            bleStore.lastName = data.name || d.name;
            setConnected({ id: realId, name: bleStore.lastName });
            setBanner(
              `✅ Listo, estás conectado a ${bleStore.lastName}. Ahora puedes ir a “Dispositivo”.`
            );
          }

          const minutos =
            typeof data.minutos === "number" && Number.isFinite(data.minutos)
              ? data.minutos
              : 0;

          // siempre actualizamos lecturas en vivo para el DeviceView
          onLiveTelemetry?.({
            deviceId: realId,
            name: data.name || d.name,
            humedad: data.humedad,
            pureza: data.pureza,
            estado: data.estado || "OK",
            minutos,
          });

          // sólo guardamos en BD cuando hubo riego (minutos > 0)
          if (minutos <= 0) {
            console.log("[BLE] Lectura en vivo (NO se guarda en BD)");
            return;
          }

          await api.pushTelemetry({
            deviceId: currentDeviceIdRef.current!,
            name: data.name || d.name,
            humedad: data.humedad,
            pureza: data.pureza,
            estado: data.estado || "OK",
            minutos,
          });
        } catch (err) {
          console.warn("Notify inválido:", err);
        }
      };

      if (!onNotifyRef.current) {
        onNotifyRef.current = onNotify;
        bleStore.onNotify = onNotify;
        await characteristic.startNotifications();
        characteristic.addEventListener(
          "characteristicvaluechanged",
          onNotify as EventListener
        );
      }

      // Primer READ para tener datos de sensores en la pantalla
      await characteristic.writeValue(new TextEncoder().encode("READ"));

      bleStore.lastName = d.name;
      setConnected({ id: d.id, name: d.name });
      setBanner(`🔄 Conectado a ${d.name}. Esperando lecturas...`);

      btDevice.addEventListener("gattserverdisconnected", handleGattDisconnected);
    } catch (e) {
      console.error("No se pudo conectar/suscribir:", e);
      notify("No se pudo conectar. Intenta de nuevo.", "error");
      await disconnectDevice();
    }
  }

  async function handleGattDisconnected() {
    try {
      if (sessionOpenRef.current && currentDeviceIdRef.current) {
        await api.closeBleSession(currentDeviceIdRef.current);
      }
    } catch (e) {
      console.warn("close-session falló:", e);
    } finally {
      await hardCleanup();
      setBanner("ℹ️ Dispositivo desconectado.");
      setConnected(null);
    }
  }

  
  async function disconnectDevice() {
    try {
      if (sessionOpenRef.current && currentDeviceIdRef.current) {
        await api.closeBleSession(currentDeviceIdRef.current);
      }
    } catch (e) {
      console.warn("close-session falló:", e);
    } finally {
      await hardCleanup();
      setBanner("Te desconectaste del dispositivo.");
      setConnected(null);
    }
  }

  // registramos disconnectDevice en App (para usarla al hacer logout)
  useEffect(() => {
    if (setBleDisconnect) {
      setBleDisconnect(() => disconnectDevice);
    }
  }, [setBleDisconnect]);

  async function hardCleanup() {
    try {
      if (charRef.current) {
        try {
          await charRef.current.stopNotifications();
        } catch {
          /* ignore */
        }
        if (onNotifyRef.current) {
          charRef.current.removeEventListener(
            "characteristicvaluechanged",
            onNotifyRef.current as EventListener
          );
        }
      }
      if (deviceRef.current?.gatt?.connected) {
        deviceRef.current.gatt.disconnect();
      }
    } finally {
      onNotifyRef.current = null;
      charRef.current = null;
      deviceRef.current = null;
      sessionOpenRef.current = false;
      currentDeviceIdRef.current = null;

      bleStore.onNotify = null;
      bleStore.char = null;
      bleStore.device = null;
      bleStore.sessionOpen = false;
      bleStore.currentDeviceId = null;
      bleStore.lastName = undefined;
    }
  }

  const isConnected = !!bleStore.device?.gatt?.connected;

  return (
    <section className="view active">
      {/* estilos toast */}
      <style>{`
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
          max-width: 420px;
          animation: pop .2s ease-out;
        }
        .toast-box.success { border-color: #22c55e; color: #14532d; }
        .toast-box.error   { background: #f0fdf4; border-color: #86efac; color: #166534; }
        .toast-box.info    { background: #ecfdf5; border-color: #34d399; color: #065f46; }
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
        .toast-box button:hover { background: #16a34a; }
        @keyframes pop { from { transform: scale(.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }
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

      {banner && (
        <div className="card" style={{ background: "var(--muted-bg,#f3f7f9)" }}>
          {banner}
          {isConnected && (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <button className="btn primary" onClick={() => goTo("device")}>
                Ir al dispositivo
              </button>
              <button className="btn" onClick={disconnectDevice}>
                Desconectar
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: "0 0 6px 0" }}>Encontrar electroválvulas disponibles</h3>
        <p className="muted">
          Activa tu Bluetooth y presiona <b>Buscar</b>.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button className="btn primary" onClick={onScan} disabled={scanning}>
            {scanning ? "Buscando..." : "Buscar"}
          </button>

          <button
            className="btn"
            onClick={() =>
              notify(
                "1) Buscar → selecciona tu ESP32\n2) Conectar → verás lecturas en vivo\n3) Solo se guarda en Historial cuando termina el riego.",
                "info"
              )
            }
          >
            Ayuda
          </button>
        </div>

        <div id="scan-list" className="grid" style={{ marginTop: 14 }}>
          {devices.map((dev) => {
            const thisIsActive =
              isConnected && bleStore.device?.id === dev.device.id;
            return (
              <div
                key={dev.id}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{dev.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Señal aprox: {dev.rssi} dBm
                  </div>
                </div>

                {!thisIsActive ? (
                  <button
                    className="btn primary"
                    onClick={() => connectDevice(dev)}
                  >
                    Conectar
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn primary"
                      onClick={() => goTo("device")}
                    >
                      Ir al dispositivo
                    </button>
                    <button className="btn" onClick={disconnectDevice}>
                      Desconectar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!scanning && devices.length === 0 && (
          <div
            className="card muted"
            style={{ textAlign: "center", marginTop: 10 }}
          >
            Aún no hay dispositivos. Presiona “Buscar” para comenzar.
          </div>
        )}
      </div>
    </section>
  );
}
