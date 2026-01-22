// backend/services/lightxService.js
const axios = require("axios");

/**
 * LightX client helper
 * - uploadImageAndGetUrl: gets signed upload URL, PUTs the binary, returns public imageUrl
 * - createSketchJob: calls sketch2image, returns orderId and meta
 * - pollOrderStatus: polls until active/failed and returns output URL
 */

const LIGHTX_BASE = "https://api.lightxeditor.com/external/api/v2";
const API_KEY = process.env.LIGHTX_API_KEY;
const UPLOAD_TIMEOUT = parseInt(process.env.LIGHTX_UPLOAD_TIMEOUT_MS || "30000", 10);
const POLL_INTERVAL = parseInt(process.env.LIGHTX_POLL_INTERVAL_MS || "3000", 10);
const POLL_MAX = parseInt(process.env.LIGHTX_POLL_MAX_RETRIES || "10", 10);

if (!API_KEY) {
  console.warn("LIGHTX_API_KEY not found in env - LightX service will fail until set.");
}

async function requestUploadUrl(sizeBytes, contentType = "image/jpeg") {
  const url = `${LIGHTX_BASE}/uploadImageUrl`;
  const body = {
    uploadType: "imageUrl",
    size: sizeBytes,
    contentType,
  };

  const resp = await axios.post(url, body, {
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    timeout: 15000,
  });

  if (resp.data?.body) return resp.data.body;
  throw new Error("Unexpected uploadImageUrl response: " + JSON.stringify(resp.data));
}

async function putBinaryToSignedUrl(signedUrl, buffer, contentType = "image/jpeg") {
  // send PUT to signedUrl with raw bytes
  const resp = await axios.put(signedUrl, buffer, {
    headers: { "Content-Type": contentType, "Content-Length": buffer.length },
    timeout: UPLOAD_TIMEOUT,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  if (resp.status >= 200 && resp.status < 300) return true;
  throw new Error("Upload failed with status " + resp.status);
}

/**
 * Upload a base64 data-url or base64 string, return imageUrl string.
 * Accepts dataUrl like "data:image/png;base64,..." OR raw base64.
 */
async function uploadImageAndGetUrl(imageData, contentType = null) {
  // parse data URL
  let base64 = imageData;
  if (base64.startsWith("data:")) {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) throw new Error("Invalid data URL");
    contentType = contentType || match[1];
    base64 = match[2];
  }
  const buffer = Buffer.from(base64, "base64");
  const sizeBytes = buffer.length;
  contentType = contentType || "image/jpeg";

  // Step 1: get upload URL
  const uploadMeta = await requestUploadUrl(sizeBytes, contentType);
  const { uploadImage: signedUrl, imageUrl } = uploadMeta;
  if (!signedUrl || !imageUrl) throw new Error("Invalid upload meta from LightX");

  // Step 2: PUT the binary to the signed URL
  await putBinaryToSignedUrl(signedUrl, buffer, contentType);

  // imageUrl is now usable for processing
  return imageUrl;
}

/**
 * Start a sketch->image job and return { orderId, maxRetriesAllowed, avgResponseTimeInSec, status }
 * Pass textPrompt string, optional strength/styleStrength and optional styleImageUrl
 */
async function createSketchJob({ imageUrl, textPrompt = "", strength = 0.8, styleStrength = 0.5, styleImageUrl = null }) {
  const url = `${LIGHTX_BASE}/sketch2image/`;
  const body = {
    imageUrl,
    textPrompt,
    strength,
    styleStrength,
  };
  if (styleImageUrl) body.styleImageUrl = styleImageUrl;

  const resp = await axios.post(url, body, {
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    timeout: 15000,
  });

  if (resp.data?.body) return resp.data.body;
  throw new Error("Invalid sketch2image response: " + JSON.stringify(resp.data));
}

/**
 * Poll order status until status == 'active' or 'failed'
 * returns { status, output } when active or throws on failed or timeout
 */
async function pollOrderUntilActive(orderId, maxRetries = POLL_MAX, intervalMs = POLL_INTERVAL) {
  const url = `${LIGHTX_BASE}/order-status`;
  let tries = 0;

  while (tries < maxRetries) {
    tries++;
    try {
      const resp = await axios.post(
        url,
        { orderId },
        { headers: { "Content-Type": "application/json", "x-api-key": API_KEY }, timeout: 15000 }
      );

      const body = resp.data?.body;
      if (!body) throw new Error("Unexpected order-status response: " + JSON.stringify(resp.data));
      const status = body.status;
      // console.debug("LightX order status", orderId, status, body);
      if (status === "active") {
        // output expected to be a string URL (or array)
        return { status: "active", output: body.output };
      }
      if (status === "failed") {
        throw new Error("LightX job failed: " + JSON.stringify(body));
      }
      // else status "init" -> wait and retry
      await new Promise((r) => setTimeout(r, intervalMs));
    } catch (err) {
      // If last try, rethrow
      if (tries >= maxRetries) {
        throw new Error("Polling LightX order failed: " + (err.message || err));
      }
      // otherwise wait and retry
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error("Exceeded max LightX polling attempts");
}

module.exports = {
  uploadImageAndGetUrl,
  createSketchJob,
  pollOrderUntilActive,
};
