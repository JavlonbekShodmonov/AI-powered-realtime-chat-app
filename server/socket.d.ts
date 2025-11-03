import { Server } from "socket.io";
import express from "express";
import http from "http";

export const io: Server;
export const server: http.Server;
export const app: express.Express;
export const userSocketMap: Record<string, string>;
export const isUserOnline: (userId: string) => boolean;
