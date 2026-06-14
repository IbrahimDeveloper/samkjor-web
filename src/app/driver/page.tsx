"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { ridesApi, bookingsApi, fareApi, type Booking } from "@/lib/api";
import { isLoggedIn, getUser } from "@/lib/auth";
import { connectSocket, getSocket } from "@/lib/socket";
import type { Ride } from "@/lib/api";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false });

const OSLO: [number, number] = [59.9139, 10.7522];

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

type Stage = "idle" | "posting" | "live";

export default function DriverPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [form, setForm] = useState({ dest_address: "", dest_lat: "", dest_lng: "", seats: "2" });
  const [currentRide, setCurrentRide] = useState<Ride | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [farePerPerson, setFarePerPerson] = useState<number | null>(null);
  const [userPos, setUserPos] = useState<[number, number]>(OSLO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const locationInterval = useRef<NodeJS.Timeout | null>(null);
  const bookingInterval = useRef<NodeJS.Timeout | null>(null);
  const [tripRequests, setTripRequests] = useState<Ride[]>([]);
  const tripPollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    const user = getUser();
    if (user?.role === "passenger") { router.replace("/map"); return; }

    navigator.geolocation?.getCurrentPosition((pos) => {
      setUserPos([pos.coords.latitude, pos.coords.longitude]);
    });

    // Restore active ride on page load/refresh
    ridesApi.myActive().then(({ data }) => {
      if (data) {
        setCurrentRide(data);
        setStage("live");
        startLocationBroadcast(data.ride_id);
        loadBookings(data.ride_id);
      }
    }).catch(() => {});

    // Poll for passenger-organized trip requests every 6s
    loadTripRequests();
    tripPollRef.current = setInterval(loadTripRequests, 6000);
    return () => { tripPollRef.current && clearInterval(tripPollRef.current); };
  }, [router]);

  async function loadTripRequests() {
    try {
      const { data } = await ridesApi.nearby(59.9139, 10.7522);
      const requests = (data as Ride[]).filter(
        (r) => r.ride_type === "future" && r.status === "live" && !r.assigned_driver_id
      );
      setTripRequests(requests);
    } catch { /* silent */ }
  }

  async function handleClaimTrip(rideId: string) {
    try {
      await ridesApi.claim(rideId);
      loadTripRequests();
      alert("Trip claimed! The passengers have been notified.");
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not claim trip.");
    }
  }

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.dest_lat || !form.dest_lng) { setError("Enter destination coordinates."); return; }
    setLoading(true);
    try {
      const dLat = parseFloat(form.dest_lat);
      const dLng = parseFloat(form.dest_lng);
      const dist = haversineMetres(userPos[0], userPos[1], dLat, dLng);
      const { data } = await ridesApi.post({
        ride_type: "live",
        origin_lat: userPos[0],
        origin_lng: userPos[1],
        destination_address: form.dest_address || `${dLat.toFixed(4)}, ${dLng.toFixed(4)}`,
        destination_lat: dLat,
        destination_lng: dLng,
        route_polyline: makeLine(userPos[0], userPos[1], dLat, dLng),
        total_seats: parseInt(form.seats),
        distance_metres: dist,
        city: "oslo",
      });
      setCurrentRide(data as unknown as Ride);
      setStage("live");
      startLocationBroadcast(data.ride_id as string);
      loadBookings(data.ride_id as string);
    } catch {
      setError("Failed to post ride. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function startLocationBroadcast(rideId: string) {
    // Broadcast via WebSocket + REST every 3 s
    connectSocket();
    const socket = getSocket();
    const joinRoom = () => socket.emit("join:ride", { ride_id: rideId });
    if (socket.connected) joinRoom(); else socket.once("connect", joinRoom);
    socket.on("booking:new", () => loadBookings(rideId));

    // Poll every 5s as fallback in case socket misses the event
    bookingInterval.current = setInterval(() => loadBookings(rideId), 5000);

    locationInterval.current = setInterval(() => {
      navigator.geolocation?.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserPos([lat, lng]);
        socket.emit("driver:location", { ride_id: rideId, lat, lng });
        ridesApi.postLocation(rideId, lat, lng).catch(() => {});
      });
    }, 3000);
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
    try {
      await bookingsApi.accept(bookingId);
      if (currentRide) loadBookings(currentRide.ride_id);
    } catch {
      alert("Could not accept booking.");
    }
  }

  async function handleDecline(bookingId: string) {
    try {
      await bookingsApi.decline(bookingId);
      if (currentRide) loadBookings(currentRide.ride_id);
    } catch {
      alert("Could not decline booking.");
    }
  }

  async function handleEndRide() {
    if (!currentRide) return;
    setLoading(true);
    try {
      await ridesApi.end(currentRide.ride_id);
      locationInterval.current && clearInterval(locationInterval.current);
      bookingInterval.current && clearInterval(bookingInterval.current);
      setStage("idle");
      setCurrentRide(null);
      setBookings([]);
      setFarePerPerson(null);
    } catch {
      alert("Failed to end ride.");
    } finally {
      setLoading(false);
    }
  }

  const presets = [
    { label: "Gardermoen", lat: 60.1939, lng: 11.1004 },
    { label: "Oslo S", lat: 59.9110, lng: 10.7527 },
    { label: "Aker Brygge", lat: 59.9093, lng: 10.7263 },
  ];

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-96 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          {stage === "idle" && (
            <>
              {/* Passenger trip requests */}
              {tripRequests.length > 0 && (
                <div className="border-b border-gray-100">
                  <div className="p-4 bg-blue-50">
                    <h2 className="font-bold text-gray-900 text-sm">Trip requests ({tripRequests.length})</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Passengers looking for a driver</p>
                  </div>
                  <div className="p-3 space-y-2">
                    {tripRequests.map((r) => (
                      <div key={r.ride_id} className="bg-white border border-blue-200 rounded-xl p-3">
                        <p className="text-sm font-semibold text-gray-900">→ {r.destination_address}</p>
                        {r.pickup_address && (
                          <p className="text-xs text-gray-500 mt-0.5">Pickup: {r.pickup_address}</p>
                        )}
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs text-gray-400">
                            {r.total_seats - r.seats_remaining} passengers · {(r.base_fare / 100).toFixed(0)} kr base
                          </span>
                          {r.scheduled_at && (
                            <span className="text-xs text-gray-400">
                              {new Date(r.scheduled_at).toLocaleString("no-NO", { dateStyle: "short", timeStyle: "short" })}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleClaimTrip(r.ride_id)}
                          className="w-full mt-2 bg-brand hover:bg-brand-light text-white text-xs font-bold rounded-lg py-2 transition"
                        >
                          Accept trip
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-5 border-b border-gray-100">
                <h2 className="font-bold text-gray-900 text-lg">Post a live ride</h2>
                <p className="text-xs text-gray-400 mt-0.5">Broadcast your route so passengers can join</p>
              </div>

              <form onSubmit={handlePost} className="p-4 space-y-4">
                {error && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
                )}
                <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
                  Your location: {userPos[0].toFixed(4)}, {userPos[1].toFixed(4)}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Destination</label>
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {presets.map((p) => (
                      <button key={p.label} type="button"
                        onClick={() => setForm((f) => ({ ...f, dest_address: p.label, dest_lat: p.lat.toString(), dest_lng: p.lng.toString() }))}
                        className={`text-xs rounded-full px-3 py-1 border transition ${form.dest_address === p.label ? "bg-brand text-white border-brand" : "bg-white border-gray-300 hover:border-brand"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <input value={form.dest_address} onChange={(e) => set("dest_address", e.target.value)}
                    placeholder="Destination name"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand mb-2" />
                  <div className="flex gap-2">
                    <input value={form.dest_lat} onChange={(e) => set("dest_lat", e.target.value)}
                      placeholder="Dest lat"
                      className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                    <input value={form.dest_lng} onChange={(e) => set("dest_lng", e.target.value)}
                      placeholder="Dest lng"
                      className="w-1/2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Available seats</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((n) => (
                      <button key={n} type="button" onClick={() => set("seats", String(n))}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition ${form.seats === String(n) ? "bg-brand text-white border-brand" : "bg-white border-gray-300 hover:border-brand"}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full bg-brand hover:bg-brand-light text-white font-bold rounded-xl py-3 text-sm transition disabled:opacity-60">
                  {loading ? "Posting…" : "Post ride"}
                </button>
              </form>
            </>
          )}

          {stage === "live" && currentRide && (
            <>
              <div className="p-4 border-b border-gray-100 bg-green-50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                  <h2 className="font-bold text-gray-900">Ride is live</h2>
                </div>
                <p className="text-xs text-gray-500">→ {currentRide.destination_address}</p>
              </div>

              {/* Fare summary */}
              <div className="p-4 border-b border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Base fare</span>
                  <span className="font-semibold">{((currentRide.base_fare ?? 0) / 100).toFixed(0)} kr</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Per person (current split)</span>
                  <span className="font-bold text-brand">
                    {farePerPerson !== null ? `${(farePerPerson / 100).toFixed(0)} kr` : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Seats filled</span>
                  <span className="font-semibold">
                    {bookings.filter(b => ["confirmed","boarded"].includes(b.status)).length} / {currentRide.total_seats}
                  </span>
                </div>
              </div>

              {/* Bookings list */}
              <div className="p-4 flex-1 overflow-y-auto">
                {/* Pending — needs action */}
                {bookings.filter((b) => b.status === "pending").length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-semibold text-sm text-orange-600 mb-2">
                      Requests ({bookings.filter((b) => b.status === "pending").length})
                    </h3>
                    {bookings.filter((b) => b.status === "pending").map((b) => (
                      <div key={b.booking_id} className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-2">
                        <p className="text-xs text-gray-500 mb-2">
                          Pickup: <span className="font-medium text-gray-700">{b.pickup_address || "Address not provided"}</span>
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAccept(b.booking_id)}
                            className="flex-1 bg-brand hover:bg-brand-light text-white text-xs font-semibold rounded-lg py-1.5 transition"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDecline(b.booking_id)}
                            className="flex-1 bg-white hover:bg-red-50 text-red-600 border border-red-300 text-xs font-semibold rounded-lg py-1.5 transition"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Confirmed passengers */}
                {bookings.filter((b) => b.status === "confirmed" || b.status === "boarded").length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm text-gray-700 mb-2">
                      Confirmed ({bookings.filter((b) => ["confirmed","boarded"].includes(b.status)).length})
                    </h3>
                    {bookings.filter((b) => ["confirmed","boarded"].includes(b.status)).map((b) => (
                      <div key={b.booking_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <p className="text-xs text-gray-700 font-medium">
                          {b.pickup_address || "Address not provided"}
                        </p>
                        <span className="text-xs font-medium text-brand capitalize ml-2 shrink-0">{b.status}</span>
                      </div>
                    ))}
                  </div>
                )}

                {bookings.length === 0 && (
                  <p className="text-sm text-gray-400">No booking requests yet. Your route is visible on the map.</p>
                )}
              </div>

              <div className="p-4">
                <button onClick={handleEndRide} disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl py-3 text-sm transition disabled:opacity-60">
                  {loading ? "Ending…" : "End ride"}
                </button>
                <p className="text-xs text-center text-gray-400 mt-2">
                  Ending the ride processes all payments automatically.
                </p>
              </div>
            </>
          )}
        </aside>

        {/* Map */}
        <div className="flex-1 relative">
          <RideMap
            rides={currentRide ? [currentRide] : []}
            center={userPos}
          />
        </div>
      </div>
    </div>
  );
}
