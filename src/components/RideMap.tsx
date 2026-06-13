"use client";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Polyline } from "leaflet";
import type { Ride, MatchResult } from "@/lib/api";

interface Props {
  rides: Ride[];
  highlighted?: MatchResult | null;
  center?: [number, number];
  onRideClick?: (ride: Ride) => void;
}

// Spec colour / style per ride type
function polylineOptions(ride: Ride, isHighlighted: boolean) {
  if (isHighlighted) {
    return { color: "#0F6E56", weight: 6, opacity: 1, dashArray: undefined };
  }
  if (ride.status === "full") {
    return { color: "#aaaaaa", weight: 3, opacity: 0.5, dashArray: undefined };
  }
  if (ride.ride_type === "future") {
    return { color: "#888888", weight: 3, opacity: 0.8, dashArray: "8 6" };
  }
  // live
  return { color: "#1a1a2e", weight: 4, opacity: 1, dashArray: undefined };
}

export default function RideMap({ rides, highlighted, center, onRideClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const linesRef = useRef<Map<string, Polyline>>(new Map());

  // Oslo default centre
  const defaultCenter: [number, number] = center ?? [59.9139, 10.7522];

  useEffect(() => {
    // Leaflet must only run client-side
    let L: typeof import("leaflet");
    async function init() {
      L = (await import("leaflet")).default;

      // Fix default icon URLs broken by webpack
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

  // Draw/update polylines when rides change
  useEffect(() => {
    if (!mapRef.current) return;
    const L_module = import("leaflet");
    L_module.then(({ default: L }) => {
      const map = mapRef.current!;
      const existing = new Set(linesRef.current.keys());

      rides.forEach((ride) => {
        existing.delete(ride.ride_id);
        const coords: [number, number][] =
          ride.route_polyline_geo.coordinates.map(([lng, lat]) => [lat, lng]);
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
              `<strong>${ride.initiator_name}</strong><br/>
               ${ride.destination_address}<br/>
               ${ride.seats_remaining} seat${ride.seats_remaining !== 1 ? "s" : ""} · ${(ride.base_fare / 100).toFixed(0)} kr`,
              { sticky: true }
            );
          }
          linesRef.current.set(ride.ride_id, line);
        }
      });

      // Remove rides no longer present
      existing.forEach((id) => {
        linesRef.current.get(id)?.remove();
        linesRef.current.delete(id);
      });
    });
  }, [rides, highlighted, onRideClick]);

  return <div ref={containerRef} className="w-full h-full" />;
}
