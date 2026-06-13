"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import RideCard from "@/components/RideCard";
import { matchApi, bookingsApi } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";
import type { MatchResult } from "@/lib/api";

const RideMap = dynamic(() => import("@/components/RideMap"), { ssr: false });

const OSLO: [number, number] = [59.9139, 10.7522];

export default function FindPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    origin_lat: OSLO[0].toString(),
    origin_lng: OSLO[1].toString(),
    dest_lat: "",
    dest_lng: "",
    dest_label: "",
  });
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [highlighted, setHighlighted] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [booking, setBooking] = useState<MatchResult | null>(null);
  const [bookDone, setBookDone] = useState(false);
  const [userPos, setUserPos] = useState<[number, number]>(OSLO);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    navigator.geolocation?.getCurrentPosition((pos) => {
      const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      setUserPos(coords);
      setForm((f) => ({ ...f, origin_lat: coords[0].toString(), origin_lng: coords[1].toString() }));
    });
  }, [router]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!form.dest_lat || !form.dest_lng) return;
    setLoading(true);
    setSearched(false);
    try {
      const { data } = await matchApi.find(
        parseFloat(form.origin_lat),
        parseFloat(form.origin_lng),
        parseFloat(form.dest_lat),
        parseFloat(form.dest_lng)
      );
      setMatches(data.matches);
      setHighlighted(data.matches[0] ?? null);
    } catch {
      setMatches([]);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }

  async function handleBook(match: MatchResult) {
    setBooking(match);
    try {
      await bookingsApi.book(
        match.ride_id,
        parseFloat(form.origin_lat),
        parseFloat(form.origin_lng),
        form.dest_label || "Pickup from smart match"
      );
      setBookDone(true);
    } catch {
      alert("Booking failed — the seat may have just been taken.");
      setBooking(null);
    }
  }

  // Quick preset destinations (Oslo area)
  const presets = [
    { label: "Oslo Lufthavn Gardermoen", lat: 60.1939, lng: 11.1004 },
    { label: "Oslo S (Central Station)", lat: 59.9110, lng: 10.7527 },
    { label: "Aker Brygge", lat: 59.9093, lng: 10.7263 },
  ];

  return (
    <div className="flex flex-col h-screen">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <aside className="w-96 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-lg">Find a ride</h2>
            <p className="text-xs text-gray-400 mt-0.5">Enter your destination to find the best matching ride</p>
          </div>

          <form onSubmit={handleSearch} className="p-4 space-y-3 border-b border-gray-100">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Your location (lat, lng)</label>
              <div className="flex gap-2">
                <input value={form.origin_lat} onChange={(e) => setForm((f) => ({ ...f, origin_lat: e.target.value }))}
                  className="w-1/2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand" placeholder="Lat" />
                <input value={form.origin_lng} onChange={(e) => setForm((f) => ({ ...f, origin_lng: e.target.value }))}
                  className="w-1/2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand" placeholder="Lng" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destination</label>
              <div className="flex gap-1 flex-wrap mb-2">
                {presets.map((p) => (
                  <button key={p.label} type="button"
                    onClick={() => setForm((f) => ({ ...f, dest_lat: p.lat.toString(), dest_lng: p.lng.toString(), dest_label: p.label }))}
                    className="text-xs bg-gray-100 hover:bg-brand hover:text-white rounded-full px-2.5 py-1 transition">
                    {p.label.split(" ")[0]}
                  </button>
                ))}
              </div>
              <input value={form.dest_label}
                onChange={(e) => setForm((f) => ({ ...f, dest_label: e.target.value }))}
                placeholder="or type destination name…"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand mb-2" />
              <div className="flex gap-2">
                <input value={form.dest_lat} onChange={(e) => setForm((f) => ({ ...f, dest_lat: e.target.value }))}
                  className="w-1/2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand" placeholder="Dest lat" />
                <input value={form.dest_lng} onChange={(e) => setForm((f) => ({ ...f, dest_lng: e.target.value }))}
                  className="w-1/2 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand" placeholder="Dest lng" />
              </div>
            </div>

            <button type="submit" disabled={loading || !form.dest_lat}
              className="w-full bg-brand hover:bg-brand-light text-white font-semibold rounded-lg py-2.5 text-sm transition disabled:opacity-60">
              {loading ? "Searching…" : "Find best match"}
            </button>
          </form>

          {/* Results */}
          <div className="p-3 flex flex-col gap-3">
            {searched && matches.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">No rides found in this direction.</p>
                <a href="/organize" className="text-brand text-sm font-medium hover:underline mt-2 inline-block">
                  Post a future trip instead →
                </a>
              </div>
            )}
            {matches.map((m, i) => (
              <div key={m.ride_id} onMouseEnter={() => setHighlighted(m)} onMouseLeave={() => setHighlighted(matches[0])}>
                {i === 0 && <p className="text-xs font-semibold text-brand mb-1">Best match</p>}
                <RideCard ride={m} onBook={() => handleBook(m)} />
              </div>
            ))}
          </div>
        </aside>

        {/* Map */}
        <div className="flex-1 relative">
          <RideMap
            rides={[]}
            highlighted={highlighted}
            center={userPos}
          />
        </div>
      </div>

      {/* Booking confirmation modal */}
      {booking && (
        <div className="fixed inset-0 bg-black/40 z-[2000] flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            {bookDone ? (
              <>
                <p className="text-3xl mb-2">✓</p>
                <h3 className="font-bold text-lg text-gray-900 mb-1">Seat booked!</h3>
                <p className="text-sm text-gray-500 mb-1">
                  <strong>{booking.initiator_name}</strong> heading to {booking.destination_address}.
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  You will receive a notification when the driver is 2 minutes away.
                </p>
                <button onClick={() => { setBooking(null); setBookDone(false); }}
                  className="w-full bg-brand text-white rounded-lg py-2.5 text-sm font-semibold">
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="flex justify-between mb-4">
                  <h3 className="font-bold text-lg">Booking…</h3>
                  <button onClick={() => setBooking(null)} className="text-gray-400 text-xl">×</button>
                </div>
                <p className="text-sm text-gray-500">Processing your booking with {booking.initiator_name}…</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
