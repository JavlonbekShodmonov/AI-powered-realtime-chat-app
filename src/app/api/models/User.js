import mongoose, { Schema } from "mongoose";

const UserSchema = new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  provider: { type: String }, // "google" or "github"
  providerId: { type: String }, // ID from OAuth provider
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
