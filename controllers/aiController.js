// backend/controllers/aiController.js
const {
  uploadImageAndGetUrl,
  createSketchJob,
  pollOrderUntilActive,
} = require("../services/lightxService");
const fs = require("fs");

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const { imageData, description } = req.body;

    if (!imageData) {
      return res.status(400).json({ message: "imageData is required" });
    }

    const prompt = `
You are creating a product story for a child's custom toy.

Look at the uploaded drawing and generate:
1. A short cute toy name
2. A magical, child-friendly story in 4-6 sentences

Rules:
- Base the story on what you actually see in the image
- If a description is provided, use it only as extra context
- Keep it warm, imaginative, and suitable for a product page
- Return JSON only with keys: name, story
${description ? `Extra description: ${description}` : ""}
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: prompt,
            },
            {
              type: "input_image",
              image_url: imageData,
            },
          ],
        },
      ],
    });

    const text = response.output_text;

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        name: "Your Special Toy",
        story: text || "This toy is ready for a magical adventure.",
      };
    }

    return res.json({
      name: parsed.name || "Your Special Toy",
      story: parsed.story || "This toy is ready for a magical adventure.",
    });
  } catch (err) {
    console.error("Toy story error:", err);
    return res.status(500).json({ message: err.message || "Story generation failed" });
  }
};
