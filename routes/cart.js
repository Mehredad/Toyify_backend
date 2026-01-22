// backend/routes/cart.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const {
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  removeFromCartById
} = require("../controllers/cartController");

router.get("/", authMiddleware, getCart);
router.post("/add", authMiddleware, addToCart);
router.post("/remove", authMiddleware, removeFromCart);
router.post("/clear", authMiddleware, clearCart);
router.delete("/:id", authMiddleware, removeFromCartById);


module.exports = router;
