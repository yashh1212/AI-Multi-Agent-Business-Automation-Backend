import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { handleClientQuery } from "./orchestrator/ticketFlow.js";
import { startEmailAgent } from "./agents/support/emailAgent.js";
import { connectDB } from "./config/db.js";
import hrRoutes from "./routes/hrRoutes.js";
import atsRoutes from "./routes/atsRoutes.js";
import salesRoutes from "./routes/salesRoutes.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
startEmailAgent();
app.use("/hr", hrRoutes);
app.use("/ats", atsRoutes);
app.use("/sales", salesRoutes);

app.post("/api/client-query", async (req, res) => {
  try {
    const { message } = req.body;

    const result = await handleClientQuery(message);

    res.json({
      success: true,
      ticket: result.ticketId,
      classification: result.classification
    });

  } catch (err) {
    console.error(err.message);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Connect to MongoDB, then start the server
connectDB().then(() => {
  app.listen(process.env.PORT, () => {
    console.log(`Server running on ${process.env.PORT}`);
  });
});