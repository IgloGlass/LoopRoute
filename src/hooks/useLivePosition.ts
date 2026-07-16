import { useEffect, useState } from "react";

export interface LivePosition {
  coordinate: [number, number];
  accuracy: number;
  heading?: number | null;
}

export function useLivePosition(active: boolean, onError: (message: string) => void) {
  const [position, setPosition] = useState<LivePosition>();
  useEffect(() => {
    if (!active) return;
    if (!navigator.geolocation) {
      onError("unsupported");
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (value) =>
        setPosition({
          coordinate: [value.coords.longitude, value.coords.latitude],
          accuracy: value.coords.accuracy,
          heading: value.coords.heading,
        }),
      (error) => onError(error.code === 1 ? "denied" : "unavailable"),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [active, onError]);
  return active ? position : undefined;
}
