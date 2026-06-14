"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { ridesApi } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function makeLine(oLat: number, oLng: number, dLat: number, dLng: number) {
  return { type: "LineString" as const, coordinates: [[oLng, oLat], [dLng, dLat]] as [number, number][] };
}

const destPresets = [
  { label: "Gardermoen", lat: 60.1939, lng: 11.1004 },
  { label: "Oslo S", lat: 59.9110, lng: 10.7527 },
  { label: "Aker Brygge", lat: 59.9093, lng: 10.7263 },
  { label: "Holmenkollen", lat: 59.9638, lng: 10.6672 },
];

const pickupPresets = [
  { label: "My location", lat: null, lng: null },
  { label: "Karl Johans gate", lat: 59.9133, lng: 10.7389 },
  { label: "Grønland T", lat: 59.9107, lng: 10.7627 },
  { label: "Majorstuen T", lat: 59.9295, lng: 10.7148 },
];

export default function OrganizePage() {
  const router = useRouter();
  const [userPos, setUserPos] = useState<[number, number]>([59.9139, 10.7522]);
  const [form, setForm] = useState({
    dest_address: "",
    dest_lat: "",
    dest_lng: "",
    pickup_address: "",
    pickup_lat: "",
    pickup_lng: "",
    seats: "3",
    date: "",
    time: "",
    deadline_hours: "1",
  });
  const [loading, setLoading] = useState(false);
  const [createdRideId, setCreatedRideId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    navigator.geolocation?.getCurrentPosition((pos) => {
      setUserPos([pos.coords.latitude, pos.coords.longitude]);
      setForm((f) => ({
        ...f,
        pickup_lat: pos.coords.latitude.toString(),
        pickup_lng: pos.coords.longitude.toString(),
        pickup_address: "My location",
      }));
    });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setForm((f) => ({ ...f, date: tomorrow.toISOString().slice(0, 10), time: "08:00" }));
  }, [router]);

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.dest_lat || !form.dest_lng) { setError("Pick a destination."); return; }
    if (!form.pickup_lat || !form.pickup_lng) { setError("Set a pickup location."); return; }
    setLoading(true);
    try {
      const oLat = parseFloat(form.pickup_lat);
      const oLng = parseFloat(form.pickup_lng);
      const dLat = parseFloat(form.dest_lat);
      const dLng = parseFloat(form.dest_lng);
      const scheduledAt = new Date(`${form.date}T${form.time}:00`);
      const deadlineAt = new Date(scheduledAt.getTime() - parseInt(form.deadline_hours) * 3_600_000);

      const { data } = await ridesApi.post({
        ride_type: "future",
        origin_lat: oLat,
        origin_lng: oLng,
        destination_address: form.dest_address || `${dLat.toFixed(4)}, ${dLng.toFixed(4)}`,
        destination_lat: dLat,
        destination_lng: dLng,
        route_polyline: makeLine(oLat, oLng, dLat, dLng),
        total_seats: parseInt(form.seats),
        scheduled_at: scheduledAt.toISOString(),
        join_deadline: deadlineAt.toISOString(),
        distance_metres: haversineMetres(oLat, oLng, dLat, dLng),
        city: "oslo",
        pickup_address: form.pickup_address || "Pickup point",
        pickup_lat: oLat,
        pickup_lng: oLng,
      });
      setCreatedRideId((data as unknown as { ride_id: string }).ride_id);
    } catch {
      setError("Failed to post trip. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (createdRideId) {
    return (
      <div className="flex flex-col h-screen">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm px-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Trip created!</h2>
            <p className="text-gray-500 text-sm mb-6">
              Share the trip with others so they can join. You can accept or reject them from the trip room.
            </p>
            <button
              onClick={() => router.push("/trip")}
              className="w-full bg-brand text-white rounded-xl py-3 font-bold text-sm"
            >
              Go to trip room
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-lg mx-auto p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Organize a trip</h1>
          <p className="text-sm text-gray-500 mb-6">
            Create a group trip. Set the pickup point and destination — others can join and split the fare.
          </p>

          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Pickup location */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">Pickup location <span className="text-gray-400 font-normal">(where everyone meets)</span></h3>
              <div className="flex gap-2 flex-wrap">
                {pickupPresets.map((p) => (
                  <button key={p.label} type="button"
                    onClick={() => {
                      if (p.lat === null) {
                        setForm((f) => ({ ...f, pickup_address: "My location", pickup_lat: userPos[0].toString(), pickup_lng: userPos[1].toString() }));
                      } else {
                        setForm((f) => ({ ...f, pickup_address: p.label, pickup_lat: p.lat!.toString(), pickup_lng: p.lng!.toString() }));
                      }
                    }}
                    className={`text-xs rounded-full px-3 py-1 border transition ${form.pickup_address === p.label ? "bg-brand text-white border-brand" : "bg-white border-gray-300 text-gray-600 hover:border-brand"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input value={form.pickup_address} onChange={(e) => set("pickup_address", e.target.value)}
                placeholder="Pickup address name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              <div className="flex gap-2">
                <input value={form.pickup_lat} onChange={(e) => set("pickup_lat", e.target.value)}
                  placeholder="Pickup lat"
                  className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                <input value={form.pickup_lng} onChange={(e) => set("pickup_lng", e.target.value)}
                  placeholder="Pickup lng"
                  className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
            </div>

            {/* Destination */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">Destination</h3>
              <div className="flex gap-2 flex-wrap">
                {destPresets.map((p) => (
                  <button key={p.label} type="button"
                    onClick={() => setForm((f) => ({ ...f, dest_address: p.label, dest_lat: p.lat.toString(), dest_lng: p.lng.toString() }))}
                    className={`text-xs rounded-full px-3 py-1 border transition ${form.dest_address === p.label ? "bg-brand text-white border-brand" : "bg-white border-gray-300 text-gray-600 hover:border-brand"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input value={form.dest_address} onChange={(e) => set("dest_address", e.target.value)}
                placeholder="Destination name"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              <div className="flex gap-2">
                <input value={form.dest_lat} onChange={(e) => set("dest_lat", e.target.value)}
                  placeholder="Lat" className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                <input value={form.dest_lng} onChange={(e) => set("dest_lng", e.target.value)}
                  placeholder="Lng" className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
            </div>

            {/* When */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <h3 className="font-semibold text-gray-800 text-sm">When</h3>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Time</label>
                  <input type="time" value={form.time} onChange={(e) => set("time", e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Stop accepting new passengers</label>
                <select value={form.deadline_hours} onChange={(e) => set("deadline_hours", e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand">
                  <option value="1">1 hour before</option>
                  <option value="2">2 hours before</option>
                  <option value="6">6 hours before</option>
                  <option value="24">1 day before</option>
                </select>
              </div>
            </div>

            {/* Seats */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 text-sm mb-3">Seats available (excluding you)</h3>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((n) => (
                  <button key={n} type="button" onClick={() => set("seats", String(n))}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition ${form.seats === String(n) ? "bg-brand text-white border-brand" : "bg-white border-gray-300 text-gray-700 hover:border-brand"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-brand hover:bg-brand-light text-white font-bold rounded-xl py-3 text-sm transition disabled:opacity-60">
              {loading ? "Creating…" : "Create trip"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
