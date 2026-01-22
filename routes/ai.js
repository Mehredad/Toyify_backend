// backend/routes/ai.js
const express = require("express");
const router = express.Router();
const aiController = require("../controllers/aiController");

router.post("/toy-preview", aiController.generateToyPreview);
router.post("/toy-story", aiController.generateToyStory);

module.exports = router;
