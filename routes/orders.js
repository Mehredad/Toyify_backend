const express = require("express");
const router = express.Router();
const ordersController = require("../controllers/ordersController");
const authMiddleware = require("../middleware/auth");

// Create order – only for logged-in users
router.post("/", authMiddleware, ordersController.createOrder);

module.exports = router;
