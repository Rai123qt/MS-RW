/**
 * Enhanced Ban Detection System
 *
 * CRITICAL: Microsoft's updated detection system (2026) uses multiple signals:
 * 1. "The order cannot be completed" error page
 * 2. Account suspension banners
 * 3. Unusual activity warnings
 * 4. CAPTCHA challenges
 * 5. Session termination responses
 * 6. Rate limiting headers
 *
 * This module provides comprehensive detection of all ban/warning signals
 */

import { AxiosError } from "axios";
import { Page, Response } from 'rebrowser-playwright';

export interface BanDetectionResult {
  detected: boolean;
  severity: "none" | "warning" | "soft-ban" | "hard-ban";
  reason: string;
  details?: string;
  recoverable: boolean;
}

/**
 * Text patterns that indicate account issues
 */
const BAN_PATTERNS = {
  // Hard ban indicators
  ORDER_BLOCKED:
    /the order cannot be completed|order can't be completed|unable to complete.*order/i,
  ACCOUNT_SUSPENDED:
    /account.*suspended|suspended.*account|your account has been suspended/i,
  ACCESS_DENIED: /access denied|you don't have permission|unauthorized access/i,
  UNUSUAL_ACTIVITY:
    /unusual activity detected|suspicious activity|we've detected unusual behavior/i,

  // Soft ban / warning indicators
  VERIFICATION_REQUIRED:
    /verify.*account|verification required|confirm.*identity|please verify/i,
  SECURITY_CHALLENGE:
    /security check|complete.*security|prove you're not a robot/i,
  RATE_LIMITED: /too many requests|slow down|try again later|request limit/i,
  CAPTCHA_REQUIRED: /captcha|recaptcha|verify you're human|prove you.*human/i,

  // Session issues
  SESSION_EXPIRED:
    /session expired|session invalid|please sign in again|login again/i,
  RETRY_LATER:
    /try again later|come back later|service unavailable.*try later/i,
} as const;

/**
 * URL patterns that indicate ban/warning pages
 */
const BAN_URL_PATTERNS = [
  /suspended/i,
  /blocked/i,
  /error.*unusual/i,
  /security.*verify/i,
  /account.*issue/i,
];

/**
 * HTTP status codes that may indicate bans
 */
const BAN_STATUS_CODES = [
  403, // Forbidden
  429, // Too Many Requests
  451, // Unavailable For Legal Reasons
];

/**
 * Detect ban/warning from page content
 *
 * @param page - Playwright page to check
 * @returns Ban detection result
 */
export async function detectBanFromPage(
  page: Page,
): Promise<BanDetectionResult> {
  try {
    // Check URL first
    const url = page.url();
    for (const pattern of BAN_URL_PATTERNS) {
      if (pattern.test(url)) {
        return {
          detected: true,
          severity: "soft-ban",
          reason: "Ban URL pattern detected",
          details: `URL matches ban pattern: ${url}`,
          recoverable: true,
        };
      }
    }

    // Get page content
    const content = await page.content().catch(() => "");
    const bodyText = await page
      .locator("body")
      .textContent({ timeout: 1000 })
      .catch(() => "");
    const combinedText = content + " " + bodyText;

    // Check for hard ban patterns
    if (BAN_PATTERNS.ORDER_BLOCKED.test(combinedText)) {
      return {
        detected: true,
        severity: "hard-ban",
        reason: "Order completion blocked",
        details:
          "Microsoft detected automated activity and blocked reward redemption",
        recoverable: false,
      };
    }

    if (BAN_PATTERNS.ACCOUNT_SUSPENDED.test(combinedText)) {
      return {
        detected: true,
        severity: "hard-ban",
        reason: "Account suspended",
        details: "Account has been suspended by Microsoft",
        recoverable: false,
      };
    }

    if (BAN_PATTERNS.ACCESS_DENIED.test(combinedText)) {
      return {
        detected: true,
        severity: "hard-ban",
        reason: "Access denied",
        details: "Microsoft denied access to rewards",
        recoverable: false,
      };
    }

    if (BAN_PATTERNS.UNUSUAL_ACTIVITY.test(combinedText)) {
      return {
        detected: true,
        severity: "soft-ban",
        reason: "Unusual activity detected",
        details: "Microsoft flagged unusual activity pattern",
        recoverable: true,
      };
    }

    // Check for soft ban patterns
    if (BAN_PATTERNS.VERIFICATION_REQUIRED.test(combinedText)) {
      return {
        detected: true,
        severity: "warning",
        reason: "Verification required",
        details: "Account verification requested",
        recoverable: true,
      };
    }

    if (BAN_PATTERNS.SECURITY_CHALLENGE.test(combinedText)) {
      return {
        detected: true,
        severity: "warning",
        reason: "Security challenge",
        details: "Security verification challenge presented",
        recoverable: true,
      };
    }

    if (BAN_PATTERNS.RATE_LIMITED.test(combinedText)) {
      return {
        detected: true,
        severity: "warning",
        reason: "Rate limited",
        details: "Too many requests detected",
        recoverable: true,
      };
    }

    if (BAN_PATTERNS.CAPTCHA_REQUIRED.test(combinedText)) {
      return {
        detected: true,
        severity: "warning",
        reason: "CAPTCHA required",
        details: "CAPTCHA challenge presented",
        recoverable: true,
      };
    }

    // Check for session issues
    if (BAN_PATTERNS.SESSION_EXPIRED.test(combinedText)) {
      return {
        detected: true,
        severity: "warning",
        reason: "Session expired",
        details: "Session expired, re-login needed",
        recoverable: true,
      };
    }

    // No ban detected
    return {
      detected: false,
      severity: "none",
      reason: "",
      recoverable: true,
    };
  } catch (error) {
    // Error checking page - treat as potential issue
    return {
      detected: true,
      severity: "warning",
      reason: "Page check failed",
      details: error instanceof Error ? error.message : String(error),
      recoverable: true,
    };
  }
}

/**
 * Detect ban from HTTP response
 *
 * @param response - Playwright response object
 * @returns Ban detection result
 */
export async function detectBanFromResponse(
  response: Response,
): Promise<BanDetectionResult> {
  const status = response.status();

  // Check status code
  if (BAN_STATUS_CODES.includes(status)) {
    const severity = status === 403 ? "hard-ban" : "warning";
    return {
      detected: true,
      severity,
      reason: `HTTP ${status} response`,
      details: `Received ${status} status code from ${response.url()}`,
      recoverable: status !== 403,
    };
  }

  // Check response headers for rate limiting
  const headers = response.headers();
  if (headers["retry-after"] || headers["x-rate-limit-remaining"] === "0") {
    return {
      detected: true,
      severity: "warning",
      reason: "Rate limit header detected",
      details: headers["retry-after"]
        ? `Retry after ${headers["retry-after"]}s`
        : "Rate limit exhausted",
      recoverable: true,
    };
  }

  return {
    detected: false,
    severity: "none",
    reason: "",
    recoverable: true,
  };
}

/**
 * Detect ban from Axios error
 *
 * @param error - Axios error object
 * @returns Ban detection result
 */
export function detectBanFromError(error: AxiosError): BanDetectionResult {
  // Check response status
  if (error.response) {
    const status = error.response.status;

    if (BAN_STATUS_CODES.includes(status)) {
      const severity = status === 403 ? "hard-ban" : "warning";
      return {
        detected: true,
        severity,
        reason: `HTTP ${status} error`,
        details: `API request failed with ${status}`,
        recoverable: status !== 403,
      };
    }

    // Check response data for ban messages
    const responseData = JSON.stringify(error.response.data || {});
    for (const [key, pattern] of Object.entries(BAN_PATTERNS)) {
      if (pattern.test(responseData)) {
        return {
          detected: true,
          severity:
            key.includes("ACCOUNT") || key.includes("ACCESS")
              ? "hard-ban"
              : "warning",
          reason: `Ban pattern in API response: ${key}`,
          details: responseData.slice(0, 200),
          recoverable: !key.includes("ACCOUNT"),
        };
      }
    }
  }

  // Check error message
  const errorMsg = error.message || "";
  if (BAN_PATTERNS.RATE_LIMITED.test(errorMsg)) {
    return {
      detected: true,
      severity: "warning",
      reason: "Rate limit in error message",
      details: errorMsg,
      recoverable: true,
    };
  }

  return {
    detected: false,
    severity: "none",
    reason: "",
    recoverable: true,
  };
}

/**
 * Comprehensive ban detection check
 * Runs multiple checks and returns worst-case result
 *
 * @param page - Playwright page to check
 * @returns Most severe ban detection result found
 */
export async function comprehensiveBanCheck(
  page: Page,
): Promise<BanDetectionResult> {
  const results: BanDetectionResult[] = [];

  // Page content check
  results.push(await detectBanFromPage(page));

  // If we found a hard ban, return immediately
  const hardBan = results.find((r) => r.severity === "hard-ban");
  if (hardBan) {
    return hardBan;
  }

  // Return worst severity found
  const severityOrder = { none: 0, warning: 1, "soft-ban": 2, "hard-ban": 3 };
  results.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

  return (
    results[0] || {
      detected: false,
      severity: "none",
      reason: "",
      recoverable: true,
    }
  );
}

/**
 * Legacy compatibility function
 * @deprecated Use comprehensiveBanCheck instead
 */
export function detectBanReason(error: unknown): {
  status: boolean;
  reason: string;
} {
  if (error instanceof Error) {
    const msg = error.message;
    for (const [key, pattern] of Object.entries(BAN_PATTERNS)) {
      if (pattern.test(msg)) {
        return { status: true, reason: `Detected: ${key}` };
      }
    }
  }

  return { status: false, reason: "" };
}
