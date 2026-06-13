import { io, Socket } from "socket.io-client";
import { getToken } from "./auth";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000", {
      auth: { token: getToken() },
      transports: ["websocket"],
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket() {
  getSocket().connect();
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
