/**
 * Calculates great-circle distance in kilometers between two [lon, lat] coordinates
 * using the Haversine formula.
 */
export function calculateDistanceKm(
  fromLonLat: [number, number],
  toLonLat: [number, number]
): number {
  const [lon1, lat1] = fromLonLat;
  const [lon2, lat2] = toLonLat;

  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Formats a distance in kilometers into a concise user-facing label (e.g. "450 m" or "2.4 km").
 */
export function formatDistance(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return '—';
  if (distanceKm < 0.05) return '< 50 m';
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  if (distanceKm < 10) {
    return `${distanceKm.toFixed(1)} km`;
  }
  return `${Math.round(distanceKm)} km`;
}

/**
 * Estimates walking or transit time based on distance in kilometers.
 */
export function formatTravelEstimate(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return '';
  if (distanceKm <= 1.5) {
    const walkMins = Math.max(1, Math.round((distanceKm / 4.8) * 60));
    return `🚶 ~${walkMins} min walk`;
  }
  const transitMins = Math.max(4, Math.round((distanceKm / 22) * 60 + 4));
  return `🚌 ~${transitMins} min transit`;
}
