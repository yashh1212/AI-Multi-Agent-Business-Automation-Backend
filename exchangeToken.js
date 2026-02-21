import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "http://localhost:5000/auth/callback"
);

const code = "4/0AfrIepDIQoef1qnn8uuRxt8XWdbEwubtbMenRpcIE2yPi9K6ZIyyCL8m8mVA5cvIihZ8xg"; // ← paste here

const { tokens } = await oauth2Client.getToken(code);
console.log("✅ Refresh Token:", tokens.refresh_token);