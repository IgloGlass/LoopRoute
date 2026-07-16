export interface GeocodingResult {
  id: string;
  label: string;
  locality?: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export async function searchPlaces(
  query: string,
  focus?: [number, number],
  signal?: AbortSignal,
): Promise<GeocodingResult[]> {
  const params = new URLSearchParams({ q: query.trim() });
  if (focus) {
    params.set("lng", String(focus[0]));
    params.set("lat", String(focus[1]));
  }
  const response = await fetch(`/api/geocode?${params}`, { signal });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) throw new Error((data as { error?: string })?.error || "Place search failed.");
  return (data as { results?: GeocodingResult[] })?.results ?? [];
}
