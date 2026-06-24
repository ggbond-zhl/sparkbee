import type { EventRecord, Station, StationDetail, StationFormInput } from "./types";

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers
    },
    ...init
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json()) as ApiEnvelope<T> | ApiErrorEnvelope;
  if (!response.ok) {
    throw new Error("error" in body ? body.error.message : "请求失败");
  }

  return (body as ApiEnvelope<T>).data;
}

export const api = {
  login(password: string) {
    return request<{ subject: "admin" }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });
  },
  logout() {
    return request<void>("/api/auth/logout", { method: "POST" });
  },
  session() {
    return request<{ subject: "admin"; expiresAt: number }>("/api/auth/session");
  },
  listStations() {
    return request<Station[]>("/api/stations");
  },
  createStation(input: StationFormInput) {
    return request<Station>("/api/stations", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  updateStation(id: string, input: Partial<StationFormInput>) {
    return request<Station>(`/api/stations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  },
  getStation(id: string) {
    return request<StationDetail>(`/api/stations/${id}`);
  },
  deleteStation(id: string) {
    return request<void>(`/api/stations/${id}`, { method: "DELETE" });
  },
  startStation(id: string) {
    return request<Station>(`/api/stations/${id}/start`, { method: "POST" });
  },
  stopStation(id: string) {
    return request<void>(`/api/stations/${id}/stop`, { method: "POST" });
  },
  plug(id: string, connectorId: number) {
    return request(`/api/stations/${id}/connectors/${connectorId}/plug`, { method: "POST" });
  },
  unplug(id: string, connectorId: number) {
    return request(`/api/stations/${id}/connectors/${connectorId}/unplug`, { method: "POST" });
  },
  authorize(id: string, connectorId: number, idTag: string) {
    return request(`/api/stations/${id}/authorize`, {
      method: "POST",
      body: JSON.stringify({ connectorId, idTag })
    });
  },
  startTransaction(id: string, connectorId: number, idTag: string, meterStartWh: number) {
    return request<{ status: "accepted" | "rejected"; transactionId?: string; reason?: string }>(
      `/api/stations/${id}/transactions/start`,
      {
        method: "POST",
        body: JSON.stringify({ connectorId, idTag, meterStartWh })
      },
    );
  },
  reportMeterValue(id: string, transactionId: string, meterWh: number) {
    return request(`/api/stations/${id}/transactions/${transactionId}/meter-values`, {
      method: "POST",
      body: JSON.stringify({ meterWh })
    });
  },
  stopTransaction(id: string, transactionId: string, meterStopWh: number) {
    return request(`/api/stations/${id}/transactions/${transactionId}/stop`, {
      method: "POST",
      body: JSON.stringify({ reason: "local", meterStopWh })
    });
  },
  listEvents(id: string) {
    return request<EventRecord[]>(`/api/stations/${id}/events?limit=200`);
  }
};
