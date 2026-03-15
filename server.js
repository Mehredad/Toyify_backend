require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

// Import routes
const authRoutes = require("./routes/auth");
const aiRoutes = require("./routes/ai");
const ordersRoutes = require("./routes/orders");
const cartRoutes = require("./routes/cart");
const contactRoutes = require("./routes/contactRoutes");
const addressRoutes = require('./routes/addressRoutes');



const app = express();

// Connect to MongoDB
connectDB();

// ------------------------------
// Middleware
// ------------------------------

// COOP header to allow Google OAuth popups to communicate
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  next();
});

// CORS middleware
app.use(cors());

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// ------------------------------
// Routes
// ------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/contact", contactRoutes);
app.use('/api', addressRoutes);



// Health check route
app.get("/", (req, res) => {
  res.send("Buzzy backend is running!");
});

// ------------------------------
// Start server
// ------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
