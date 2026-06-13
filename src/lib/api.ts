import axios from "axios";
import { getToken } from "./auth";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

// ── Typed helpers ────────────────────────────────────────────────────────────

export interface Ride {
  ride_id: string;
  ride_type: "live" | "future";
  status: string;
  initiator_name: string;
  initiator_rating: number;
  destination_address: string;
  total_seats: number;
  seats_remaining: number;
  base_fare: number;
  scheduled_at: string;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  route_polyline_geo: GeoLineString;
}

export interface GeoLineString {
  type: "LineString";
  coordinates: [number, number][];
}

export interface MatchResult {
  ride_id: string;
  ride_type: string;
  status: string;
  initiator_name: string;
  initiator_rating: number;
  destination_address: string;
  seats_remaining: number;
  fare_per_person: number;
  scheduled_at: string;
  route_polyline_geo: GeoLineString;
}

export interface Booking {
  booking_id: string;
  ride_id: string;
  status: string;
  fare_at_booking: number | null;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
}

export const authApi = {
  register: (data: { name: string; phone: string; password: string; role: string }) =>
    api.post<{ token: string; user_id: string; role: string }>("/auth/register", data),
  login: (data: { phone: string; password: string }) =>
    api.post<{ token: string; user_id: string; role: string }>("/auth/login", data),
  me: () => api.get<{ name: string; user_id: string; role: string }>("/auth/me"),
};

export const ridesApi = {
  nearby: (lat: number, lng: number) =>
    api.get<Ride[]>(`/rides/nearby?lat=${lat}&lng=${lng}`),
  get: (id: string) => api.get<Ride>(`/rides/${id}`),
  post: (data: object) => api.post<Ride>("/rides", data),
  end: (id: string) => api.post(`/rides/${id}/end`),
  cancel: (id: string) => api.post(`/rides/${id}/cancel`),
  claim: (id: string) => api.post<Ride>(`/rides/${id}/claim`),
  myActive: () => api.get<Ride | null>("/rides/my-active"),
  postLocation: (id: string, lat: number, lng: number) =>
    api.post(`/rides/${id}/location`, { lat, lng }),
};

export const matchApi = {
  find: (originLat: number, originLng: number, destLat: number, destLng: number) =>
    api.post<{ matches: MatchResult[] }>("/match", {
      origin_lat: originLat,
      origin_lng: originLng,
      destination_lat: destLat,
      destination_lng: destLng,
    }),
};

export const bookingsApi = {
  book: (rideId: string, pickupLat: number, pickupLng: number, pickupAddress: string) =>
    api.post<Booking>("/bookings", { ride_id: rideId, pickup_lat: pickupLat, pickup_lng: pickupLng, pickup_address: pickupAddress }),
  cancel: (bookingId: string) => api.post(`/bookings/${bookingId}/cancel`),
  accept: (bookingId: string) => api.post(`/bookings/${bookingId}/accept`),
  decline: (bookingId: string) => api.post(`/bookings/${bookingId}/decline`),
  forRide: (rideId: string) => api.get<Booking[]>(`/bookings/ride/${rideId}`),
};

export const fareApi = {
  summary: (rideId: string) =>
    api.get<{ base_fare: number; confirmed_riders: string; fare_per_person: number }>(
      `/fares/${rideId}`
    ),
};
