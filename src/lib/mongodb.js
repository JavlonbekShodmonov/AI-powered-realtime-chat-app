// src/lib/mongodb.js
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const options = {};

if (!uri) {
  throw new Error("Please add MONGODB_URI to your .env.local file");
}

// Global is used in development to prevent multiple instances
let _client;
let _clientPromise;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClient) {
    global._mongoClient = new MongoClient(uri, options);
  }
  _client = global._mongoClient;

  if (!global._mongoClientPromise) {
    global._mongoClientPromise = _client.connect();
  }
  _clientPromise = global._mongoClientPromise;
} else {
  _client = new MongoClient(uri, options);
  _clientPromise = _client.connect();
}

export const client = _client;
export const clientPromise = _clientPromise;
