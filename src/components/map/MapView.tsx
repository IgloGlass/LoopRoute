import { useEffect, useRef } from "react";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_CENTER, DESKTOP_BREAKPOINT, type Language } from "../../config/app";
import { t } from "../../i18n";
import { haversineDistance } from "../../geo/distance";
import { routeBounds } from "../../geo/bounds";
import type { NormalizedRoute } from "../../types/route";
import type { LivePosition } from "../../hooks/useLivePosition";

interface Props {
  start?: [number, number];
  routes: NormalizedRoute[];
  selectedId?: string;
  setStartMode: boolean;
  livePosition?: LivePosition;
  followPosition?: boolean;
  panelExpanded: boolean;
  following: boolean;
  language: Language;
  dark: boolean;
  onStartChange: (coordinate: [number, number]) => void;
  onReady?: (map: Map) => void;
}

const styleUrl = (dark: boolean) =>
  `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`;

const routePadding = (panelExpanded: boolean, following: boolean) => {
  if (window.innerWidth >= DESKTOP_BREAKPOINT)
    return { top: 105, right: 48, bottom: 74, left: panelExpanded ? 472 : 82 };
  if (!panelExpanded) return { top: 88, right: 28, bottom: 94, left: 28 };
  const panelHeight = following
    ? Math.min(380, window.innerHeight * 0.42 + 16)
    : Math.min(704, window.innerHeight * 0.75 + 24);
  return { top: 86, right: 28, bottom: panelHeight, left: 28 };
};

const fitSelectedRoute = (
  map: Map,
  route: NormalizedRoute,
  panelExpanded: boolean,
  following: boolean,
  duration: number,
) => {
  const bounds = routeBounds(route.coordinates);
  if (!bounds) return;
  map.fitBounds(bounds, {
    padding: routePadding(panelExpanded, following),
    duration,
    maxZoom: 15,
  });
};

const markerElement = (className: string, label: string) => {
  const element = document.createElement("div");
  element.className = `map-marker ${className}`;
  element.setAttribute("aria-label", label);
  return element;
};

export function MapView({
  start,
  routes,
  selectedId,
  setStartMode,
  livePosition,
  followPosition,
  panelExpanded,
  following,
  language,
  dark,
  onStartChange,
  onReady,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | undefined>(undefined);
  const startMarker = useRef<Marker | undefined>(undefined);
  const snappedMarker = useRef<Marker | undefined>(undefined);
  const liveMarker = useRef<Marker | undefined>(undefined);
  const callback = useRef(onStartChange);
  const startMode = useRef(setStartMode);
  const initial = useRef({ dark, start, onReady });
  const lastDark = useRef(dark);
  const renderedRouteCount = useRef(0);

  useEffect(() => {
    callback.current = onStartChange;
    startMode.current = setStartMode;
  }, [onStartChange, setStartMode]);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const initialProps = initial.current;
    const map = new maplibregl.Map({
      container: container.current,
      style: styleUrl(initialProps.dark),
      center: initialProps.start ?? DEFAULT_CENTER,
      zoom: initialProps.start ? 13.5 : 10,
      attributionControl: {},
      cooperativeGestures: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    map.on("click", (event) => {
      if (startMode.current) callback.current([event.lngLat.lng, event.lngLat.lat]);
    });
    let holdTimer: number | undefined;
    map.on("touchstart", (event) => {
      const touch = event.lngLat;
      holdTimer = window.setTimeout(() => callback.current([touch.lng, touch.lat]), 650);
    });
    map.on("touchend", () => window.clearTimeout(holdTimer));
    map.once("load", () => initialProps.onReady?.(map));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || lastDark.current === dark) return;
    lastDark.current = dark;
    map.setStyle(styleUrl(dark));
  }, [dark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !start) return;
    if (!startMarker.current) {
      startMarker.current = new maplibregl.Marker({
        element: markerElement("start-marker", t(language, "routeStart")),
        draggable: true,
      })
        .setLngLat(start)
        .addTo(map);
      startMarker.current.on("dragend", () => {
        const point = startMarker.current!.getLngLat();
        callback.current([point.lng, point.lat]);
      });
    } else {
      startMarker.current.setLngLat(start);
      startMarker.current.getElement().setAttribute("aria-label", t(language, "routeStart"));
    }
    if (!routes.length)
      map.easeTo({ center: start, zoom: Math.max(map.getZoom(), 13), duration: 500 });
  }, [start, routes.length, language]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const render = () => {
      for (let index = 0; index < Math.max(renderedRouteCount.current, routes.length); index += 1) {
        const id = `route-${index}`;
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      }
      if (map.getLayer("snap-connector")) map.removeLayer("snap-connector");
      if (map.getSource("snap-connector")) map.removeSource("snap-connector");
      routes.forEach((route, index) => {
        const id = `route-${index}`;
        map.addSource(id, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: route.coordinates },
          },
        });
        map.addLayer({
          id,
          type: "line",
          source: id,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": dark ? "#f1eee6" : "#173f35",
            "line-width": route.id === selectedId ? 7 : 3,
            "line-opacity": route.id === selectedId ? 0.96 : 0.3,
          },
        });
      });
      renderedRouteCount.current = routes.length;
      const selected = routes.find((route) => route.id === selectedId);
      if (selected) {
        fitSelectedRoute(map, selected, panelExpanded, following, 650);
        const snapped = selected.snappedStart;
        if (haversineDistance(selected.requestedStart, snapped) > 10) {
          snappedMarker.current?.remove();
          snappedMarker.current = new maplibregl.Marker({
            element: markerElement("snapped-marker", t(language, "snappedRouteStart")),
          })
            .setLngLat(snapped)
            .addTo(map);
          map.addSource("snap-connector", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: [selected.requestedStart, snapped] },
            },
          });
          map.addLayer({
            id: "snap-connector",
            type: "line",
            source: "snap-connector",
            paint: { "line-color": "#173f35", "line-width": 2, "line-dasharray": [2, 2] },
          });
        } else {
          snappedMarker.current?.remove();
          snappedMarker.current = undefined;
        }
      } else {
        snappedMarker.current?.remove();
        snappedMarker.current = undefined;
      }
    };
    if (map.isStyleLoaded()) render();
    else map.once("load", render);
  }, [routes, selectedId, dark, panelExpanded, following, language]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const resize = () => {
      map.resize();
      const selected = routes.find((route) => route.id === selectedId);
      if (selected) fitSelectedRoute(map, selected, panelExpanded, following, 0);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [routes, selectedId, panelExpanded, following]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!livePosition) {
      liveMarker.current?.remove();
      liveMarker.current = undefined;
      return;
    }
    if (!liveMarker.current)
      liveMarker.current = new maplibregl.Marker({
        element: markerElement("live-marker", t(language, "currentLocation")),
      })
        .setLngLat(livePosition.coordinate)
        .addTo(map);
    else {
      liveMarker.current.setLngLat(livePosition.coordinate);
      liveMarker.current.getElement().setAttribute("aria-label", t(language, "currentLocation"));
    }
    if (followPosition)
      map.easeTo({
        center: livePosition.coordinate,
        zoom: Math.max(map.getZoom(), 15),
        duration: 450,
      });
  }, [livePosition, followPosition, language]);

  return (
    <div
      ref={container}
      className={`map-canvas ${setStartMode ? "set-start-cursor" : ""}`}
      aria-label={t(language, "interactiveMap")}
      data-testid="map"
    />
  );
}
