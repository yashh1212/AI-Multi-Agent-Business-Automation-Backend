import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "http://localhost:5000/auth/callback"
);

const code = "4/0Aci98E9NCbcLM9vryjpt3dAW2VKJ-wHpwbbHb_nF_BPnhQ-U6Ja1uWl2RCRwe0mBUbv3LA"; // ← paste here

const { tokens } = await oauth2Client.getToken(code);
console.log("✅ Refresh Token:", tokens.refresh_token);
console.log("✅ Scopes:", tokens.scope); 