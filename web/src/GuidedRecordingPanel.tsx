import { useEffect, useMemo, useState, type FormEvent } from "react";
import { type ApiClient, type Farm, type Flock, type House, type OperationalEnvironment } from "./api";
import {
  GUIDED_AREAS,
  buildGuidedRecord,
  dateField,
  fieldLabel,
  fieldOptions,
  guidedFields,
  numericField,
  scopeRequirements,
  type GuidedArea,
} from "./guided-recording";
import { recordingDefinition, type TaxonomyId } from "./recording-taxonomy";

const optionLabels: Record<string, string> = {
  good: "良好", fair: "普通", poor: "不佳",
  male: "公", female: "母", mixed: "混合", unspecified: "未指定",
  kg: "公斤", bag: "包",
  pending: "待處理", waiting_result: "等待結果", completed: "已完成",
  small: "少量", medium: "中等", large: "大量",
};

function optionsFor(field: string, taxonomyId: TaxonomyId): readonly string[] | null {
  if (field === "workflowStatus" && taxonomyId === "O6") return ["waiting_result", "completed"];
  if (field === "workflowStatus" && taxonomyId === "O7") return ["pending", "completed"];
  return fieldOptions(field);
}

export function GuidedRecordingPanel({
  client,
  onCommitted,
}: {
  client: ApiClient;
  onCommitted?: (environment: OperationalEnvironment) => Promise<void> | void;
}) {
  const [environment, setEnvironment] = useState<OperationalEnvironment>("production");
  const [area, setArea] = useState<GuidedArea>("operational");
  const [taxonomyId, setTaxonomyId] = useState<TaxonomyId>("O9");
  const definition = recordingDefinition(taxonomyId);
  const [subtype, setSubtype] = useState(definition.subtypes[0] ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [farmId, setFarmId] = useState("");
  const [houseId, setHouseId] = useState("");
  const [flockId, setFlockId] = useState("");
  const [wholeFarmConfirmed, setWholeFarmConfirmed] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [farms, setFarms] = useState<Farm[]>([]);
  const [houses, setHouses] = useState<House[]>([]);
  const [flocks, setFlocks] = useState<Flock[]>([]);
  const [scopeBusy, setScopeBusy] = useState(false);
  const [writeBusy, setWriteBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const areaDefinitions = useMemo(
    () => GUIDED_AREAS[area].ids.map((id) => recordingDefinition(id)),
    [area],
  );
  const requirements = scopeRequirements(taxonomyId);
  const fields = guidedFields(taxonomyId, values);
  const availableHouses = houses.filter((house) => house.farmId === farmId && house.active);
  const availableFlocks = flocks.filter((flock) =>
    flock.farmId === farmId && (!houseId || flock.houseId === houseId) && flock.status === "active",
  );

  useEffect(() => {
    let active = true;
    setScopeBusy(true);
    setError("");
    setFarmId("");
    setHouseId("");
    setFlockId("");
    setWholeFarmConfirmed(false);
    Promise.all([
      client.farms(environment),
      client.houses(undefined, environment),
      client.flocks(undefined, environment),
    ]).then(([farmData, houseData, flockData]) => {
      if (!active) return;
      setFarms(farmData.farms);
      setHouses(houseData.houses);
      setFlocks(flockData.flocks);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "無法載入目前資料 scope。");
    }).finally(() => {
      if (active) setScopeBusy(false);
    });
    return () => { active = false; };
  }, [client, environment]);

  function selectTaxonomy(next: TaxonomyId) {
    const nextDefinition = recordingDefinition(next);
    setTaxonomyId(next);
    setSubtype(nextDefinition.subtypes[0] ?? "");
    setValues({});
    setHouseId("");
    setFlockId("");
    setWholeFarmConfirmed(false);
    setError("");
    setMessage("");
  }

  function changeArea(next: GuidedArea) {
    setArea(next);
    const first = GUIDED_AREAS[next].ids[0];
    selectTaxonomy(first);
  }

  function setField(field: string, raw: string) {
    let value: unknown = raw;
    if (numericField(field)) value = raw === "" ? "" : Number(raw);
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setWriteBusy(true);
    try {
      const uuid = crypto.randomUUID();
      const record = buildGuidedRecord({
        area,
        taxonomyId,
        subtype,
        date,
        scope: { farmId, houseId: houseId || undefined, flockId: flockId || undefined, wholeFarmConfirmed },
        values,
      }, {
        id: `web-guided-${uuid}`,
        clientOperationId: `web-guided-${uuid}`,
      });
      await client.createRecord({ record }, environment);
      setMessage(`已寫入 ${environment === "test" ? "Test" : "Production"} scope：${definition.label}。`);
      setValues({});
      await onCommitted?.(environment);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "寫入失敗；沒有送出第二次。");
    } finally {
      setWriteBusy(false);
    }
  }

  return <section className="panel guided-recording-panel">
    <div className="panel-title"><div><h3>完整記錄</h3><p className="muted">使用 O1–O9 / A1–A16 正式 taxonomy，寫入同一個 canonical Worker contract。</p></div></div>

    <div className="segmented" role="group" aria-label="資料類型">
      <button type="button" className={area === "operational" ? "selected" : ""} onClick={() => changeArea("operational")}>營運資料</button>
      <button type="button" className={area === "abnormal" ? "selected" : ""} onClick={() => changeArea("abnormal")}>異常登錄</button>
    </div>

    <form className="inline-form guided-recording-form" onSubmit={submit}>
      <label>資料 scope
        <select value={environment} onChange={(event) => setEnvironment(event.target.value as OperationalEnvironment)}>
          <option value="production">Production</option>
          <option value="test">Test（明確選取）</option>
        </select>
      </label>
      <label>分類
        <select value={taxonomyId} onChange={(event) => selectTaxonomy(event.target.value as TaxonomyId)}>
          {areaDefinitions.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.label}</option>)}
        </select>
      </label>
      <label>子類型
        <select value={subtype} onChange={(event) => setSubtype(event.target.value)}>
          {definition.subtypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label>發生日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      <label>雞場
        <select disabled={scopeBusy} value={farmId} onChange={(event) => { setFarmId(event.target.value); setHouseId(""); setFlockId(""); setWholeFarmConfirmed(false); }}>
          <option value="">請選擇</option>
          {farms.filter((farm) => farm.active).map((farm) => <option key={farm.id} value={farm.id}>{farm.name}</option>)}
        </select>
      </label>
      <label>雞舍{requirements.houseRequired ? "（必填）" : "（可選）"}
        <select disabled={!farmId || scopeBusy} value={houseId} onChange={(event) => { setHouseId(event.target.value); setFlockId(""); setWholeFarmConfirmed(false); }}>
          <option value="">{requirements.wholeFarmAllowed ? "整場" : "請選擇"}</option>
          {availableHouses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
        </select>
      </label>
      {(requirements.flockRequired || houseId) && <label>批次{requirements.flockRequired ? "（必填）" : "（可選）"}
        <select disabled={!houseId || scopeBusy} value={flockId} onChange={(event) => setFlockId(event.target.value)}>
          <option value="">請選擇</option>
          {availableFlocks.map((flock) => <option key={flock.id} value={flock.id}>{flock.batchCode}</option>)}
        </select>
      </label>}

      {fields.map((field) => {
        const options = optionsFor(field, taxonomyId);
        const required = definition.required.includes(field)
          || (taxonomyId === "O6" && values.workflowStatus === "completed" && (field === "result" || field === "completedAt"))
          || (taxonomyId === "A12" && subtype === "other" && field === "detail");
        if (options) return <label key={field}>{fieldLabel(field)}{required ? "（必填）" : "（可選）"}
          <select value={String(values[field] ?? "")} onChange={(event) => setField(field, event.target.value)}>
            <option value="">請選擇</option>
            {options.map((option) => <option key={option} value={option}>{optionLabels[option] ?? option}</option>)}
          </select>
        </label>;
        return <label key={field}>{fieldLabel(field)}{required ? "（必填）" : "（可選）"}
          <input
            type={dateField(field) ? "date" : numericField(field) ? "number" : "text"}
            step={numericField(field) ? "any" : undefined}
            value={String(values[field] ?? "")}
            onChange={(event) => setField(field, event.target.value)}
          />
        </label>;
      })}

      {requirements.wholeFarmAllowed && farmId && !houseId && <label className="checkbox-row">
        <input type="checkbox" checked={wholeFarmConfirmed} onChange={(event) => setWholeFarmConfirmed(event.target.checked)} />
        確認這筆紀錄是整場範圍，不是漏選雞舍
      </label>}
      <button className="primary" disabled={scopeBusy || writeBusy || !farmId}>{writeBusy ? "寫入中…" : "寫入 canonical 紀錄"}</button>
    </form>

    <div className={environment === "test" ? "notice" : "muted"}>
      目前 scope：<strong>{environment === "test" ? "Test" : "Production"}</strong>。切換 Test 必須由已登入操作人明確選取，不會以 URL 或 fixture 自動切換。
    </div>
    {message && <p className="healthy">{message}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
  </section>;
}
