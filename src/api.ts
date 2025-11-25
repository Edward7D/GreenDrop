const BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

/* ===== Tipos ===== */
export type Telemetry = {
  _id: string;
  deviceId: string;
  name?: string;
  humedad: number;
  pureza: number;
  estado?: string;
  minutos?: number;
  createdAt?: string;
};

/* Helpers */
function getToken() {
  return sessionStorage.getItem("token");
}

function setToken(t?: string | null) {
  if (t) sessionStorage.setItem("token", t);
  else sessionStorage.removeItem("token");
}

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ===============================
   Helpers de lectura / errores
================================= */

async function readJsonSafe(res: Response) {
  const t = await res.text();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
    },
    ...options,
  });

  const data = await readJsonSafe(res);

  // si token expiró → borramos
  if (res.status === 401) {
    setToken(null);
  }

  if (!res.ok) {
    const err: any = new Error();

    err.code = data?.code || data?.message || `HTTP ${res.status}`;
    err.remainingAttempts = data?.remainingAttempts;
    err.locked = data?.locked;
    err.lockUntil = data?.lockUntil;
    err.raw = data;

    err.status = res.status;
    err.message = err.code;

    throw err;
  }

  return (data as T) ?? (null as any as T);
}

/* ======================
   API principal
====================== */

export const api = {
  // --- LOGIN ---
  async login({ email, password }: { email: string; password: string }) {
    const data = await request<{
      access_token?: string;
      token?: string;
      user?: any;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    const token = data?.access_token || data?.token;
    if (!token) return { token: undefined, user: data?.user ?? data };

    setToken(token);
    return { token, user: data?.user ?? data };
  },

  // REGISTRO
  async register({
    name,
    email,
    password,
  }: {
    name: string;
    email: string;
    password: string;
  }) {
    return request("/user", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  // VERIFICACIÓN DEL CORREO
  async verifyEmail({ email, code }: { email: string; code: string }) {
    return request("/user/verify-email", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  },

  async me() {
    return request("/auth/me");
  },

  logout() {
    setToken(null);
  },

  async getStatus() {
    return { connected: true, label: "" };
  },

  /* ======================
     TELEMETRÍA
  ====================== */

  async getLatestTelemetry(deviceId: string): Promise<Telemetry | null> {
    const d = await request<any>(
      `/telemetry/latest/${encodeURIComponent(deviceId)}`
    );
    if (!d || (typeof d === "object" && Object.keys(d).length === 0)) return null;
    return d as Telemetry;
  },

  async getTelemetryHistory(deviceId: string): Promise<Telemetry[]> {
    const d = await request<any[]>(
      `/telemetry/history/${encodeURIComponent(deviceId)}`
    );
    if (!Array.isArray(d)) return [];
    return d as Telemetry[];
  },

  async pushTelemetry(payload: {
    deviceId: string;
    humedad?: number;
    pureza?: number;
    estado?: string;
    name?: string;
    minutos?: number;
  }) {
    return request<Telemetry>("/telemetry/push", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async openBleSession(deviceId: string) {
    return request("/telemetry/open-session", {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    });
  },

  async closeBleSession(deviceId: string) {
    return request("/telemetry/close-session", {
      method: "POST",
      body: JSON.stringify({ deviceId }),
    });
  },
};
