import clsx from "clsx";
import type { Ride, MatchResult } from "@/lib/api";

type AnyRide = Ride | MatchResult;

interface Props {
  ride: AnyRide;
  onBook?: () => void;
  onClaim?: () => void;
  fare?: number;
  pickupAddress?: string;
}

function isFare(r: AnyRide): r is MatchResult {
  return "fare_per_person" in r;
}

export default function RideCard({ ride, onBook, onClaim, fare, pickupAddress }: Props) {
  const fareDisplay = fare
    ? fare / 100
    : isFare(ride)
    ? ride.fare_per_person / 100
    : "base_fare" in ride
    ? (ride as Ride).base_fare / 100
    : null;

  const isLive = ride.ride_type === "live";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-gray-900">{ride.initiator_name}</p>
          <p className="text-xs text-gray-500">★ {Number(ride.initiator_rating).toFixed(1)}</p>
        </div>
        <span
          className={clsx(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            isLive ? "bg-navy text-white" : "bg-gray-100 text-gray-600"
          )}
        >
          {isLive ? "Live" : "Future"}
        </span>
      </div>

      <div className="text-sm text-gray-700">
        <p>→ {ride.destination_address}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {isLive
            ? "Departing now"
            : new Date(ride.scheduled_at).toLocaleString("no-NO", {
                dateStyle: "short",
                timeStyle: "short",
              })}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="font-bold text-brand text-lg">
            {fareDisplay !== null ? `${Number(fareDisplay).toFixed(0)} kr` : "—"}
          </span>
          <span className="text-gray-400 text-xs ml-1">/ person</span>
        </div>
        <span className="text-xs text-gray-500">
          {ride.seats_remaining} seat{ride.seats_remaining !== 1 ? "s" : ""} left
        </span>
      </div>

      {pickupAddress && (
        <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Pickup: <span className="font-medium text-gray-700">{pickupAddress}</span>
        </div>
      )}

      {onBook && ride.seats_remaining > 0 && (
        <button onClick={onBook}
          className="w-full bg-brand hover:bg-brand-light text-white font-semibold rounded-lg py-2 text-sm transition">
          Book this seat
        </button>
      )}
      {onClaim && ride.seats_remaining > 0 && (
        <button onClick={onClaim}
          className="w-full bg-navy hover:bg-navy/80 text-white font-semibold rounded-lg py-2 text-sm transition">
          Take this trip
        </button>
      )}
      {ride.seats_remaining === 0 && (
        <p className="text-center text-xs text-gray-400 font-medium">Full</p>
      )}
    </div>
  );
}
