"use client";
import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { ridesApi, bookingsApi, fareApi, type Booking, type Ride } from "@/lib/api";
import { isLoggedIn, getUser } from "@/lib/auth";
import { connectSocket, getSocket } from "@/lib/socket";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false });

export default function TripPage() {
  const router = useRouter();
  const [ride, setRide] = useState<Ride | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [farePerPerson, setFarePerPerson] = useState<number | null>(null);
  const [driverPos, setDriverPos] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const user = typeof window !== "undefined" ? getUser() : null;

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }

    ridesApi.myTrip().then(({ data }) => {
      if (!data) return;
      setRide(data);
      loadBookings(data.ride_id);

      // Socket for driver location updates
      connectSocket();
      const socket = getSocket();
      socket.emit("join:ride", { ride_id: data.ride_id });
      socket.on("driver:location", (loc: { lat: number; lng: number }) => {
        setDriverPos([loc.lat, loc.lng]);
      });
      socket.on("booking:new", () => loadBookings(data.ride_id));

      pollRef.current = setInterval(() => loadBookings(data.ride_id), 5000);
    }).catch(() => {});

    return () => { pollRef.current && clearInterval(pollRef.current); };
  }, [router]);

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
      if (ride) loadBookings(ride.ride_id);
    } catch { alert("Could not accept."); }
  }

  async function handleDecline(bookingId: string) {
    try {
      await bookingsApi.decline(bookingId);
      if (ride) loadBookings(ride.ride_id);
    } catch { alert("Could not decline."); }
  }

  async function handleStartTrip() {
    if (!ride) return;
    setStartLoading(true);
    try {
      const { data } = await ridesApi.start(ride.ride_id);
      setRide(data);
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Could not start trip.");
    } finally {
      setStartLoading(false);
    }
  }

  async function handleCancel() {
    if (!ride || !confirm("Cancel the trip? All passengers will be notified.")) return;
    setLoading(true);
    try {
      await ridesApi.cancel(ride.ride_id);
      router.push("/map");
    } catch { alert("Could not cancel."); }
    finally { setLoading(false); }
  }

  const isOrganizer = ride?.initiator_id === user?.user_id;
  const confirmedCount = bookings.filter(b => ["confirmed", "boarded"].includes(b.status)).length;
  const pendingBookings = bookings.filter(b => b.status === "pending");
  const confirmedBookings = bookings.filter(b => ["confirmed", "boarded"].includes(b.status));
  const isLive = ride?.status === "live";

  const pickupMarker = ride?.pickup_lat && ride?.pickup_lng
    ? { lat: ride.pickup_lat, lng: ride.pickup_lng, label: ride.pickup_address ?? "Pickup" }
    : null;

  if (!ride) {
    return (
      <div className="flex flex-col h-screen">
        <Navbar />
        <div className="flex-1 flex items-center justify-center flex-col gap-4 text-center px-6">
          <p className="text-gray-500">You don&apos;t have an active trip.</p>
          <button onClick={() => router.push("/organize")}
            className="bg-brand text-white rounded-xl px-6 py-2.5 text-sm font-semibold">
            Organize a trip
          </button>
          <button onClick={() => router.push("/find")}
            className="text-brand text-sm font-medium">
            Find a trip to join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-96 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className={`p-4 border-b border-gray-100 ${isLive ? "bg-green-50" : "bg-blue-50"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full inline-block ${isLive ? "bg-green-500 animate-pulse" : "bg-blue-400"}`} />
              <h2 className="font-bold text-gray-900">{isLive ? "Trip is live" : "Trip room"}</h2>
            </div>
            <p className="text-xs text-gray-500">→ {ride.destination_address}</p>
            {ride.pickup_address && (
              <p className="text-xs text-gray-500 mt-0.5">Pickup: {ride.pickup_address}</p>
            )}
            {ride.scheduled_at && (
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(ride.scheduled_at).toLocaleString("no-NO")}
              </p>
            )}
          </div>

          {/* Fare summary */}
          <div className="p-4 border-b border-gray-100">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Base fare</span>
              <span className="font-semibold">{((ride.base_fare ?? 0) / 100).toFixed(0)} kr</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500">Per person</span>
              <span className="font-bold text-brand">
                {farePerPerson !== null ? `${(farePerPerson / 100).toFixed(0)} kr` : "—"}
              </span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500">Passengers confirmed</span>
              <span className="font-semibold">{confirmedCount} / {ride.total_seats}</span>
            </div>
          </div>

          {/* Bookings */}
          <div className="p-4 flex-1 overflow-y-auto">
            {/* Pending — organizer can accept/decline */}
            {isOrganizer && pendingBookings.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-sm text-orange-600 mb-2">
                  Requests ({pendingBookings.length})
                </h3>
                {pendingBookings.map((b) => (
                  <div key={b.booking_id} className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-2">
                    <p className="text-xs text-gray-500 mb-2">
                      Wants to join — pickup: <span className="font-medium text-gray-700">{b.pickup_address || "not given"}</span>
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(b.booking_id)}
                        className="flex-1 bg-brand hover:bg-brand-light text-white text-xs font-semibold rounded-lg py-1.5 transition">
                        Accept
                      </button>
                      <button onClick={() => handleDecline(b.booking_id)}
                        className="flex-1 bg-white hover:bg-red-50 text-red-600 border border-red-300 text-xs font-semibold rounded-lg py-1.5 transition">
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Confirmed passengers */}
            {confirmedBookings.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-sm text-gray-700 mb-2">
                  Confirmed ({confirmedBookings.length})
                </h3>
                {confirmedBookings.map((b) => (
                  <div key={b.booking_id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <p className="text-xs text-gray-700">{b.pickup_address || "No address"}</p>
                    <span className="text-xs text-brand font-medium ml-2 shrink-0 capitalize">{b.status}</span>
                  </div>
                ))}
              </div>
            )}

            {bookings.length === 0 && (
              <p className="text-sm text-gray-400">No passengers yet. Share the trip so others can join.</p>
            )}

            {/* Non-organizer pending message */}
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
                {startLoading ? "Starting…" : `Start trip${confirmedCount > 0 ? ` (${confirmedCount} passengers)` : " — accept passengers first"}`}
              </button>
            )}
            {isOrganizer && !isLive && (
              <button onClick={handleCancel} disabled={loading}
                className="w-full bg-white border border-red-300 text-red-600 font-semibold rounded-xl py-2.5 text-sm transition hover:bg-red-50 disabled:opacity-50">
                {loading ? "Cancelling…" : "Cancel trip"}
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
            rides={[ride]}
            center={pickupMarker ? [pickupMarker.lat, pickupMarker.lng] : [59.9139, 10.7522]}
            driverPos={driverPos ?? undefined}
            pickupMarker={pickupMarker ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
