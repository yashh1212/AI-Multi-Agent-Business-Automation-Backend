import { processSalesAutomationTick } from "../../orchestrator/salesFlow.js";

let automationInterval = null;

export function startSalesAutomationAgent() {
  if (automationInterval) {
    return automationInterval;
  }

  const intervalMs = parseInt(process.env.SALES_AUTOMATION_INTERVAL_MS || `${60 * 60 * 1000}`, 10);

  const runCycle = async () => {
    try {
      const summary = await processSalesAutomationTick();
      console.log(
        `Sales automation tick complete: scanned=${summary.scanned}, outreach=${summary.initialOutreachSent}, followups=${summary.followUpsSent}, lost=${summary.markedLost}`,
      );
    } catch (error) {
      console.error("Sales automation tick failed:", error.message);
    }
  };

  setTimeout(runCycle, 15000);
  automationInterval = setInterval(runCycle, intervalMs);
  console.log(`Sales automation agent started. Interval: ${intervalMs}ms`);
  return automationInterval;
}
