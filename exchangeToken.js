import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const oauth2Client = new google.auth.OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  "http://localhost:5000/auth/callback"
);

const code = "4/0AfrIepCX2qmvWu7UToq0wdD9r1dRTrxYUFJnfEdU9Zw9vFBG-MpF7G8szOqbzDOHdPe-0A"; // ← paste here

const { tokens } = await oauth2Client.getToken(code);
console.log("✅ Refresh Token:", tokens.refresh_token);
console.log("✅ Scopes:", tokens.scope); 