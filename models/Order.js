const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fileName: { type: String, required: true },
    imageVersion: { type: String, enum: ["generated", "original"], required: true },
    size: { type: Number, required: true },
    quantity: { type: Number, required: true },
    description: { type: String },
    price: { type: Number, required: true, default: 39 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);
