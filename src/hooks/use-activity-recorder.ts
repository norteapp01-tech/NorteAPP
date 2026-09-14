import { useCallback, useEffect, useRef, useState } from "react";
import {
  filterValidPoints,
  type GeoPoint,
  type PauseInterval,
  type SportModality,
} from "@/lib/sport-store";
import {
  saveRecordingState,
  loadRecordingState,
  clearRecordingState,
  type RecordingState,
} from "@/lib/sport-recording-db";
import {
  deriveRouteGuidance,
  computeRouteGuidanceState,
  type RouteGuidance,
  type RouteGuidanceState,
  type RoutePoint,
} from "@/lib/sport-route-geometry";

export type RouteGuidanceMode = "livre" | "com_avisos";
export type StartRoute = { id: string; points: RoutePoint[]; guidanceMode: RouteGuidanceMode };

// ---------------------------------------------------------------------------
// Motor de gravação — funciona de verdade em primeiro plano (tela ligada,
// aba ativa). Não existe wrapper nativo nesta arquitetura (web puro,
// Cloudflare Workers), então gravação com tela bloqueada não é suportada:
// o Wake Lock aqui só evita a tela apagar sozinha durante a corrida, nunca
// mantém o GPS rodando em segundo plano de verdade.
//
// Instanciado uma única vez na raiz do app (`SportRecorderProvider`) — não
// dentro da rota de gravação — justamente pra sobreviver à navegação: sair
// da tela de gravação pra ver a Agenda não pode derrubar o watchPosition.
// ---------------------------------------------------------------------------

export type RecorderStatus = "idle" | "recording" | "paused" | "finished";

export function useActivityRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [modality, setModality] = useState<SportModality | null>(null);
  const [executionId, setExecutionId] = useState<string | undefined>(undefined);
  const [gpsReady, setGpsReady] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [points, setPoints] = useState<GeoPoint[]>([]);
  const [pauses, setPauses] = useState<PauseInterval[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [recoverable, setRecoverable] = useState<RecordingState | null>(null);
  const [route, setRoute] = useState<StartRoute | null>(null);
  const [routeGuidanceState, setRouteGuidanceState] = useState<RouteGuidanceState | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release(): Promise<void> } | null>(null);
  const pointsRef = useRef<GeoPoint[]>([]);
  const pausesRef = useRef<PauseInterval[]>([]);
  const startedAtRef = useRef<string | null>(null);
  const modalityRef = useRef<SportModality | null>(null);
  const executionIdRef = useRef<string | undefined>(undefined);
  const routeRef = useRef<{ start: StartRoute; guidance: RouteGuidance } | null>(null);
  const routeProgressRef = useRef<number | null>(null);

  useEffect(() => {
    loadRecordingState().then((state) => {
      if (state) setRecoverable(state);
    });
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGpsError("Este navegador não tem suporte a GPS.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setGpsReady(true),
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
      };
      if (nav.wakeLock) wakeLockRef.current = await nav.wakeLock.request("screen");
    } catch {
      // Melhor esforço — a gravação continua normalmente sem o wake lock.
    }
  }, []);
  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, []);

  const persist = useCallback(() => {
    if (!startedAtRef.current || !modalityRef.current) return;
    void saveRecordingState({
      modality: modalityRef.current,
      executionId: executionIdRef.current,
      startedAt: startedAtRef.current,
      points: pointsRef.current,
      pauses: pausesRef.current,
      routeId: routeRef.current?.start.id,
      routePoints: routeRef.current?.start.points,
      routeGuidanceMode: routeRef.current?.start.guidanceMode,
    });
  }, []);

  const beginWatch = useCallback(() => {
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const point: GeoPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          recordedAt: new Date(pos.timestamp).toISOString(),
          accuracyM: pos.coords.accuracy ?? undefined,
          elevationM: pos.coords.altitude ?? undefined,
        };
        pointsRef.current = [...pointsRef.current, point];
        setPoints(pointsRef.current);

        // Guiado por rota: só recalcula progresso/virada com o ponto mais
        // recente se ele passou no mesmo filtro de plausibilidade usado no
        // cálculo de distância — nunca projeta um salto de GPS na rota.
        const activeRoute = routeRef.current;
        if (activeRoute) {
          const lastValid = filterValidPoints(pointsRef.current).at(-1);
          if (lastValid?.recordedAt === point.recordedAt) {
            const state = computeRouteGuidanceState(
              activeRoute.guidance,
              { lat: point.lat, lng: point.lng },
              routeProgressRef.current,
            );
            routeProgressRef.current = state.progressM;
            setRouteGuidanceState(state);
          }
        }

        persist();
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  }, [persist]);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    releaseWakeLock();
  }, [releaseWakeLock]);

  const start = useCallback(
    (m: SportModality, execId?: string, startRoute?: StartRoute) => {
      const nowIso = new Date().toISOString();
      modalityRef.current = m;
      executionIdRef.current = execId;
      startedAtRef.current = nowIso;
      pointsRef.current = [];
      pausesRef.current = [];
      routeRef.current = startRoute
        ? { start: startRoute, guidance: deriveRouteGuidance(startRoute.points) }
        : null;
      routeProgressRef.current = null;
      setModality(m);
      setExecutionId(execId);
      setStartedAt(nowIso);
      setPoints([]);
      setPauses([]);
      setRoute(startRoute ?? null);
      setRouteGuidanceState(null);
      setStatus("recording");
      void requestWakeLock();
      persist();
      beginWatch();
    },
    [requestWakeLock, persist, beginWatch],
  );

  const pause = useCallback(() => {
    pausesRef.current = [...pausesRef.current, { pausedAt: new Date().toISOString() }];
    setPauses(pausesRef.current);
    setStatus("paused");
    persist();
  }, [persist]);

  const resume = useCallback(() => {
    const last = pausesRef.current[pausesRef.current.length - 1];
    if (last && !last.resumedAt) {
      pausesRef.current = [
        ...pausesRef.current.slice(0, -1),
        { ...last, resumedAt: new Date().toISOString() },
      ];
      setPauses(pausesRef.current);
    }
    setStatus("recording");
    persist();
  }, [persist]);

  const finish = useCallback(() => {
    if (!startedAtRef.current || !modalityRef.current) return null;
    stopWatch();
    const endedAt = new Date().toISOString();
    const result = {
      modality: modalityRef.current,
      executionId: executionIdRef.current,
      routeId: routeRef.current?.start.id,
      startedAt: startedAtRef.current,
      endedAt,
      points: pointsRef.current,
      pauses: pausesRef.current,
    };
    setStatus("finished");
    void clearRecordingState();
    return result;
  }, [stopWatch]);

  /** Chamado depois que a atividade finalizada foi salva (ou descartada) —
   * volta o motor pro estado inicial, pronto pra uma próxima gravação. */
  const reset = useCallback(() => {
    modalityRef.current = null;
    executionIdRef.current = undefined;
    pointsRef.current = [];
    pausesRef.current = [];
    startedAtRef.current = null;
    routeRef.current = null;
    routeProgressRef.current = null;
    setModality(null);
    setExecutionId(undefined);
    setPoints([]);
    setPauses([]);
    setStartedAt(null);
    setRoute(null);
    setRouteGuidanceState(null);
    setStatus("idle");
  }, []);

  const discard = useCallback(() => {
    stopWatch();
    void clearRecordingState();
    reset();
  }, [stopWatch, reset]);

  const resumeFromRecovered = useCallback(() => {
    if (!recoverable) return;
    modalityRef.current = recoverable.modality;
    executionIdRef.current = recoverable.executionId;
    startedAtRef.current = recoverable.startedAt;
    pointsRef.current = recoverable.points;
    pausesRef.current = recoverable.pauses;
    const recoveredRoute =
      recoverable.routeId && recoverable.routePoints && recoverable.routeGuidanceMode
        ? {
            id: recoverable.routeId,
            points: recoverable.routePoints,
            guidanceMode: recoverable.routeGuidanceMode,
          }
        : null;
    routeRef.current = recoveredRoute
      ? { start: recoveredRoute, guidance: deriveRouteGuidance(recoveredRoute.points) }
      : null;
    routeProgressRef.current = null;
    setModality(recoverable.modality);
    setExecutionId(recoverable.executionId);
    setStartedAt(recoverable.startedAt);
    setPoints(recoverable.points);
    setPauses(recoverable.pauses);
    setRoute(recoveredRoute);
    setRouteGuidanceState(null);
    const lastPause = pausesRef.current[pausesRef.current.length - 1];
    setStatus(lastPause && !lastPause.resumedAt ? "paused" : "recording");
    setRecoverable(null);
    void requestWakeLock();
    beginWatch();
  }, [recoverable, requestWakeLock, beginWatch]);

  const discardRecovered = useCallback(() => {
    void clearRecordingState();
    setRecoverable(null);
  }, []);

  useEffect(() => () => stopWatch(), [stopWatch]);

  return {
    status,
    modality,
    executionId,
    gpsReady,
    gpsError,
    points,
    pauses,
    startedAt,
    recoverable,
    route,
    routeGuidanceState,
    start,
    pause,
    resume,
    finish,
    reset,
    discard,
    resumeFromRecovered,
    discardRecovered,
  };
}

export type ActivityRecorder = ReturnType<typeof useActivityRecorder>;
