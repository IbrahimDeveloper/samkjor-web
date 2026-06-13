"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import RideCard from "@/components/RideCard";
import { ridesApi, bookingsApi } from "@/lib/api";
import { isLoggedIn, getUser } from "@/lib/auth";
import { connectSocket, getSocket } from "@/lib/socket";
import type { Ride } from "@/lib/api";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false });

const OSLO: [number, number] = [59.9139, 10.7522];

export default function MapPage() {
  const router = useRouter();
  const [rides, setRides] = useState<Ride[]>([]);
  const [isDriver, setIsDriver] = useState(false);
  const [selected, setSelected] = useState<Ride | null>(null);
  const [pickupAddress, setPickupAddress] = useState("");
  const [booking, setBooking] = useState(false);
  const [bookDone, setBookDone] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimDone, setClaimDone] = useState(false);
  const [userPos, setUserPos] = useState<[number, number]>(OSLO);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    setIsDriver(getUser()?.role === "driver");
    navigator.geolocation?.getCurrentPosition(
      (pos) => setUserPos([pos.coords.latitude, pos.coords.longitude]),
      () => {}
    );
  }, [router]);

  const loadRides = useCallback(async () => {
    try {
      const { data } = await ridesApi.nearby(userPos[0], userPos[1]);
      setRides(data);
    } catch { /* silent */ }
  }, [userPos]);

  useEffect(() => { loadRides(); }, [loadRides]);

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    socket.on("booking:new", () => loadRides());
    socket.on("booking:cancelled", () => loadRides());
    return () => { socket.off("booking:new"); socket.off("booking:cancelled"); };
  }, [loadRides]);

  function openRide(r: Ride) {
    setSelected(r);
    setBookDone(false);
    setClaimDone(false);
    setPickupAddress("");
  }

  async function handleBook() {
    if (!selected || !pickupAddress.trim()) return;
    setBooking(true);
    try {
      await bookingsApi.book(selected.ride_id, userPos[0], userPos[1], pickupAddress.trim());
      setBookDone(true);
      loadRides();
    } catch {
      alert("Booking failed — seat may have just been taken.");
    } finally {
      setBooking(false);
    }
  }

  async function handleClaim() {
    if (!selected) return;
    setClaiming(true);
    try {
      await ridesApi.claim(selected.ride_id);
      setClaimDone(true);
      loadRides();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not claim trip.";
      alert(msg);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <Navbar />

      {/* Map legend */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-white/90 backdrop-blur rounded-xl shadow px-4 py-2 flex gap-4 text-xs text-gray-600 pointer-events-none">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-1 rounded bg-navy" />Live ride
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 border-t-2 border-dashed border-gray-400" />Future trip
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-1 rounded bg-gray-300" />Full
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 bg-white border-r border-gray-200 overflow-y-auto flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Rides near you</h2>
            <p className="text-xs text-gray-400 mt-0.5">{rides.length} active</p>
          </div>
          <div className="p-3 flex flex-col gap-3">
            {rides.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                No rides nearby.
              </p>
            )}
            {rides.map((r) => (
              <RideCard
                key={r.ride_id}
                ride={r}
                onBook={isDriver ? undefined : () => openRide(r)}
                onClaim={isDriver && r.ride_type === "future" ? () => openRide(r) : undefined}
              />
            ))}
          </div>
        </aside>

        <div className="flex-1 relative">
          <RideMap
            rides={rides}
            center={userPos}
            onRideClick={!isDriver ? (r) => openRide(r) : undefined}
          />
        </div>
      </div>

      {/* Modal — passenger booking */}
      {selected && !isDriver && (
        <div className="fixed inset-0 bg-black/40 z-[2000] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            {bookDone ? (
              <>
                <p className="text-3xl mb-2">✓</p>
                <h3 className="font-bold text-lg text-gray-900 mb-1">Seat booked!</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Your pickup address has been sent to the driver.
                </p>
                <button onClick={() => setSelected(null)}
                  className="w-full bg-brand text-white rounded-lg py-2.5 text-sm font-semibold">
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-lg text-gray-900">Book this seat</h3>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>
                <RideCard ride={selected} />
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Your pickup address
                  </label>
                  <input
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="e.g. Karl Johans gate 10, Oslo"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <p className="text-xs text-gray-400 mt-1">The driver will pick you up here.</p>
                </div>
                <button
                  onClick={handleBook}
                  disabled={booking || !pickupAddress.trim()}
                  className="mt-4 w-full bg-brand hover:bg-brand-light text-white font-semibold rounded-lg py-2.5 text-sm transition disabled:opacity-60"
                >
                  {booking ? "Booking…" : "Confirm booking"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal — driver claiming a future trip */}
      {selected && isDriver && (
        <div className="fixed inset-0 bg-black/40 z-[2000] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            {claimDone ? (
              <>
                <p className="text-3xl mb-2">✓</p>
                <h3 className="font-bold text-lg text-gray-900 mb-1">Trip claimed!</h3>
                <p className="text-sm text-gray-500 mb-4">
                  All passengers have been notified that you are their driver.
                </p>
                <button onClick={() => setSelected(null)}
                  className="w-full bg-brand text-white rounded-lg py-2.5 text-sm font-semibold">
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-lg text-gray-900">Take this trip?</h3>
                  <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
                </div>
                <RideCard ride={selected} />
                <p className="text-sm text-gray-500 mt-3 mb-4">
                  All passengers on this trip will be notified with your name and rating.
                </p>
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="w-full bg-brand hover:bg-brand-light text-white font-semibold rounded-lg py-2.5 text-sm transition disabled:opacity-60"
                >
                  {claiming ? "Claiming…" : "Take this trip"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
