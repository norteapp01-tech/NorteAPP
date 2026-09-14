import type { GeoPoint, PauseInterval, SportModality } from "./sport-store";
import type { RoutePoint } from "./sport-route-geometry";

// ---------------------------------------------------------------------------
// Buffer local (IndexedDB) da atividade em andamento — só existe uma de cada
// vez. Todo ponto capturado é gravado aqui antes de qualquer sincronização
// com o Supabase, então um reload/crash da aba nunca perde o que já foi
// percorrido: ao reabrir, dá pra recuperar exatamente daqui.
// ---------------------------------------------------------------------------

const DB_NAME = "norte-esportes";
const STORE = "recording";
const RECORD_ID = "current";

export type RecordingState = {
  modality: SportModality;
  executionId?: string;
  startedAt: string;
  points: GeoPoint[];
  pauses: PauseInterval[];
  routeId?: string;
  routePoints?: RoutePoint[];
  routeGuidanceMode?: "livre" | "com_avisos";
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecordingState(state: RecordingState): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(state, RECORD_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadRecordingState(): Promise<RecordingState | null> {
  const db = await openDb();
  const result = await new Promise<RecordingState | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(RECORD_ID);
    req.onsuccess = () => resolve((req.result as RecordingState) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function clearRecordingState(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(RECORD_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
