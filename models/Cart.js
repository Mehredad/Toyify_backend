// backend/models/Cart.js
const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Profile",
      required: true,
      unique: true,
    },
    items: [
      {
        fileName: { type: String, required: true },
        imageVersion: {
          type: String,
          enum: ["generated", "original"],
          required: true,
        },
        size: { type: Number, required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", cartSchema);
