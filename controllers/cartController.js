// backend/controllers/cartController.js
const Cart = require("../models/Cart");

const getCart = async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id });
  res.json(cart || { items: [] });
};

const addToCart = async (req, res) => {
  const { item } = req.body;

  let cart = await Cart.findOne({ user: req.user.id });

  if (!cart) {
    cart = new Cart({ user: req.user.id, items: [item] });
  } else {
    cart.items.push(item);
  }

  await cart.save();
  res.json(cart);
};

const removeFromCart = async (req, res) => {
  const { index } = req.body;

  const cart = await Cart.findOne({ user: req.user.id });
  cart.items.splice(index, 1);

  await cart.save();
  res.json(cart);
};

const clearCart = async (req, res) => {
  await Cart.findOneAndUpdate({ user: req.user.id }, { items: [] });
  res.json({ success: true });
};

const removeFromCartById = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    const itemId = req.params.id;

    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter((item) => item._id.toString() !== itemId);
    await cart.save();

    res.json({ message: "Item removed", items: cart.items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to remove item" });
  }
};

// Export all functions together
module.exports = {
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  removeFromCartById,
};
