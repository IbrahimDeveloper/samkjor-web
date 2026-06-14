"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { ridesApi, bookingsApi, fareApi, type Booking, type Ride } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";
import { connectSocket, getSocket } from "@/lib/socket";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false });

const OSLO: [number, number] = [59.9139, 10.7522];

export default function DriverPage() {
  const router = useRouter();
  const [currentRide, setCurrentRide] = useState<Ride | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [farePerPerson, setFarePerPerson] = useState<number | null>(null);
  const [userPos, setUserPos] = useState<[number, number]>(OSLO);
  const [tripRequests, setTripRequests] = useState<Ride[]>([]);
  const [endLoading, setEndLoading] = useState(false);
  const locationInterval = useRef<NodeJS.Timeout | null>(null);
  const bookingInterval = useRef<NodeJS.Timeout | null>(null);
  const tripPollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }

    navigator.geolocation?.getCurrentPosition((pos) => {
      setUserPos([pos.coords.latitude, pos.coords.longitude]);
    });

    // Restore active ride on refresh
    ridesApi.myActive().then(({ data }) => {
      if (data) {
        setCurrentRide(data);
        startLocationBroadcast(data.ride_id);
        loadBookings(data.ride_id);
      }
    }).catch(() => {});

    loadTripRequests();
    tripPollRef.current = setInterval(loadTripRequests, 6000);
    return () => {
      tripPollRef.current && clearInterval(tripPollRef.current);
      locationInterval.current && clearInterval(locationInterval.current);
      bookingInterval.current && clearInterval(bookingInterval.current);
    };
  }, [router]);

  async function loadTripRequests() {
    try {
      const { data } = await ridesApi.nearby(59.9139, 10.7522);
      setTripRequests(
        (data as Ride[]).filter(r => r.ride_type === "future" && r.status === "live" && !r.assigned_driver_id)
      );
    } catch { /* silent */ }
  }

  async function handleClaimTrip(rideId: string) {
    try {
      const { data } = await ridesApi.claim(rideId);
      setCurrentRide(data);
      startLocationBroadcast(data.ride_id);
      loadBookings(data.ride_id);
      loadTripRequests();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not accept trip.");
    }
  }

  function startLocationBroadcast(rideId: string) {
    connectSocket();
    const socket = getSocket();
    const joinRoom = () => socket.emit("join:ride", { ride_id: rideId });
    if (socket.connected) joinRoom(); else socket.once("connect", joinRoom);
    socket.on("booking:new", () => loadBookings(rideId));
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

  async function handleEndRide() {
    if (!currentRide) return;
    setEndLoading(true);
    try {
      await ridesApi.end(currentRide.ride_id);
      locationInterval.current && clearInterval(locationInterval.current);
      bookingInterval.current && clearInterval(bookingInterval.current);
      setCurrentRide(null);
      setBookings([]);
      setFarePerPerson(null);
    } catch {
      alert("Failed to end ride.");
    } finally {
      setEndLoading(false);
    }
  }

  const confirmedBookings = bookings.filter(b => ["confirmed", "boarded"].includes(b.status));

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-96 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">

          {/* No active ride — show trip requests */}
          {!currentRide && (
            <>
              <div className="p-5 border-b border-gray-100">
                <h2 className="font-bold text-gray-900 text-lg">Trip requests</h2>
                <p className="text-xs text-gray-400 mt-0.5">Passengers looking for a driver — accept a trip to get started</p>
              </div>

              {tripRequests.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-8 text-center">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">No trip requests right now.</p>
                    <p className="text-gray-300 text-xs">Requests appear here when passengers start a trip.</p>
                  </div>
                </div>
              ) : (
                <div className="p-3 space-y-3">
                  {tripRequests.map((r) => (
                    <div key={r.ride_id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-bold text-gray-900">→ {r.destination_address}</p>
                          {r.pickup_address && (
                            <p className="text-xs text-gray-500 mt-0.5">Pickup: {r.pickup_address}</p>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-brand bg-brand/10 rounded-lg px-2 py-1 shrink-0 ml-2">
                          {(r.base_fare / 100).toFixed(0)} kr
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
                        <span>{r.total_seats - r.seats_remaining} passenger{r.total_seats - r.seats_remaining !== 1 ? "s" : ""}</span>
                        {r.scheduled_at && (
                          <span>{new Date(r.scheduled_at).toLocaleString("no-NO", { dateStyle: "short", timeStyle: "short" })}</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleClaimTrip(r.ride_id)}
                        className="w-full bg-brand hover:bg-brand-light text-white text-sm font-bold rounded-xl py-2.5 transition"
                      >
                        Accept trip
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Active ride */}
          {currentRide && (
            <>
              <div className="p-4 border-b border-gray-100 bg-green-50">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                  <h2 className="font-bold text-gray-900">Active trip</h2>
                </div>
                <p className="text-xs text-gray-600 font-medium">→ {currentRide.destination_address}</p>
                {currentRide.pickup_address && (
                  <p className="text-xs text-gray-500 mt-0.5">Pickup: {currentRide.pickup_address}</p>
                )}
              </div>

              <div className="p-4 border-b border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Base fare</span>
                  <span className="font-semibold">{((currentRide.base_fare ?? 0) / 100).toFixed(0)} kr</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Per person</span>
                  <span className="font-bold text-brand">
                    {farePerPerson !== null ? `${(farePerPerson / 100).toFixed(0)} kr` : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-500">Passengers</span>
                  <span className="font-semibold">{confirmedBookings.length} confirmed</span>
                </div>
              </div>

              <div className="p-4 flex-1 overflow-y-auto">
                {confirmedBookings.length > 0 ? (
                  <>
                    <h3 className="font-semibold text-sm text-gray-700 mb-2">Passengers</h3>
                    {confirmedBookings.map((b, i) => (
                      <div key={b.booking_id} className="flex items-center py-2 border-b border-gray-100 last:border-0">
                        <span className="text-xs text-gray-400 w-5">{i + 1}.</span>
                        <p className="text-xs text-gray-700 font-medium flex-1">{b.pickup_address || "No address"}</p>
                        <span className="text-xs text-brand font-medium capitalize">{b.status}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className="text-sm text-gray-400">No confirmed passengers yet.</p>
                )}
              </div>

              <div className="p-4">
                <button onClick={handleEndRide} disabled={endLoading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl py-3 text-sm transition disabled:opacity-60">
                  {endLoading ? "Ending…" : "End ride"}
                </button>
              </div>
            </>
          )}
        </aside>

        <div className="flex-1 relative">
          <RideMap
            rides={currentRide ? [currentRide] : tripRequests}
            center={userPos}
            pickupMarker={currentRide?.pickup_lat && currentRide?.pickup_lng ? {
              lat: currentRide.pickup_lat,
              lng: currentRide.pickup_lng,
              label: currentRide.pickup_address ?? "Pickup"
            } : undefined}
          />
        </div>
      </div>
    </div>
  );
}
