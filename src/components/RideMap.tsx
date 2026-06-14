"use client";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Polyline, Marker } from "leaflet";
import type { Ride, MatchResult } from "@/lib/api";

interface Props {
  rides: Ride[];
  highlighted?: MatchResult | null;
  center?: [number, number];
  onRideClick?: (ride: Ride) => void;
  driverPos?: [number, number];
  pickupMarker?: { lat: number; lng: number; label: string };
}

function polylineOptions(ride: Ride, isHighlighted: boolean) {
  if (isHighlighted) return { color: "#0F6E56", weight: 6, opacity: 1, dashArray: undefined };
  if (ride.status === "full") return { color: "#aaaaaa", weight: 3, opacity: 0.5, dashArray: undefined };
  if (ride.ride_type === "future") return { color: "#888888", weight: 3, opacity: 0.8, dashArray: "8 6" };
  return { color: "#1a1a2e", weight: 4, opacity: 1, dashArray: undefined };
}

export default function RideMap({ rides, highlighted, center, onRideClick, driverPos, pickupMarker }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const linesRef = useRef<Map<string, Polyline>>(new Map());
  const driverMarkerRef = useRef<Marker | null>(null);
  const pickupMarkerRef = useRef<Marker | null>(null);
  const pickupLineRef = useRef<Polyline | null>(null);

  const defaultCenter: [number, number] = center ?? [59.9139, 10.7522];

  useEffect(() => {
    let L: typeof import("leaflet");
    async function init() {
      L = (await import("leaflet")).default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      if (mapRef.current || !containerRef.current) return;
      const map = L.map(containerRef.current, { zoomControl: true }).setView(defaultCenter, 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
    }
    init();
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      linesRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw rides
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then(({ default: L }) => {
      const map = mapRef.current!;
      const existing = new Set(linesRef.current.keys());
      rides.forEach((ride) => {
        existing.delete(ride.ride_id);
        const coords: [number, number][] = ride.route_polyline_geo.coordinates.map(([lng, lat]) => [lat, lng]);
        const isHl = highlighted?.ride_id === ride.ride_id;
        const opts = polylineOptions(ride, isHl);
        if (linesRef.current.has(ride.ride_id)) {
          const line = linesRef.current.get(ride.ride_id)!;
          line.setStyle(opts);
          line.setLatLngs(coords);
        } else {
          const line = L.polyline(coords, opts).addTo(map);
          if (ride.status !== "full") {
            line.on("click", () => onRideClick?.(ride));
            line.bindTooltip(
              `<strong>${ride.initiator_name}</strong><br/>${ride.destination_address}<br/>${ride.seats_remaining} seat${ride.seats_remaining !== 1 ? "s" : ""} · ${(ride.base_fare / 100).toFixed(0)} kr`,
              { sticky: true }
            );
          }
          linesRef.current.set(ride.ride_id, line);
        }
      });
      existing.forEach((id) => { linesRef.current.get(id)?.remove(); linesRef.current.delete(id); });
    });
  }, [rides, highlighted, onRideClick]);

  // Draw pickup marker + line from driver to pickup
  useEffect(() => {
    if (!mapRef.current || !pickupMarker) return;
    import("leaflet").then(({ default: L }) => {
      const map = mapRef.current!;

      // Pickup pin
      if (!pickupMarkerRef.current) {
        const icon = L.divIcon({
          html: `<div style="background:#0F6E56;color:white;font-size:11px;font-weight:700;padding:4px 8px;border-radius:8px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3)">${pickupMarker.label}</div>`,
          className: "",
          iconAnchor: [0, 0],
        });
        pickupMarkerRef.current = L.marker([pickupMarker.lat, pickupMarker.lng], { icon })
          .addTo(map)
          .bindPopup(`<strong>Pickup point</strong><br/>${pickupMarker.label}`);
      } else {
        pickupMarkerRef.current.setLatLng([pickupMarker.lat, pickupMarker.lng]);
      }
    });
  }, [pickupMarker]);

  // Draw driver position + line to pickup
  useEffect(() => {
    if (!mapRef.current || !driverPos) return;
    import("leaflet").then(({ default: L }) => {
      const map = mapRef.current!;

      // Driver marker
      if (!driverMarkerRef.current) {
        const icon = L.divIcon({
          html: `<div style="background:#1a1a2e;color:white;font-size:12px;padding:6px;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.4)">🚕</div>`,
          className: "",
          iconAnchor: [16, 16],
        });
        driverMarkerRef.current = L.marker(driverPos, { icon }).addTo(map);
      } else {
        driverMarkerRef.current.setLatLng(driverPos);
      }

      // Line from driver to pickup
      if (pickupMarker) {
        const lineCoords: [number, number][] = [driverPos, [pickupMarker.lat, pickupMarker.lng]];
        if (!pickupLineRef.current) {
          pickupLineRef.current = L.polyline(lineCoords, { color: "#0F6E56", weight: 3, dashArray: "6 4", opacity: 0.8 }).addTo(map);
        } else {
          pickupLineRef.current.setLatLngs(lineCoords);
        }
      }
    });
  }, [driverPos, pickupMarker]);

  return <div ref={containerRef} className="w-full h-full" />;
}
