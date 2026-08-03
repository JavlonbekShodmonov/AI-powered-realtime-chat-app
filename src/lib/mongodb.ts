import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || process.env.MONGO_URL;
const options = {};

let client;
let clientPromise: Promise<MongoClient>;

if (!uri) {
  throw new Error("Please add your MongoDB URI to .env.local or set MONGO_URL");
}

if (process.env.NODE_ENV === "development") {
  // Reuse connection in dev
  if (!(global as any)._mongoClientPromise) {
    client = new MongoClient(uri, options);
    (global as any)._mongoClientPromise = client.connect();
  }
  clientPromise = (global as any)._mongoClientPromise;
} else {
  // New connection in production
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
