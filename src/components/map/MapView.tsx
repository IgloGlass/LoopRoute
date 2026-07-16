import { useEffect, useRef } from "react";
import maplibregl, { type Map, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DEFAULT_CENTER, ROUTE_COLORS } from "../../config/app";
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
  dark: boolean;
  onStartChange: (coordinate: [number, number]) => void;
  onReady?: (map: Map) => void;
}

const styleUrl = (dark: boolean) =>
  `https://tiles.openfreemap.org/styles/${dark ? "dark" : "liberty"}`;

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
        element: markerElement("start-marker", "Route start"),
        draggable: true,
      })
        .setLngLat(start)
        .addTo(map);
      startMarker.current.on("dragend", () => {
        const point = startMarker.current!.getLngLat();
        callback.current([point.lng, point.lat]);
      });
    } else startMarker.current.setLngLat(start);
    if (!routes.length)
      map.easeTo({ center: start, zoom: Math.max(map.getZoom(), 13), duration: 500 });
  }, [start, routes.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const render = () => {
      for (let index = 0; index < 3; index += 1) {
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
            "line-color": ROUTE_COLORS[index],
            "line-width": route.id === selectedId ? 7 : 4,
            "line-opacity": route.id === selectedId ? 0.95 : 0.52,
          },
        });
      });
      const selected = routes.find((route) => route.id === selectedId);
      if (selected) {
        const bounds = routeBounds(selected.coordinates);
        if (bounds)
          map.fitBounds(bounds, {
            padding: {
              top: 110,
              right: 45,
              bottom: window.innerWidth < 768 ? 380 : 75,
              left: window.innerWidth < 768 ? 45 : 430,
            },
            duration: 650,
            maxZoom: 15,
          });
        const snapped = selected.snappedStart;
        if (haversineDistance(selected.requestedStart, snapped) > 10) {
          snappedMarker.current?.remove();
          snappedMarker.current = new maplibregl.Marker({
            element: markerElement("snapped-marker", "Snapped route start"),
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
  }, [routes, selectedId, dark]);

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
        element: markerElement("live-marker", "Current position"),
      })
        .setLngLat(livePosition.coordinate)
        .addTo(map);
    else liveMarker.current.setLngLat(livePosition.coordinate);
    if (followPosition)
      map.easeTo({
        center: livePosition.coordinate,
        zoom: Math.max(map.getZoom(), 15),
        duration: 450,
      });
  }, [livePosition, followPosition]);

  return (
    <div
      ref={container}
      className={`map-canvas ${setStartMode ? "set-start-cursor" : ""}`}
      aria-label="Interactive route map"
      data-testid="map"
    />
  );
}
