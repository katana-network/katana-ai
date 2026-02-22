// Shared assertion helpers for Katana MCP eval suite
//
// MCP tool output arrives as a JSON string (promptfoo extracts content[0].text).
// Parse with JSON.parse(output) to get the tool's response object.

function parse(output) {
  try {
    // MCP provider returns the content array as a JSON string:
    // [{"type":"text","text":"{...actual tool output...}"}]
    // We need to unwrap it to get the inner tool response.
    const outer = JSON.parse(output);
    if (Array.isArray(outer) && outer[0] && outer[0].text) {
      return JSON.parse(outer[0].text);
    }
    return outer;
  } catch {
    return null;
  }
}

/**
 * Validate an unsigned transaction has required fields.
 * Handles both flat shape ({ to, data, value, chainId }) and
 * nested shape ({ transaction: { to, data, value }, ... }).
 */
function isValidTx(output) {
  const obj = parse(output);
  if (!obj) return { pass: false, score: 0, reason: "Output is not valid JSON" };

  const tx = obj.transaction || obj;
  const missing = [];

  if (typeof tx.to !== "string" || !tx.to.startsWith("0x")) missing.push("to");
  if (typeof tx.data !== "string" || !tx.data.startsWith("0x")) missing.push("data");
  if (tx.value === undefined) missing.push("value");
  if (!tx.chainId && !obj.chainId) missing.push("chainId");

  if (missing.length > 0) {
    return { pass: false, score: 0, reason: `Missing tx fields: ${missing.join(", ")}` };
  }
  return { pass: true, score: 1, reason: "Valid unsigned transaction" };
}

/**
 * Validate the tx targets a specific contract address (case-insensitive).
 */
function txTargetsAddress(output, expectedAddress) {
  const obj = parse(output);
  if (!obj) return { pass: false, score: 0, reason: "Not valid JSON" };

  const tx = obj.transaction || obj;
  const pass = tx.to && tx.to.toLowerCase() === expectedAddress.toLowerCase();
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? `Targets ${expectedAddress}`
      : `Expected to=${expectedAddress}, got to=${tx.to}`,
  };
}

/**
 * Check output JSON contains a specific field (supports dot-notation).
 */
function hasField(output, field) {
  const obj = parse(output);
  if (!obj) return { pass: false, score: 0, reason: "Not valid JSON" };

  const keys = field.split(".");
  let current = obj;
  for (const k of keys) {
    if (current == null || typeof current !== "object") {
      return { pass: false, score: 0, reason: `Missing field: ${field}` };
    }
    current = current[k];
  }
  const pass = current !== undefined;
  return { pass, score: pass ? 1 : 0, reason: pass ? `Has field: ${field}` : `Missing field: ${field}` };
}

/**
 * Check output contains no error field.
 */
function noError(output) {
  const obj = parse(output);
  if (!obj) return { pass: false, score: 0, reason: "Not valid JSON" };
  const pass = !obj.error;
  return { pass, score: pass ? 1 : 0, reason: pass ? "No error" : `Error: ${obj.error}` };
}

module.exports = { parse, isValidTx, txTargetsAddress, hasField, noError };
