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
  WifiOff,
  X,
} from "lucide-react";
import { APP_NAME, DISTANCE_PRESETS, type RouteMode } from "../config/app";
import { distanceToRoute, polylineDistance } from "../geo/distance";
import { useLivePosition } from "../hooks/useLivePosition";
import { useNetworkStatus } from "../hooks/useNetworkStatus";
import { useWakeLock } from "../hooks/useWakeLock";
import { routeWarningText, t } from "../i18n";
import { OpenRouteServiceRoutingProvider, ApiError } from "../providers/routing/openRouteService";
import { searchPlaces, type GeocodingResult } from "../providers/geocoding/openRouteService";
import { downloadGpx } from "../services/gpx";
import { generateCandidates, randomSeed } from "../services/routeGeneration";
import { buildShareUrl, parseShareUrl, sharePlan } from "../services/share";
import { clearState, loadState, saveState, type Preferences } from "../services/storage";
import type { RouteRequest } from "../types/route";
import { RouteCard } from "../components/routes/RouteCard";
import { ElevationProfile } from "../components/routes/ElevationProfile";
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
      ? { units: sharedPlan.units, mode: sharedPlan.mode, avoidSteps: sharedPlan.avoidSteps }
      : {}),
  }));
  const [targetDistance, setTargetDistance] = useState(sharedPlan?.distanceMeters ?? 5000);
  const [custom, setCustom] = useState(5);
  const [setStartMode, setSetStartMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searchMessage, setSearchMessage] = useState("");
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [followMap, setFollowMap] = useState(true);
  const [followError, setFollowError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const abortRef = useRef<AbortController | undefined>(undefined);
  const mapRef = useRef<Map | undefined>(undefined);
  const requestId = useRef(0);
  const online = useNetworkStatus();
  const language = preferences.language;
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

  useEffect(() => () => abortRef.current?.abort(), []);

  const changeStart = (coordinate: [number, number]) => {
    abortRef.current?.abort();
    dispatch({
      type: "START_CHANGED",
      start: coordinate,
      message: state.candidates.length ? t(language, "startChanged") : undefined,
    });
    setSetStartMode(false);
    setSearchResults([]);
  };

  const makeBase = (): Omit<RouteRequest, "seed"> | undefined =>
    state.start
      ? {
          start: { longitude: state.start[0], latitude: state.start[1] },
          targetDistanceMeters: targetDistance,
          mode: preferences.mode,
          avoidSteps: preferences.avoidSteps,
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
        const route = await provider.route({ ...base, seed }, controller.signal);
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
    setAnnouncement(t(language, "generating"));
    try {
      const route = await provider.route({ ...base, seed: randomSeed() }, controller.signal);
      const replaceIndex = [...state.candidates]
        .reverse()
        .findIndex((candidate) => candidate.id !== state.selectedId);
      const actualIndex =
        replaceIndex < 0
          ? window.confirm(`${t(language, "generateAnother")}?`)
            ? state.candidates.length - 1
            : -1
          : state.candidates.length - 1 - replaceIndex;
      if (actualIndex < 0) return;
      const updated = [...state.candidates];
      updated[actualIndex] = route;
      updated.sort((a, b) => b.metrics.overallScore - a.metrics.overallScore);
      const id = ++requestId.current;
      dispatch({ type: "GENERATING", requestId: id });
      dispatch({ type: "RESULTS", requestId: id, candidates: updated });
      setAnnouncement(
        `${t(language, "route")} ${String.fromCharCode(65 + updated.indexOf(route))} ${t(language, "locationReady").toLowerCase()}`,
      );
    } catch (error) {
      dispatch({ type: "ERROR", message: mapError(error, language) });
    }
  };

  const submitSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 3 || !online) return;
    setSearching(true);
    setSearchMessage("");
    setSearchResults([]);
    try {
      const results = await searchPlaces(query, state.start);
      setSearchResults(results);
      if (!results.length) setSearchMessage(t(language, "noResults"));
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : t(language, "providerUnavailable"));
    } finally {
      setSearching(false);
    }
  };

  const shareSelected = async (precise: boolean) => {
    if (!selected) return;
    const url = buildShareUrl(
      {
        start: selected.requestedStart,
        distanceMeters: selected.targetDistanceMeters,
        mode: preferences.mode,
        avoidSteps: preferences.avoidSteps,
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
    return {
      completed,
      remaining: Math.max(0, selected.actualDistanceMeters - completed),
      toRoute: nearest,
    };
  }, [selected, livePosition]);

  const updatePreferences = (next: Preferences) => {
    setPreferences(next);
  };
  const selectPreset = (meters: number) => {
    setTargetDistance(meters);
    setCustom(meters / 1000);
  };

  return (
    <main className={`app-shell stage-${state.stage}`}>
      <Suspense fallback={<div className="map-canvas map-loading" aria-label="Loading map" />}>
        <MapView
          start={state.start}
          routes={state.candidates}
          selectedId={state.selectedId}
          setStartMode={setStartMode}
          livePosition={livePosition}
          followPosition={followMap}
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
        className={`bottom-sheet ${expanded ? "expanded" : "collapsed"}`}
        aria-label="Route planner"
      >
        <button
          className="sheet-handle"
          onClick={() => setExpanded(!expanded)}
          aria-label={t(language, expanded ? "collapse" : "expand")}
        >
          <span />
          {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
        <div className="sheet-scroll">
          {following && selected ? (
            <section className="follow-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    <Navigation size={14} /> {t(language, "following")}
                  </span>
                  <h1>
                    {t(language, "route")}{" "}
                    {String.fromCharCode(65 + state.candidates.indexOf(selected))}
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
                    {followProgress ? `${Math.round(followProgress.toRoute)} m` : "—"}
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
                    {state.candidates.length ? t(language, "results") : "PLAN A LOOP"}
                  </span>
                  <h1>
                    {state.candidates.length ? t(language, "results") : t(language, "tagline")}
                  </h1>
                </div>
                {state.candidates.length > 0 && (
                  <span className="route-count">{state.candidates.length}/3</span>
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
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t(language, "searchPlaceholder")}
                      aria-label={t(language, "searchPlaceholder")}
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
                  {searchResults.length > 0 && (
                    <ul className="search-results" aria-label="Search results">
                      {searchResults.map((result) => (
                        <li key={result.id}>
                          <button onClick={() => changeStart([result.longitude, result.latitude])}>
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
                              : `${meters / 1000} km`}
                        </button>
                      ))}
                      <label className={DISTANCE_PRESETS.includes(targetDistance) ? "" : "active"}>
                        <span>{t(language, "custom")}</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={custom}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            setCustom(value);
                            if (value >= 1 && value <= 100) setTargetDistance(value * 1000);
                          }}
                        />
                        <small>km</small>
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
                    disabled={!state.start || !online || custom < 1 || custom > 100}
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
                  <div className="route-list">
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
                            {t(language, "route")}{" "}
                            {String.fromCharCode(65 + state.candidates.indexOf(selected))}
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
                      <ElevationProfile coordinates={selected.coordinates} />
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
                          onClick={() => dispatch({ type: "FOLLOW" })}
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
                        <button onClick={generateAnother} disabled={!online}>
                          <RefreshCw />
                          {t(language, "generateAnother")}
                        </button>
                        <button onClick={() => setDirectionsOpen(!directionsOpen)}>
                          <Menu />
                          {t(language, "directions")}
                        </button>
                        <button
                          className="clear-action"
                          onClick={() => dispatch({ type: "CLEAR" })}
                        >
                          <X />
                          {t(language, "clearRoute")}
                        </button>
                      </div>
                      {directionsOpen && (
                        <section
                          className="directions-list"
                          aria-label={t(language, "viewDirections")}
                        >
                          <h3>{t(language, "viewDirections")}</h3>
                          {selected.instructions.length ? (
                            <ol>
                              {selected.instructions.map((instruction, index) => (
                                <li key={`${instruction.text}-${index}`}>
                                  <span>{index + 1}</span>
                                  <div>
                                    {instruction.text}
                                    <small>
                                      {formatDistance(
                                        instruction.distanceMeters,
                                        preferences.units,
                                        language,
                                      )}
                                    </small>
                                  </div>
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <p>{t(language, "unknown")}</p>
                          )}
                        </section>
                      )}
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
    </main>
  );
}
