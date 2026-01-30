/**
 * Ban Monitoring Middleware
 *
 * CRITICAL: Proactive ban detection during bot operation
 * This module monitors page navigation and responses for ban signals
 *
 * NEW 2026: Enhanced to detect Microsoft's updated ban mechanisms:
 * - "The order cannot be completed" error pages
 * - Progressive rate limiting
 * - Session invalidation
 */

import { Page } from "patchright";
import { log } from "../notifications/Logger";
import {
  BanDetectionResult,
  comprehensiveBanCheck,
  detectBanFromResponse,
} from "./EnhancedBanDetector";

/**
 * Ban monitoring state per session
 */
interface BanMonitoringState {
  warningCount: number;
  lastWarningTime: number;
  banDetected: boolean;
  lastBanCheck: number;
}

const monitoringState = new Map<string, BanMonitoringState>();

/**
 * Get or create monitoring state for an email
 */
function getMonitoringState(email: string): BanMonitoringState {
  if (!monitoringState.has(email)) {
    monitoringState.set(email, {
      warningCount: 0,
      lastWarningTime: 0,
      banDetected: false,
      lastBanCheck: 0,
    });
  }
  return monitoringState.get(email)!;
}

/**
 * Setup ban monitoring for a page
 * Monitors all navigation and response events
 *
 * @param page - Playwright page to monitor
 * @param email - Account email for tracking
 * @param onBanDetected - Callback when ban is detected
 */
export async function setupBanMonitoring(
  page: Page,
  email: string,
  onBanDetected?: (result: BanDetectionResult) => Promise<void>,
): Promise<void> {
  const state = getMonitoringState(email);

  // Monitor all responses for ban indicators
  page.on("response", async (response) => {
    // Only check HTML pages (not images, scripts, etc.)
    const contentType = response.headers()["content-type"] || "";
    if (!contentType.includes("text/html")) return;

    // Check for ban in response
    const result = await detectBanFromResponse(response);

    if (result.detected) {
      await handleBanDetection(email, result, onBanDetected);
    }
  });

  // Monitor page load events for ban pages
  page.on("load", async () => {
    // Throttle checks (max once per 5 seconds)
    const now = Date.now();
    if (now - state.lastBanCheck < 5000) return;
    state.lastBanCheck = now;

    // Comprehensive ban check
    const result = await comprehensiveBanCheck(page);

    if (result.detected) {
      await handleBanDetection(email, result, onBanDetected);
    }
  });

  // Monitor console for suspicious messages
  page.on("console", async (msg) => {
    const text = msg.text().toLowerCase();

    // Check for ban-related console messages
    if (
      text.includes("suspended") ||
      text.includes("blocked") ||
      text.includes("unusual activity") ||
      text.includes("access denied")
    ) {
      log(false, "BAN-MONITOR", `Suspicious console message: ${text}`, "warn");

      // Trigger comprehensive check
      const result = await comprehensiveBanCheck(page);
      if (result.detected) {
        await handleBanDetection(email, result, onBanDetected);
      }
    }
  });
}

/**
 * Handle ban detection event
 */
async function handleBanDetection(
  email: string,
  result: BanDetectionResult,
  onBanDetected?: (result: BanDetectionResult) => Promise<void>,
): Promise<void> {
  const state = getMonitoringState(email);

  // Log based on severity
  const logLevel =
    result.severity === "hard-ban"
      ? "error"
      : result.severity === "soft-ban"
        ? "warn"
        : "log";

  log(
    false,
    "BAN-MONITOR",
    `[${email}] ${result.severity.toUpperCase()}: ${result.reason}`,
    logLevel,
  );
  if (result.details) {
    log(false, "BAN-MONITOR", `Details: ${result.details}`, logLevel);
  }

  // Update state
  if (result.severity === "hard-ban") {
    state.banDetected = true;
  } else if (result.severity === "warning" || result.severity === "soft-ban") {
    state.warningCount++;
    state.lastWarningTime = Date.now();

    // If too many warnings, treat as soft ban
    if (state.warningCount >= 3) {
      log(
        false,
        "BAN-MONITOR",
        `[${email}] Multiple warnings detected (${state.warningCount}), escalating to soft-ban`,
        "warn",
      );
      result.severity = "soft-ban";
    }
  }

  // Call callback if provided
  if (onBanDetected) {
    await onBanDetected(result);
  }
}

/**
 * Check if an account is currently banned
 *
 * @param email - Account email
 * @returns true if hard ban detected
 */
export function isAccountBanned(email: string): boolean {
  return getMonitoringState(email).banDetected;
}

/**
 * Reset monitoring state for an account
 * Call this when starting a new session
 *
 * @param email - Account email
 */
export function resetMonitoringState(email: string): void {
  monitoringState.delete(email);
}

/**
 * Get warning count for an account
 *
 * @param email - Account email
 * @returns Number of warnings in current session
 */
export function getWarningCount(email: string): number {
  return getMonitoringState(email).warningCount;
}

/**
 * Periodic ban check (call this every few minutes)
 *
 * @param page - Page to check
 * @param email - Account email
 * @returns Ban detection result
 */
export async function periodicBanCheck(
  page: Page,
  email: string,
): Promise<BanDetectionResult> {
  const result = await comprehensiveBanCheck(page);

  if (result.detected) {
    log(
      false,
      "BAN-MONITOR",
      `[${email}] Periodic check detected: ${result.severity} - ${result.reason}`,
      "warn",
    );
  }

  return result;
}
