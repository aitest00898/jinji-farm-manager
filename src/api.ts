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
export interface CaretakerAssignment { id?: string; farmId: string; farmName: string; effectiveFrom: string; effectiveTo: string | null; isPrimary: boolean }
export interface Caretaker { id: string; name: string; active: boolean; note: string | null; version: number; assignments?: CaretakerAssignment[] }
export interface Dashboard { asOf: string; counts: { farms: number; productionFarms: number; testFarms: number; caretakers: number; activeFlocks: number }; stock: number; today: Record<string, number>; upcomingShipments: number; finance: { net: number }; dataHealth: { warnings: string[] } }
export interface OperationalEvent { id: string; farmId: string; farmName: string; environment: string; houseId: string | null; house: string | null; flockId: string | null; intent: string; quantity: number; unit: string; eventDate: string; note: string | null; reversedAt: string | null; reversalReason: string | null; reversalOfEventId?: string | null; correctionOfEventId?: string | null; sourceEventId: string; createdAt: string }
export interface ChartPoint { date: string; value: number }
export interface ChartResponse { metric: string; from: string; to: string; granularity: "daily" | "weekly" | "monthly"; unit: string; definition: string; status: "ok" | "insufficient-data"; series: ChartPoint[]; denominator?: number; derived?: boolean }
export interface AuditRow { id: string; source: "line" | "web" | "system" | "migration"; actorType: string; actorId: string | null; action: string; entityType: string; entityId: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; changedFields: string[]; reason: string | null; requestId: string; createdAt: string }
export interface DataHealthCheck { code: string; count: number; label: string }
export interface DataHealth { warnings: string[]; checks?: DataHealthCheck[]; checkedAt: string }
export interface FinanceData { totals: Record<string, number>; investors: Array<Record<string, unknown>>; farms: Array<Record<string, unknown>>; distributions: Array<Record<string, unknown>>; allocations: Array<Record<string, unknown>> }
export interface Alias { id: string; farmId: string; farmName: string; alias: string; normalizedAlias: string; aliasType: string; status: string; confirmationCount: number; lastConfirmedAt: string | null; createdAt: string; updatedAt: string }

export function queryString(values: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

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
  dashboard() { return this.request<Dashboard>("/api/dashboard"); }
  organizations() { return this.request<{ organizations: Array<{ id: string; name: string; active: boolean } | null> }>("/api/organizations"); }
  farms(environment?: string) { return this.request<{ farms: Farm[] }>(`/api/farms${queryString({ environment })}`); }
  createFarm(body: Record<string, unknown>) { return this.request<{ farm: Farm }>("/api/farms", { method: "POST", body: JSON.stringify(body) }); }
  updateFarm(id: string, body: Record<string, unknown>) { return this.request<{ farm: Farm }>(`/api/farms/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  caretakers(history = false) { return this.request<{ caretakers: Caretaker[]; history: boolean }>(`/api/caretakers${history ? "?history=1" : ""}`); }
  createCaretaker(body: Record<string, unknown>) { return this.request<{ caretaker: Caretaker }>("/api/caretakers", { method: "POST", body: JSON.stringify(body) }); }
  updateCaretaker(id: string, body: Record<string, unknown>) { return this.request<{ caretaker: Caretaker }>(`/api/caretakers/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  assignCaretaker(farmId: string, body: Record<string, unknown>) { return this.request(`/api/farms/${encodeURIComponent(farmId)}/caretakers`, { method: "POST", body: JSON.stringify(body) }); }
  houses(farmId?: string) { return this.request<{ houses: House[] }>(`/api/houses${queryString({ farmId })}`); }
  createHouse(body: Record<string, unknown>) { return this.request<{ house: House }>("/api/houses", { method: "POST", body: JSON.stringify(body) }); }
  updateHouse(id: string, body: Record<string, unknown>) { return this.request<{ house: House }>(`/api/houses/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  flocks(farmId?: string) { return this.request<{ flocks: Flock[] }>(`/api/flocks${queryString({ farmId })}`); }
  createFlock(body: Record<string, unknown>) { return this.request<{ flock: Flock }>("/api/flocks", { method: "POST", body: JSON.stringify(body) }); }
  updateFlock(id: string, body: Record<string, unknown>) { return this.request<{ flock: Flock }>(`/api/flocks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body) }); }
  events(params: Record<string, string | number | null | undefined> = {}) { return this.request<{ events: OperationalEvent[]; nextCursor: string | null }>(`/api/operational-events${queryString(params)}`); }
  createEvent(body: Record<string, unknown>) { return this.request("/api/operational-events", { method: "POST", body: JSON.stringify(body) }); }
  reverseEvent(id: string, reason: string) { return this.request(`/api/operational-events/${encodeURIComponent(id)}/reverse`, { method: "POST", body: JSON.stringify({ reason }) }); }
  correctEvent(id: string, body: Record<string, unknown>) { return this.request(`/api/operational-events/${encodeURIComponent(id)}/correct`, { method: "POST", body: JSON.stringify(body) }); }
  finance() { return this.request<FinanceData>("/api/finance"); }
  chart(metric: string, filters: Record<string, string | number | null | undefined> = {}) { return this.request<ChartResponse>(`/api/charts/${encodeURIComponent(metric)}${queryString(filters)}`); }
  audit(params: Record<string, string | number | null | undefined> = {}) { return this.request<{ auditLogs: AuditRow[]; nextCursor: string | null }>(`/api/audit${queryString({ limit: 50, ...params })}`); }
  aliases() { return this.request<{ aliases: Alias[] }>("/api/farm-aliases"); }
  dataHealth() { return this.request<DataHealth>("/api/data-health"); }
}
