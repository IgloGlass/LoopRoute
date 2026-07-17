import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { Map } from "maplibre-gl";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Download,
  Footprints,
  Leaf,
  LocateFixed,
  MapPin,
  Menu,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Search,
  Settings,
  Share2,
  Square,
  Trees,
  VolumeX,
  Waves,
  WifiOff,
  X,
} from "lucide-react";
import {
  APP_NAME,
  DISTANCE_PRESETS,
  routeLabel,
  type RouteMode,
  type RoutePriorities,
} from "../config/app";
import { distanceToRoute, polylineDistance } from "../geo/distance";
import { useLivePosition } from "../hooks/useLivePosition";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useWakeLock } from "../hooks/useWakeLock";
import { routeWarningText, t } from "../i18n";
import { OpenRouteServiceRoutingProvider, ApiError } from "../providers/routing/openRouteService";
import { searchPlaces, type GeocodingResult } from "../providers/geocoding/openRouteService";
import { downloadGpx } from "../services/gpx";
import {
  exploratoryShapePoints,
  generateCandidates,
  isDistinctCandidate,
  randomSeed,
} from "../services/routeGeneration";
import { buildShareUrl, parseShareUrl, sharePlan } from "../services/share";
import { clearState, loadState, saveState, type Preferences } from "../services/storage";
import type { NormalizedRoute, RouteRequest } from "../types/route";
import { RouteCard } from "../components/routes/RouteCard";
import { ElevationProfile } from "../components/routes/ElevationProfile";
import { DirectionsDialog } from "../components/routes/DirectionsDialog";
import { SettingsDialog } from "../components/settings/SettingsDialog";
import { ShareDialog } from "../components/routes/ShareDialog";
import { appReducer, initialAppState } from "./appTypes";

const provider = new OpenRouteServiceRoutingProvider();
const MapView = lazy(() =>
  import("../components/map/MapView").then((module) => ({ default: module.MapView })),
);

const formatDistance = (
  meters: number,
  units: Preferences["units"],
  locale: Preferences["language"],
) => {
  const value = units === "mi" ? meters / 1609.344 : meters / 1000;
  return `${new Intl.NumberFormat(locale === "sv" ? "sv-SE" : "en", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units}`;
};

const distanceInputValue = (meters: number, units: Preferences["units"]) =>
  Number((meters / (units === "mi" ? 1609.344 : 1000)).toFixed(1));

const formatProximity = (meters: number, units: Preferences["units"]) =>
  units === "mi" ? `${Math.round(meters * 3.28084)} ft` : `${Math.round(meters)} m`;

const mapError = (error: unknown, language: Preferences["language"]) => {
  if (error instanceof ApiError) {
    if (error.status === 429) return t(language, "quota");
    if (error.status === 503 && /config/i.test(error.message)) return t(language, "notConfigured");
    if (error.status >= 500) return t(language, "providerUnavailable");
  }
  return error instanceof Error ? error.message : t(language, "noRoutes");
};

export default function App() {
  const stored = useMemo(() => loadState(), []);
  const sharedPlan = useMemo(() => parseShareUrl(window.location.search), []);
  const [state, dispatch] = useReducer(appReducer, {
    ...initialAppState,
    start: sharedPlan?.start ?? stored.lastStart,
    stage: sharedPlan || stored.lastStart ? "ready" : "locating",
    candidates: stored.selectedRoute ? [stored.selectedRoute] : [],
    selectedId: stored.selectedRoute?.id,
  });
  const [preferences, setPreferences] = useState<Preferences>(() => ({
    ...stored.preferences,
    ...(sharedPlan
      ? {
          units: sharedPlan.units,
          mode: sharedPlan.mode,
          avoidSteps: sharedPlan.avoidSteps,
          routePriorities: sharedPlan.priorities,
        }
      : {}),
  }));
  const [targetDistance, setTargetDistance] = useState(sharedPlan?.distanceMeters ?? 5000);
  const [custom, setCustom] = useState(
    distanceInputValue(sharedPlan?.distanceMeters ?? 5000, preferences.units),
  );
  const [setStartMode, setSetStartMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [followMap, setFollowMap] = useState(true);
  const [followError, setFollowError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [generatingAnother, setGeneratingAnother] = useState(false);
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);
  const [undoRoutes, setUndoRoutes] = useState<{
    candidates: NormalizedRoute[];
    selectedId?: string;
  }>();
  const abortRef = useRef<AbortController | undefined>(undefined);
  const searchAbortRef = useRef<AbortController | undefined>(undefined);
  const selectedSuggestionQueryRef = useRef("");
  const undoTimerRef = useRef<number | undefined>(undefined);
  const mapRef = useRef<Map | undefined>(undefined);
  const sheetScrollRef = useRef<HTMLDivElement | null>(null);
  const sheetDragRef = useRef({
    active: false,
    moved: false,
    startY: 0,
    lastY: 0,
    lastTime: 0,
    velocity: 0,
    suppressClick: false,
  });
  const requestId = useRef(0);
  const online = useNetworkStatus();
  const language = preferences.language;
  const distanceUnitMeters = preferences.units === "mi" ? 1609.344 : 1000;
  const maxCustomDistance = 100_000 / distanceUnitMeters;
  const selected = state.candidates.find((route) => route.id === state.selectedId);
  const following = state.stage === "following";
  const onFollowError = useCallback(
    (reason: string) =>
      setFollowError(
        reason === "denied"
          ? t(language, "permissionDenied")
          : reason === "unsupported"
            ? t(language, "followingUnsupported")
            : t(language, "locationUnavailable"),
      ),
    [language],
  );
  const livePosition = useLivePosition(following, onFollowError);
  useWakeLock(following);

  const dark =
    preferences.theme === "dark" ||
    (preferences.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.lang = language;
    saveState({
      version: 1,
      preferences,
      lastStart: state.start,
      selectedRoute: selected,
      safetyDismissed: stored.safetyDismissed,
    });
  }, [dark, language, preferences, state.start, selected, stored.safetyDismissed]);

  useEffect(() => {
    if (!online) dispatch({ type: "OFFLINE" });
    else if (state.stage === "offline") dispatch({ type: "ONLINE" });
  }, [online, state.stage]);

  const locate = useCallback(
    (force = false) => {
      if (!navigator.geolocation) {
        dispatch({
          type: "LOCATION_FAILED",
          message: t(language, "locationUnavailable"),
          fallback: stored.lastStart,
        });
        return;
      }
      if (
        !window.isSecureContext &&
        location.hostname !== "localhost" &&
        location.hostname !== "127.0.0.1"
      ) {
        dispatch({
          type: "LOCATION_FAILED",
          message: t(language, "locationUnavailable"),
          fallback: stored.lastStart,
        });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const start: [number, number] = [position.coords.longitude, position.coords.latitude];
          dispatch({
            type: "START_READY",
            start,
            accuracy: position.coords.accuracy,
            message: position.coords.accuracy > 100 ? t(language, "lowAccuracy") : undefined,
          });
          mapRef.current?.flyTo({ center: start, zoom: 14 });
        },
        (error) =>
          dispatch({
            type: "LOCATION_FAILED",
            message:
              error.code === 1
                ? t(language, "locationDenied")
                : error.code === 3
                  ? t(language, "locationTimeout")
                  : t(language, "locationUnavailable"),
            fallback: stored.lastStart,
          }),
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: force ? 0 : 60_000 },
      );
    },
    [language, stored.lastStart],
  );

  useEffect(() => {
    if (!sharedPlan) locate();
  }, [locate, sharedPlan]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      searchAbortRef.current?.abort();
      window.clearTimeout(undoTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (sheetScrollRef.current) sheetScrollRef.current.scrollTop = 0;
  }, [state.stage]);

  const startSheetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!window.matchMedia("(max-width: 699px)").matches) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    sheetDragRef.current = {
      active: true,
      moved: false,
      startY: event.clientY,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      suppressClick: false,
    };
    setSheetDragging(true);
  };

  const moveSheetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = sheetDragRef.current;
    if (!drag.active) return;
    const delta = event.clientY - drag.startY;
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    drag.velocity = (event.clientY - drag.lastY) / elapsed;
    drag.lastY = event.clientY;
    drag.lastTime = event.timeStamp;
    drag.moved ||= Math.abs(delta) > 5;
    if (drag.moved) event.preventDefault();
    const directionalDelta = expanded ? Math.max(0, delta) : Math.min(0, delta);
    setSheetDragOffset(Math.max(-220, Math.min(220, directionalDelta)));
  };

  const finishSheetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = sheetDragRef.current;
    if (!drag.active) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const delta = event.clientY - drag.startY;
    if (drag.moved) {
      const shouldCollapse = expanded && (delta > 56 || drag.velocity > 0.35);
      const shouldExpand = !expanded && (delta < -44 || drag.velocity < -0.35);
      if (shouldCollapse) setExpanded(false);
      if (shouldExpand) setExpanded(true);
      drag.suppressClick = true;
    }
    drag.active = false;
    setSheetDragging(false);
    setSheetDragOffset(0);
  };

  const cancelSheetDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    sheetDragRef.current.active = false;
    sheetDragRef.current.suppressClick = true;
    setSheetDragging(false);
    setSheetDragOffset(0);
  };

  const toggleSheet = () => {
    if (sheetDragRef.current.suppressClick) {
      sheetDragRef.current.suppressClick = false;
      return;
    }
    setExpanded((value) => !value);
  };

  const changeStart = (coordinate: [number, number]) => {
    abortRef.current?.abort();
    dispatch({
      type: "START_CHANGED",
      start: coordinate,
      message: state.candidates.length ? t(language, "startChanged") : undefined,
    });
    setSetStartMode(false);
    setSearchResults([]);
    setSuggestionsOpen(false);
  };

  const performPlaceSearch = useCallback(
    async (searchQuery: string, signal: AbortSignal) => {
      setSearching(true);
      setSearchMessage("");
      try {
        const results = await searchPlaces(searchQuery, state.start, signal);
        setSearchResults(results);
        setActiveSuggestion(results.length ? 0 : -1);
        setSuggestionsOpen(results.length > 0);
        if (!results.length) setSearchMessage(t(language, "noResults"));
      } catch (error) {
        if ((error as Error)?.name !== "AbortError")
          setSearchMessage(
            error instanceof Error ? error.message : t(language, "providerUnavailable"),
          );
      } finally {
        if (!signal.aborted) setSearching(false);
      }
    },
    [language, state.start],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (selectedSuggestionQueryRef.current === query) {
      selectedSuggestionQueryRef.current = "";
      return;
    }
    if (trimmed.length < 3 || !online || state.candidates.length) {
      searchAbortRef.current?.abort();
      return;
    }
    searchAbortRef.current?.abort();
    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      void performPlaceSearch(trimmed, controller.signal);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [online, performPlaceSearch, query, state.candidates.length]);

  const selectSearchResult = (result: GeocodingResult) => {
    selectedSuggestionQueryRef.current = result.label;
    setQuery(result.label);
    setSearchResults([]);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
    changeStart([result.longitude, result.latitude]);
  };

  const makeBase = (): Omit<RouteRequest, "seed" | "roundTripPoints"> | undefined =>
    state.start
      ? {
          start: { longitude: state.start[0], latitude: state.start[1] },
          targetDistanceMeters: targetDistance,
          mode: preferences.mode,
          avoidSteps: preferences.avoidSteps,
          priorities: preferences.routePriorities,
        }
      : undefined;

  const generate = async (seed?: number) => {
    const base = makeBase();
    if (!base || !online) {
      dispatch({
        type: "ERROR",
        message: !base ? t(language, "noStart") : t(language, "offlineHint"),
      });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const id = ++requestId.current;
    dispatch({ type: "GENERATING", requestId: id });
    try {
      if (seed) {
        const route = await provider.route(
          { ...base, seed, roundTripPoints: exploratoryShapePoints(seed) },
          controller.signal,
        );
        dispatch({ type: "RESULTS", requestId: id, candidates: [route] });
      } else {
        const result = await generateCandidates(provider, base, controller.signal);
        const fatal = !result.routes.length ? result.errors[0] : undefined;
        dispatch({
          type: "RESULTS",
          requestId: id,
          candidates: result.routes,
          error: fatal
            ? mapError(fatal, language)
            : result.routes.length < 3
              ? t(language, "partialResults")
              : undefined,
        });
      }
    } catch (error) {
      if (!controller.signal.aborted)
        dispatch({
          type: "RESULTS",
          requestId: id,
          candidates: [],
          error: mapError(error, language),
        });
    }
  };

  const generateAnother = async () => {
    const base = makeBase();
    if (!base || !online) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setGeneratingAnother(true);
    setAnnouncement(t(language, "generating"));
    try {
      const seed = randomSeed();
      const route = await provider.route(
        { ...base, seed, roundTripPoints: exploratoryShapePoints(seed) },
        controller.signal,
      );
      if (!isDistinctCandidate(state.candidates, route)) {
        setAnnouncement(t(language, "similarRouteSkipped"));
        return;
      }
      dispatch({ type: "APPEND_RESULT", candidate: route });
      setAnnouncement(`${t(language, "newRouteAdded")} ${state.candidates.length + 1}`);
    } catch (error) {
      dispatch({ type: "ERROR", message: mapError(error, language) });
    } finally {
      setGeneratingAnother(false);
    }
  };

  const submitSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 3 || !online) return;
    if (activeSuggestion >= 0 && suggestionsOpen && searchResults[activeSuggestion]) {
      selectSearchResult(searchResults[activeSuggestion]);
      return;
    }
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    await performPlaceSearch(query.trim(), controller.signal);
  };

  const shareSelected = async (precise: boolean) => {
    if (!selected) return;
    const url = buildShareUrl(
      {
        start: selected.requestedStart,
        distanceMeters: selected.targetDistanceMeters,
        mode: preferences.mode,
        avoidSteps: preferences.avoidSteps,
        priorities: preferences.routePriorities,
        seed: selected.seed,
        units: preferences.units,
      },
      precise,
    );
    await sharePlan(url);
    setAnnouncement(t(language, "linkCopied"));
  };

  const followProgress = useMemo(() => {
    if (!selected || !livePosition) return undefined;
    let nearestIndex = 0;
    let nearest = Infinity;
    selected.coordinates.forEach((coordinate, index) => {
      const value = distanceToRoute(livePosition.coordinate, [coordinate]);
      if (value < nearest) {
        nearest = value;
        nearestIndex = index;
      }
    });
    const completed = polylineDistance(selected.coordinates.slice(0, nearestIndex + 1));
    let instructionEnd = 0;
    const nextInstruction = selected.instructions.find((instruction) => {
      instructionEnd += instruction.distanceMeters;
      return instructionEnd > completed;
    });
    return {
      completed,
      remaining: Math.max(0, selected.actualDistanceMeters - completed),
      toRoute: nearest,
      nextInstruction,
      nextDistance: Math.max(0, instructionEnd - completed),
    };
  }, [selected, livePosition]);

  const updatePreferences = (next: Preferences) => {
    if (next.units !== preferences.units) setCustom(distanceInputValue(targetDistance, next.units));
    setPreferences(next);
  };
  const selectPreset = (meters: number) => {
    setTargetDistance(meters);
    setCustom(distanceInputValue(meters, preferences.units));
  };
  const setPriority = (priority: keyof RoutePriorities) =>
    setPreferences({
      ...preferences,
      routePriorities: {
        ...preferences.routePriorities,
        [priority]: !preferences.routePriorities[priority],
      },
    });

  const clearRoutesWithUndo = () => {
    if (!state.candidates.length) return;
    window.clearTimeout(undoTimerRef.current);
    setUndoRoutes({ candidates: state.candidates, selectedId: state.selectedId });
    setDirectionsOpen(false);
    dispatch({ type: "CLEAR" });
    undoTimerRef.current = window.setTimeout(() => setUndoRoutes(undefined), 8_000);
  };

  const undoClearRoutes = () => {
    if (!undoRoutes) return;
    window.clearTimeout(undoTimerRef.current);
    dispatch({
      type: "RESTORE_RESULTS",
      candidates: undoRoutes.candidates,
      selectedId: undoRoutes.selectedId,
    });
    setUndoRoutes(undefined);
  };

  return (
    <main className={`app-shell stage-${state.stage}`}>
      <Suspense
        fallback={<div className="map-canvas map-loading" aria-label={t(language, "loadingMap")} />}
      >
        <MapView
          start={state.start}
          routes={state.candidates}
          selectedId={state.selectedId}
          setStartMode={setStartMode}
          livePosition={livePosition}
          followPosition={followMap}
          panelExpanded={expanded}
          following={following}
          language={language}
          dark={dark}
          onStartChange={changeStart}
          onReady={(map) => {
            mapRef.current = map;
          }}
        />
      </Suspense>

      <header className="topbar">
        <div className="brand">
          <span className="brand-loop" aria-hidden>
            <span />
          </span>
          <div>
            <strong>{APP_NAME}</strong>
            <small>{t(language, "tagline")}</small>
          </div>
        </div>
        <div className="top-actions">
          {!online && (
            <span className="offline-pill">
              <WifiOff size={14} />
              {t(language, "offline")}
            </span>
          )}
          <span className="location-pill">
            <span className={`status-dot ${state.start ? "ready" : ""}`} />
            {state.start ? t(language, "locationReady") : t(language, "locating")}
          </span>
          <button
            className="icon-button top"
            aria-label={t(language, "recenter")}
            onClick={() => state.start && mapRef.current?.flyTo({ center: state.start, zoom: 14 })}
          >
            <Crosshair />
          </button>
          <button
            className="icon-button top"
            aria-label={t(language, "settings")}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings />
          </button>
        </div>
      </header>

      {sharedPlan && (
        <aside className="shared-banner">
          <Share2 size={18} />
          <span>{t(language, "sharedBanner")}</span>
          <button onClick={() => locate(true)}>{t(language, "useMyLocation")}</button>
          <button
            className="icon-button mini"
            aria-label={t(language, "close")}
            onClick={(event) => event.currentTarget.parentElement?.remove()}
          >
            <X size={16} />
          </button>
        </aside>
      )}

      <section
        className={`bottom-sheet ${expanded ? "expanded" : "collapsed"} ${sheetDragging ? "dragging" : ""} ${following ? "follow-mode" : ""}`}
        aria-label={t(language, "routePlanner")}
        style={{ "--sheet-drag-offset": `${sheetDragOffset}px` } as React.CSSProperties}
      >
        <button
          className="sheet-handle"
          onClick={toggleSheet}
          onPointerDown={startSheetDrag}
          onPointerMove={moveSheetDrag}
          onPointerUp={finishSheetDrag}
          onPointerCancel={cancelSheetDrag}
          aria-label={t(language, expanded ? "collapse" : "expand")}
          aria-expanded={expanded}
        >
          <span className="sheet-grip" aria-hidden="true" />
          <span className="sheet-handle-label">
            {t(language, expanded ? "showMap" : "showPlanner")}
          </span>
          {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
        <div
          ref={sheetScrollRef}
          className="sheet-scroll"
          aria-hidden={!expanded}
          inert={!expanded}
        >
          {following && selected ? (
            <section className="follow-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    <Navigation size={14} /> {t(language, "following")}
                  </span>
                  <h1>
                    {t(language, "route")} {routeLabel(state.candidates.indexOf(selected))}
                  </h1>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setFollowMap(!followMap)}
                  aria-label={t(language, followMap ? "stopFollowMap" : "followMap")}
                >
                  <LocateFixed />
                </button>
              </div>
              <div className="follow-next">
                <span>
                  <Navigation aria-hidden />
                </span>
                <div>
                  <small>{t(language, "nextDirection")}</small>
                  <strong>
                    {followProgress?.nextInstruction?.text ?? t(language, "continueRoute")}
                  </strong>
                </div>
                {followProgress?.nextInstruction && (
                  <b>{formatProximity(followProgress.nextDistance, preferences.units)}</b>
                )}
              </div>
              {followError && <p className="error-note">{followError}</p>}
              <div className="follow-metrics">
                <div>
                  <small>{t(language, "completed")}</small>
                  <strong>
                    {formatDistance(followProgress?.completed ?? 0, preferences.units, language)}
                  </strong>
                </div>
                <div>
                  <small>{t(language, "remaining")}</small>
                  <strong>
                    {formatDistance(
                      followProgress?.remaining ?? selected.actualDistanceMeters,
                      preferences.units,
                      language,
                    )}
                  </strong>
                </div>
                <div className={followProgress && followProgress.toRoute > 50 ? "off-route" : ""}>
                  <small>{t(language, "toRoute")}</small>
                  <strong>
                    {followProgress
                      ? formatProximity(followProgress.toRoute, preferences.units)
                      : "—"}
                  </strong>
                </div>
              </div>
              {followProgress && followProgress.toRoute > 50 && (
                <p className="warning-note">
                  <AlertTriangle />
                  {t(language, "offRoute")}
                </p>
              )}
              <p className="safety-note">{t(language, "followNotice")}</p>
              <button className="stop-button" onClick={() => dispatch({ type: "STOP_FOLLOW" })}>
                <Square size={18} />
                {t(language, "stopFollowing")}
              </button>
            </section>
          ) : (
            <>
              <div className="sheet-intro">
                <div>
                  <span className="eyebrow">
                    {state.candidates.length ? t(language, "results") : t(language, "planLoop")}
                  </span>
                  <h1>
                    {state.candidates.length ? t(language, "results") : t(language, "tagline")}
                  </h1>
                </div>
                {state.candidates.length > 0 && (
                  <span className="route-count">
                    {state.candidates.length}{" "}
                    {t(
                      language,
                      state.candidates.length === 1 ? "routeExplored" : "routesExplored",
                    )}
                  </span>
                )}
              </div>

              {state.locationMessage && (
                <p className="status-note" role="status">
                  <MapPin />
                  {state.locationMessage}
                </p>
              )}
              {!online && (
                <p className="offline-note">
                  <WifiOff />
                  {t(language, "offlineHint")}
                </p>
              )}
              {state.stage === "locating" && (
                <div className="locating-card">
                  <span className="locator-pulse">
                    <LocateFixed />
                  </span>
                  <div>
                    <strong>{t(language, "locating")}</strong>
                    <small>GPS · {t(language, "accuracy")}</small>
                  </div>
                </div>
              )}
              {state.stage === "generating" && (
                <div className="generating-card" role="status">
                  <span className="route-loader">
                    <i />
                    <i />
                    <i />
                  </span>
                  <div>
                    <strong>{t(language, "generating")}</strong>
                    <small>{t(language, "generationHint")}</small>
                  </div>
                </div>
              )}

              {state.candidates.length === 0 && state.stage !== "generating" && (
                <div className="planner-controls">
                  <form className="search-form" onSubmit={submitSearch}>
                    <MapPin size={19} />
                    <input
                      value={query}
                      onChange={(event) => {
                        const value = event.target.value;
                        searchAbortRef.current?.abort();
                        setSearching(false);
                        setQuery(value);
                        setSearchMessage("");
                        if (value.trim().length < 3) {
                          setSearchResults([]);
                          setSuggestionsOpen(false);
                          setActiveSuggestion(-1);
                        } else setSuggestionsOpen(true);
                      }}
                      onFocus={() => setSuggestionsOpen(searchResults.length > 0)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setSuggestionsOpen(false);
                          setActiveSuggestion(-1);
                          return;
                        }
                        if (!searchResults.length || !suggestionsOpen) return;
                        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          setActiveSuggestion((current) => {
                            const direction = event.key === "ArrowDown" ? 1 : -1;
                            return (
                              (current + direction + searchResults.length) % searchResults.length
                            );
                          });
                        } else if (event.key === "Enter" && activeSuggestion >= 0) {
                          event.preventDefault();
                          selectSearchResult(searchResults[activeSuggestion]);
                        }
                      }}
                      placeholder={t(language, "searchPlaceholder")}
                      aria-label={t(language, "searchPlaceholder")}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls="place-suggestions"
                      aria-expanded={suggestionsOpen && searchResults.length > 0}
                      aria-activedescendant={
                        suggestionsOpen && activeSuggestion >= 0
                          ? `place-suggestion-${activeSuggestion}`
                          : undefined
                      }
                      autoComplete="off"
                    />
                    <button
                      disabled={searching || query.trim().length < 3 || !online}
                      aria-label={t(language, "search")}
                    >
                      {searching ? <RefreshCw className="spin" /> : <Search />}
                    </button>
                  </form>
                  {searchMessage && (
                    <p className="form-message" role="status">
                      {searchMessage}
                    </p>
                  )}
                  {suggestionsOpen && searchResults.length > 0 && (
                    <ul
                      id="place-suggestions"
                      className="search-results"
                      role="listbox"
                      aria-label={t(language, "searchResults")}
                    >
                      {searchResults.map((result, index) => (
                        <li key={result.id}>
                          <button
                            id={`place-suggestion-${index}`}
                            role="option"
                            aria-selected={index === activeSuggestion}
                            className={index === activeSuggestion ? "active" : ""}
                            tabIndex={-1}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectSearchResult(result)}
                          >
                            <MapPin />
                            <span>
                              <strong>{result.label}</strong>
                              <small>
                                {[result.locality, result.region, result.country]
                                  .filter(Boolean)
                                  .join(", ")}
                              </small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    className={`set-start-button ${setStartMode ? "active" : ""}`}
                    onClick={() => setSetStartMode(!setStartMode)}
                  >
                    <Crosshair />
                    {t(language, setStartMode ? "setStartActive" : "setStart")}
                  </button>
                  <p className="map-guidance">{t(language, "mapInstruction")}</p>
                  <fieldset className="control-group">
                    <legend>{t(language, "distance")}</legend>
                    <div className="distance-grid">
                      {DISTANCE_PRESETS.map((meters) => (
                        <button
                          key={meters}
                          className={targetDistance === meters ? "active" : ""}
                          onClick={() => selectPreset(meters)}
                        >
                          {meters === 21097.5
                            ? t(language, "raceHalf")
                            : meters === 42195
                              ? t(language, "raceFull")
                              : formatDistance(meters, preferences.units, language)}
                        </button>
                      ))}
                      <label
                        className={`custom-distance ${DISTANCE_PRESETS.includes(targetDistance) ? "" : "active"}`}
                      >
                        <span>{t(language, "custom")}</span>
                        <input
                          type="number"
                          min={1}
                          max={maxCustomDistance}
                          step="0.1"
                          value={custom}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setCustom(value);
                            if (value >= 1 && value <= maxCustomDistance)
                              setTargetDistance(value * distanceUnitMeters);
                          }}
                          aria-label={t(language, "customDistance")}
                        />
                        <small>{preferences.units}</small>
                      </label>
                    </div>
                  </fieldset>
                  <fieldset className="control-group">
                    <legend>{t(language, "routeType")}</legend>
                    <div className="mode-selector">
                      {(["road", "mixed", "trail"] as RouteMode[]).map((mode) => (
                        <button
                          key={mode}
                          aria-label={t(language, mode)}
                          className={preferences.mode === mode ? "active" : ""}
                          onClick={() => setPreferences({ ...preferences, mode })}
                        >
                          <span className={`mode-icon ${mode}`}>
                            <RouteIcon />
                          </span>
                          {t(language, mode)}
                        </button>
                      ))}
                    </div>
                    <p>{t(language, "roadHint")}</p>
                    {preferences.mode === "trail" && (
                      <p className="trail-note">{t(language, "trailWarning")}</p>
                    )}
                  </fieldset>
                  <fieldset className="control-group">
                    <legend>{t(language, "routePriorities")}</legend>
                    <div className="priority-grid">
                      {(
                        [
                          ["water", Waves, "preferWater"],
                          ["woodland", Trees, "preferWoodland"],
                          ["unpaved", Leaf, "preferUnpaved"],
                          ["quiet", VolumeX, "preferQuiet"],
                        ] as const
                      ).map(([priority, Icon, label]) => (
                        <button
                          key={priority}
                          type="button"
                          aria-pressed={preferences.routePriorities[priority]}
                          className={preferences.routePriorities[priority] ? "active" : ""}
                          onClick={() => setPriority(priority)}
                        >
                          <Icon />
                          <span>{t(language, label)}</span>
                        </button>
                      ))}
                    </div>
                    <p>{t(language, "priorityHint")}</p>
                  </fieldset>
                  <label className="switch-row compact">
                    <input
                      type="checkbox"
                      checked={preferences.avoidSteps}
                      onChange={(event) =>
                        setPreferences({ ...preferences, avoidSteps: event.target.checked })
                      }
                    />
                    <span className="switch" />
                    <span>
                      <strong>{t(language, "avoidSteps")}</strong>
                    </span>
                  </label>
                  <button
                    className="primary-button generate-button"
                    disabled={!state.start || !online || custom < 1 || custom > maxCustomDistance}
                    onClick={() => generate(sharedPlan?.seed)}
                  >
                    <Footprints />
                    {sharedPlan ? t(language, "sharedRegenerate") : t(language, "generate")}
                    <span>{formatDistance(targetDistance, preferences.units, language)}</span>
                  </button>
                </div>
              )}

              {state.error && state.stage !== "generating" && (
                <div className="error-card" role="alert">
                  <AlertTriangle />
                  <div>
                    <strong>
                      {state.candidates.length
                        ? t(language, "partialResults")
                        : t(language, "noRoutes")}
                    </strong>
                    {state.error !== t(language, "partialResults") && <p>{state.error}</p>}
                  </div>
                  {!state.candidates.length && (
                    <button onClick={() => dispatch({ type: "CLEAR" })}>
                      {t(language, "retry")}
                    </button>
                  )}
                </div>
              )}

              {state.candidates.length > 0 && (
                <div className="results-panel">
                  <div
                    className="route-list"
                    role="radiogroup"
                    aria-label={t(language, "chooseRoute")}
                  >
                    {state.candidates.map((route, index) => (
                      <RouteCard
                        key={route.id}
                        route={route}
                        index={index}
                        selected={route.id === state.selectedId}
                        units={preferences.units}
                        language={language}
                        paceSecondsPerKm={preferences.paceSecondsPerKm}
                        onSelect={() => dispatch({ type: "SELECT", id: route.id })}
                      />
                    ))}
                  </div>
                  {selected && (
                    <section className="selected-details">
                      <div className="detail-header">
                        <div>
                          <span className="eyebrow">{t(language, "selectedRoute")}</span>
                          <h2>
                            {t(language, "route")} {routeLabel(state.candidates.indexOf(selected))}
                          </h2>
                        </div>
                        <strong>
                          {formatDistance(
                            selected.actualDistanceMeters,
                            preferences.units,
                            language,
                          )}
                        </strong>
                      </div>
                      <ElevationProfile
                        coordinates={selected.coordinates}
                        units={preferences.units}
                        language={language}
                      />
                      {selected.metrics.closureDistanceMeters > 10 && (
                        <p className="snap-note">
                          <MapPin />
                          {t(language, "routeSnapped")}
                        </p>
                      )}
                      {selected.metrics.warnings.length > 0 && (
                        <details className="warnings">
                          <summary>
                            <AlertTriangle />
                            {t(language, "warnings")} ({selected.metrics.warnings.length})
                          </summary>
                          <ul>
                            {selected.metrics.warnings.map((warning) => (
                              <li key={warning}>{routeWarningText(language, warning)}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <div className="action-grid">
                        <button
                          className="primary-button follow-button"
                          onClick={() => {
                            setExpanded(true);
                            dispatch({ type: "FOLLOW" });
                          }}
                        >
                          <Navigation />
                          {t(language, "startFollowing")}
                        </button>
                        <button onClick={() => downloadGpx(selected)}>
                          <Download />
                          {t(language, "exportGpx")}
                        </button>
                        <button onClick={() => setShareOpen(true)}>
                          <Share2 />
                          {t(language, "share")}
                        </button>
                        <button onClick={generateAnother} disabled={!online || generatingAnother}>
                          <RefreshCw className={generatingAnother ? "spin" : ""} />
                          {t(language, generatingAnother ? "generatingOne" : "generateAnother")}
                        </button>
                        <button onClick={() => setDirectionsOpen(true)}>
                          <Menu />
                          {t(language, "directions")}
                        </button>
                        <button className="clear-action" onClick={clearRoutesWithUndo}>
                          <X />
                          {t(language, "clearRoute")}
                        </button>
                      </div>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
      {undoRoutes && (
        <div className="undo-toast" role="status">
          <span>{t(language, "routeCleared")}</span>
          <button onClick={undoClearRoutes}>{t(language, "undo")}</button>
        </div>
      )}
      <SettingsDialog
        open={settingsOpen}
        preferences={preferences}
        onChange={updatePreferences}
        onClear={() => {
          clearState();
          setPreferences(loadState().preferences);
          dispatch({ type: "CLEAR" });
          setSettingsOpen(false);
        }}
        onClose={() => setSettingsOpen(false)}
      />
      <ShareDialog
        open={shareOpen}
        language={language}
        onShare={shareSelected}
        onClose={() => setShareOpen(false)}
      />
      <DirectionsDialog
        open={directionsOpen}
        route={selected}
        routeName={
          selected
            ? `${t(language, "route")} ${routeLabel(state.candidates.indexOf(selected))}`
            : ""
        }
        units={preferences.units}
        language={language}
        onClose={() => setDirectionsOpen(false)}
      />
    </main>
  );
}
