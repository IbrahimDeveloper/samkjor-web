"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { ridesApi, bookingsApi, fareApi, type Booking, type Ride } from "@/lib/api";
import { isLoggedIn, getUser } from "@/lib/auth";
import { connectSocket, getSocket } from "@/lib/socket";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false });

// ── Nominatim helpers ────────────────────────────────────────────────────────

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "no,en" } }
    );
    const data = await res.json();
    const a = data.address ?? {};
    const parts = [a.road, a.house_number, a.suburb ?? a.city_district ?? a.neighbourhood].filter(Boolean);
    return parts.length ? parts.join(" ") : data.display_name?.split(",")[0] ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

async function searchAddress(q: string): Promise<{ label: string; lat: number; lng: number }[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=no&format=json&limit=4`,
      { headers: { "Accept-Language": "no,en" } }
    );
    const data = await res.json();
    return data.map((r: { display_name: string; lat: string; lon: string }) => ({
      label: r.display_name.split(",").slice(0, 2).join(",").trim(),
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
  } catch { return []; }
}

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

// ── Create Trip Form ─────────────────────────────────────────────────────────

function CreateTripForm({ onCreated }: { onCreated: () => void }) {
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupLat, setPickupLat] = useState<number | null>(null);
  const [pickupLng, setPickupLng] = useState<number | null>(null);
  const [pickupLoading, setPickupLoading] = useState(false);

  const [destQuery, setDestQuery] = useState("");
  const [destResults, setDestResults] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [destAddress, setDestAddress] = useState("");
  const [destLat, setDestLat] = useState<number | null>(null);
  const [destLng, setDestLng] = useState<number | null>(null);
  const [destSearching, setDestSearching] = useState(false);

  const [seats, setSeats] = useState("3");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("08:00");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const destDebounce = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setDate(tomorrow.toISOString().slice(0, 10));
  }, []);

  async function getMyLocation() {
    setPickupLoading(true);
    navigator.geolocation?.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setPickupLat(lat);
      setPickupLng(lng);
      const addr = await reverseGeocode(lat, lng);
      setPickupAddress(addr);
      setPickupLoading(false);
    }, () => {
      setPickupLoading(false);
      setError("Could not get your location. Enable GPS and try again.");
    });
  }

  function onDestQueryChange(v: string) {
    setDestQuery(v);
    setDestAddress("");
    setDestLat(null);
    setDestLng(null);
    if (destDebounce.current) clearTimeout(destDebounce.current);
    if (v.length < 3) { setDestResults([]); return; }
    destDebounce.current = setTimeout(async () => {
      setDestSearching(true);
      const results = await searchAddress(v + " Oslo");
      setDestResults(results);
      setDestSearching(false);
    }, 400);
  }

  function pickDest(r: { label: string; lat: number; lng: number }) {
    setDestAddress(r.label);
    setDestLat(r.lat);
    setDestLng(r.lng);
    setDestQuery(r.label);
    setDestResults([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!pickupLat || !pickupLng) { setError("Use GPS to set your pickup location."); return; }
    if (!destLat || !destLng) { setError("Search and select a destination."); return; }
    setLoading(true);
    try {
      const scheduledAt = new Date(`${date}T${time}:00`);
      const deadlineAt = new Date(scheduledAt.getTime() - 3_600_000);
      await ridesApi.post({
        ride_type: "future",
        origin_lat: pickupLat,
        origin_lng: pickupLng,
        destination_address: destAddress,
        destination_lat: destLat,
        destination_lng: destLng,
        route_polyline: makeLine(pickupLat, pickupLng, destLat, destLng),
        total_seats: parseInt(seats),
        scheduled_at: scheduledAt.toISOString(),
        join_deadline: deadlineAt.toISOString(),
        distance_metres: haversineMetres(pickupLat, pickupLng, destLat, destLng),
        city: "oslo",
        pickup_address: pickupAddress,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
      });
      onCreated();
    } catch {
      setError("Failed to create trip. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Organize a trip</h1>
      <p className="text-sm text-gray-500 mb-6">Set a pickup point and destination. Others can request to join and split the fare.</p>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Pickup */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm">Pickup location <span className="text-gray-400 font-normal">(where everyone meets you)</span></h3>
          <button type="button" onClick={getMyLocation} disabled={pickupLoading}
            className="w-full flex items-center justify-center gap-2 border border-brand text-brand rounded-lg py-2.5 text-sm font-semibold hover:bg-brand/5 transition disabled:opacity-60">
            {pickupLoading ? "Getting location…" : "📍 Use my GPS location"}
          </button>
          {pickupAddress && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800 font-medium">
              {pickupAddress}
            </div>
          )}
        </div>

        {/* Destination */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm">Destination</h3>
          <div className="relative">
            <input
              value={destQuery}
              onChange={(e) => onDestQueryChange(e.target.value)}
              placeholder="Search destination (e.g. Gardermoen, Oslo S…)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {destSearching && <p className="text-xs text-gray-400 mt-1">Searching…</p>}
            {destResults.length > 0 && (
              <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                {destResults.map((r, i) => (
                  <button key={i} type="button" onClick={() => pickDest(r)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    {r.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {destAddress && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800 font-medium">
              {destAddress}
            </div>
          )}
        </div>

        {/* When */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <h3 className="font-semibold text-gray-800 text-sm">When</h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>
        </div>

        {/* Seats */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Seats available (excluding you)</h3>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} type="button" onClick={() => setSeats(String(n))}
                className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition ${seats === String(n) ? "bg-brand text-white border-brand" : "bg-white border-gray-300 text-gray-700 hover:border-brand"}`}>
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
  );
}

// ── Main Trip Page ───────────────────────────────────────────────────────────

export default function TripPage() {
  const router = useRouter();
  const [ride, setRide] = useState<Ride | null>(null);
  const [pageState, setPageState] = useState<"loading" | "no-trip" | "active">("loading");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [farePerPerson, setFarePerPerson] = useState<number | null>(null);
  const [driverPos, setDriverPos] = useState<[number, number] | null>(null);
  const [startLoading, setStartLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const user = typeof window !== "undefined" ? getUser() : null;

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    loadTrip();
    return () => { pollRef.current && clearInterval(pollRef.current); };
  }, [router]);

  async function loadTrip() {
    try {
      const { data } = await ridesApi.myTrip();
      if (!data) { setPageState("no-trip"); return; }
      setRide(data);
      setPageState("active");
      loadBookings(data.ride_id);

      connectSocket();
      const socket = getSocket();
      socket.emit("join:ride", { ride_id: data.ride_id });
      socket.on("driver:location", (loc: { lat: number; lng: number }) => setDriverPos([loc.lat, loc.lng]));
      socket.on("booking:new", () => loadBookings(data.ride_id));

      pollRef.current = setInterval(() => loadBookings(data.ride_id), 5000);
    } catch {
      setPageState("no-trip");
    }
  }

  async function loadBookings(rideId: string) {
    try {
      const { data } = await bookingsApi.forRide(rideId);
      setBookings(data);
      const fare = await fareApi.summary(rideId);
      setFarePerPerson(fare.data.fare_per_person);
    } catch { /* silent */ }
  }

  async function handleAccept(bookingId: string) {
    try { await bookingsApi.accept(bookingId); if (ride) loadBookings(ride.ride_id); }
    catch { alert("Could not accept."); }
  }

  async function handleDecline(bookingId: string) {
    try { await bookingsApi.decline(bookingId); if (ride) loadBookings(ride.ride_id); }
    catch { alert("Could not decline."); }
  }

  async function handleStartTrip() {
    if (!ride) return;
    setStartLoading(true);
    try {
      const { data } = await ridesApi.start(ride.ride_id);
      setRide(data);
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not start trip.");
    } finally { setStartLoading(false); }
  }

  async function handleCancel() {
    if (!ride || !confirm("Cancel the trip? All passengers will be notified.")) return;
    setCancelLoading(true);
    try {
      await ridesApi.cancel(ride.ride_id);
      setRide(null);
      setBookings([]);
      setPageState("no-trip");
      pollRef.current && clearInterval(pollRef.current);
    } catch { alert("Could not cancel."); }
    finally { setCancelLoading(false); }
  }

  const isOrganizer = ride?.initiator_id === user?.user_id;
  const confirmedCount = bookings.filter(b => ["confirmed", "boarded"].includes(b.status)).length;
  const pendingBookings = bookings.filter(b => b.status === "pending");
  const confirmedBookings = bookings.filter(b => ["confirmed", "boarded"].includes(b.status));
  const isLive = ride?.status === "live";
  const pickupMarker = ride?.pickup_lat && ride?.pickup_lng
    ? { lat: ride.pickup_lat, lng: ride.pickup_lng, label: ride.pickup_address ?? "Pickup" }
    : null;

  if (pageState === "loading") {
    return (
      <div className="flex flex-col h-screen">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-400 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (pageState === "no-trip") {
    return (
      <div className="flex flex-col h-screen">
        <Navbar />
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <CreateTripForm onCreated={() => { setPageState("loading"); loadTrip(); }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-96 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className={`p-4 border-b border-gray-100 ${isLive ? "bg-green-50" : "bg-blue-50"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full inline-block ${isLive ? "bg-green-500 animate-pulse" : "bg-blue-400"}`} />
              <h2 className="font-bold text-gray-900">{isLive ? "Trip is live" : "Trip room"}</h2>
            </div>
            <p className="text-xs text-gray-500">→ {ride!.destination_address}</p>
            {ride!.pickup_address && <p className="text-xs text-gray-500 mt-0.5">Pickup: {ride!.pickup_address}</p>}
            {ride!.scheduled_at && (
              <p className="text-xs text-gray-400 mt-0.5">{new Date(ride!.scheduled_at).toLocaleString("no-NO")}</p>
            )}
          </div>

          {/* Fare */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Base fare</span>
              <span className="font-semibold">{((ride!.base_fare ?? 0) / 100).toFixed(0)} kr</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500">Per person</span>
              <span className="font-bold text-brand">{farePerPerson !== null ? `${(farePerPerson / 100).toFixed(0)} kr` : "—"}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500">Passengers confirmed</span>
              <span className="font-semibold">{confirmedCount} / {ride!.total_seats}</span>
            </div>
          </div>

          {/* Bookings */}
          <div className="p-4 flex-1 overflow-y-auto">
            {isOrganizer && pendingBookings.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-sm text-orange-600 mb-2">Requests ({pendingBookings.length})</h3>
                {pendingBookings.map((b) => (
                  <div key={b.booking_id} className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-2">
                    <p className="text-xs text-gray-500 mb-2">Pickup: <span className="font-medium text-gray-700">{b.pickup_address || "not given"}</span></p>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(b.booking_id)}
                        className="flex-1 bg-brand hover:bg-brand-light text-white text-xs font-semibold rounded-lg py-1.5 transition">Accept</button>
                      <button onClick={() => handleDecline(b.booking_id)}
                        className="flex-1 bg-white hover:bg-red-50 text-red-600 border border-red-300 text-xs font-semibold rounded-lg py-1.5 transition">Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {confirmedBookings.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-sm text-gray-700 mb-2">Confirmed ({confirmedBookings.length})</h3>
                {confirmedBookings.map((b) => (
                  <div key={b.booking_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <p className="text-xs text-gray-700">{b.pickup_address || "No address"}</p>
                    <span className="text-xs text-brand font-medium ml-2 shrink-0 capitalize">{b.status}</span>
                  </div>
                ))}
              </div>
            )}

            {bookings.length === 0 && isOrganizer && (
              <p className="text-sm text-gray-400">No requests yet. Share the trip link so others can join.</p>
            )}

            {!isOrganizer && pendingBookings.some(b => b.passenger_id === user?.user_id) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800">
                Your request is pending — waiting for the organizer to accept you.
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-4 space-y-2 border-t border-gray-100">
            {isOrganizer && !isLive && (
              <button onClick={handleStartTrip} disabled={startLoading || confirmedCount === 0}
                className="w-full bg-brand hover:bg-brand-light text-white font-bold rounded-xl py-3 text-sm transition disabled:opacity-50">
                {startLoading ? "Starting…" : confirmedCount > 0 ? `Start trip (${confirmedCount} passengers)` : "Accept passengers to start"}
              </button>
            )}
            {isOrganizer && !isLive && (
              <button onClick={handleCancel} disabled={cancelLoading}
                className="w-full bg-white border border-red-300 text-red-600 font-semibold rounded-xl py-2.5 text-sm hover:bg-red-50 transition disabled:opacity-50">
                {cancelLoading ? "Cancelling…" : "Cancel trip"}
              </button>
            )}
            {isLive && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 text-center">
                Trip is live — driver is on the way to the pickup point.
              </div>
            )}
          </div>
        </aside>

        {/* Map */}
        <div className="flex-1 relative">
          <RideMap
            rides={[ride!]}
            center={pickupMarker ? [pickupMarker.lat, pickupMarker.lng] : [59.9139, 10.7522]}
            driverPos={driverPos ?? undefined}
            pickupMarker={pickupMarker ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
