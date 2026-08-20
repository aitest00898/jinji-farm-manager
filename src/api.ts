export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?? "https://chicken-line-production.jinji-assistant.workers.dev";

export interface ApiError extends Error { status: number; code?: string }

export interface Farm {
  id: string; name: string; siteName: string | null; active: boolean; environment: "production" | "test";
  structureMode: "whole_farm" | "multi_house"; note: string | null; version: number;
  playerGroupEquityFraction: number; createdAt: string; updatedAt: string;
}

export interface House { id: string; farmId: string; name: string; normalizedName: string; capacity: number | null; active: boolean; note: string | null; version: number; createdAt: string; updatedAt: string; farmName?: string; farmEnvironment?: string }
export interface Flock { id: string; farmId: string; houseId: string; batchCode: string; breed: string | null; chickInDate: string; initialCount: number; expectedShipmentDate: string | null; actualShipmentDate: string | null; status: "active" | "closed" | "cancelled"; note: string | null; version: number; ageDays: number | null; shipmentReminder: string | null; farmName?: string; houseName?: string }
export interface Caretaker { id: string; name: string; active: boolean; note: string | null; version: number; assignments?: Array<{ farmId: string; farmName: string; effectiveFrom: string; effectiveTo: string | null; isPrimary: boolean }> }
export interface Dashboard { asOf: string; counts: { farms: number; productionFarms: number; testFarms: number; caretakers: number; activeFlocks: number }; stock: number; today: Record<string, number>; upcomingShipments: number; finance: { net: number }; dataHealth: { warnings: string[] } }
export interface OperationalEvent { id: string; farmId: string; farmName: string; environment: string; houseId: string | null; house: string | null; flockId: string | null; intent: string; quantity: number; unit: string; eventDate: string; note: string | null; reversedAt: string | null; reversalReason: string | null; sourceEventId: string; createdAt: string }
export interface ChartPoint { date: string; value: number }

export class ApiClient {
  private token: string | null = null;
  setToken(token: string | null): void { this.token = token; }
  hasToken(): boolean { return Boolean(this.token); }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const error = new Error(typeof payload.message === "string" ? payload.message : "伺服器操作失敗。") as ApiError;
      error.status = response.status;
      error.code = typeof payload.error === "string" ? payload.error : undefined;
      throw error;
    }
    return payload as T;
  }
  login(password: string) { return this.request<{ authenticated: boolean; token: string; expiresAt: string; organization: { id: string; name: string } }>("/api/web/auth/login", { method: "POST", body: JSON.stringify({ password }) }); }
  session() { return this.request<{ authenticated: boolean; privileged?: boolean; expiresAt?: string }>("/api/web/auth/session"); }
  authorize(password: string) { return this.request<{ authorized: boolean; privilegedExpiresAt: string }>("/api/web/auth/authorize", { method: "POST", body: JSON.stringify({ password }) }); }
  logout() { return this.request<{ authenticated: boolean }>("/api/web/auth/logout", { method: "POST" }); }
  dashboard() { return this.request<{ asOf: string; counts: Dashboard["counts"]; stock: number; today: Record<string, number>; upcomingShipments: number; finance: { net: number }; dataHealth: { warnings: string[] } }>("/api/dashboard"); }
  farms(environment?: string) { return this.request<{ farms: Farm[] }>(`/api/farms${environment ? `?environment=${encodeURIComponent(environment)}` : ""}`); }
  createFarm(body: Record<string, unknown>) { return this.request<{ farm: Farm }>("/api/farms", { method: "POST", body: JSON.stringify(body) }); }
  updateFarm(id: string, body: Record<string, unknown>) { return this.request<{ farm: Farm }>(`/api/farms/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  caretakers() { return this.request<{ caretakers: Caretaker[] }>("/api/caretakers"); }
  createCaretaker(body: Record<string, unknown>) { return this.request<{ caretaker: Caretaker }>("/api/caretakers", { method: "POST", body: JSON.stringify(body) }); }
  updateCaretaker(id: string, body: Record<string, unknown>) { return this.request<{ caretaker: Caretaker }>(`/api/caretakers/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  assignCaretaker(farmId: string, body: Record<string, unknown>) { return this.request(`/api/farms/${encodeURIComponent(farmId)}/caretakers`, { method: "POST", body: JSON.stringify(body) }); }
  houses(farmId?: string) { return this.request<{ houses: House[] }>(`/api/houses${farmId ? `?farmId=${encodeURIComponent(farmId)}` : ""}`); }
  createHouse(body: Record<string, unknown>) { return this.request<{ house: House }>("/api/houses", { method: "POST", body: JSON.stringify(body) }); }
  updateHouse(id: string, body: Record<string, unknown>) { return this.request<{ house: House }>(`/api/houses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  flocks(farmId?: string) { return this.request<{ flocks: Flock[] }>(`/api/flocks${farmId ? `?farmId=${encodeURIComponent(farmId)}` : ""}`); }
  createFlock(body: Record<string, unknown>) { return this.request<{ flock: Flock }>("/api/flocks", { method: "POST", body: JSON.stringify(body) }); }
  updateFlock(id: string, body: Record<string, unknown>) { return this.request<{ flock: Flock }>(`/api/flocks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  events(params = "") { return this.request<{ events: OperationalEvent[]; nextCursor: string | null }>(`/api/operational-events${params}`); }
  createEvent(body: Record<string, unknown>) { return this.request("/api/operational-events", { method: "POST", body: JSON.stringify(body) }); }
  reverseEvent(id: string, reason: string) { return this.request(`/api/operational-events/${encodeURIComponent(id)}/reverse`, { method: "POST", body: JSON.stringify({ reason }) }); }
  correctEvent(id: string, body: Record<string, unknown>) { return this.request(`/api/operational-events/${encodeURIComponent(id)}/correct`, { method: "POST", body: JSON.stringify(body) }); }
  finance() { return this.request<{ totals: Record<string, number>; investors: Array<Record<string, unknown>>; farms: Array<Record<string, unknown>> }>("/api/finance"); }
  chart(metric: string) { return this.request<{ metric: string; series: ChartPoint[] }>(`/api/charts/${metric}`); }
  audit() { return this.request<{ auditLogs: Array<Record<string, unknown>> }>("/api/audit?limit=100"); }
}
