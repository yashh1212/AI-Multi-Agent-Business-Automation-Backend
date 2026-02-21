import express from "express";
import dotenv from "dotenv";

import { handleClientQuery } from "./orchestrator/ticketFlow.js";
import { startEmailAgent } from "./agents/emailAgent.js";


dotenv.config();

const app = express();
app.use(express.json());
startEmailAgent();

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

app.listen(process.env.PORT, () => {
  console.log(`Server running on ${process.env.PORT}`);
});