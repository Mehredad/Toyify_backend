// backend/controllers/aiController.js
const {
  uploadImageAndGetUrl,
  createSketchJob,
  pollOrderUntilActive,
} = require("../services/lightxService");
const fs = require("fs");

exports.generateToyPreview = async (req, res) => {
  console.log("=== Toy-preview endpoint called ===");
  console.log("Request method:", req.method);
  console.log("Request headers:", req.headers);
  console.log("Request body keys:", Object.keys(req.body));
  console.log(
    "Request body preview (first 100 chars):",
    (req.body.imageData || "").slice(0, 100)
  );
  try {
    const { imageData, prompt, strength, styleStrength } = req.body;
    if (!imageData) {
      return res
        .status(400)
        .json({ success: false, message: "No imageData provided" });
    }

    console.log("Toy-preview request. imageData size:", imageData.length);

    // 1) Upload image to LightX and get imageUrl
    const imageUrl = await uploadImageAndGetUrl(imageData);
    console.log("Uploaded to LightX imageUrl:", imageUrl);

    // 2) Build prompt
    const finalPrompt =
      prompt ||
      "Turn this  sketch into a  3D-like toy render, preserve lines and shape";

    // 3) Start sketch2image job
    const jobMeta = await createSketchJob({
      imageUrl,
      textPrompt: finalPrompt,
      strength: strength ?? 0.85,
      styleStrength: styleStrength ?? 0.5,
    });
    console.log("LightX job meta:", jobMeta);

    const orderId = jobMeta.orderId;
    const maxRetriesAllowed =
      jobMeta.maxRetriesAllowed ||
      parseInt(process.env.LIGHTX_POLL_MAX_RETRIES || "10", 10);

    // 4) Poll until result ready
    const pollResult = await pollOrderUntilActive(
      orderId,
      maxRetriesAllowed,
      parseInt(process.env.LIGHTX_POLL_INTERVAL_MS || "3000", 10)
    );
    console.log("LightX poll result:", pollResult);

    // pollResult.output is the final image URL (string)
    const outputUrl = pollResult.output;

    // You can optionally fetch the image and convert to base64 if your frontend prefers base64.
    // Frontend accepts URL too — returning URL is smaller and faster.
    // If you need base64 uncomment below block.

    // const imageResp = await axios.get(outputUrl, { responseType: "arraybuffer" });
    // const base64Output = "data:image/jpeg;base64," + Buffer.from(imageResp.data, "binary").toString("base64");

    // For now, return URL + simple caption
    const generatedCaption = finalPrompt; // quick caption fallback

    res.json({
      success: true,
      previewImage: outputUrl,
      generatedCaption,
      orderId,
    });
  } catch (err) {
    console.error(
      "Toy preview error:",
      err.response?.data || err.message || err
    );
    res
      .status(500)
      .json({
        success: false,
        message: err.message || err.response?.data || err,
      });
  }
};

exports.generateToyStory = async (req, res) => {
  try {
    const { description } = req.body;
    const storyText = `Once upon a time, there was a toy called ${
      description || "Polu"
    } that went on amazing adventures!`;
    const toyName = description || "Polu";

    res.json({ story: storyText, name: toyName });
  } catch (err) {
    console.error("Toy story error:", err);
    res.status(500).json({ message: err.message || err });
  }
};
