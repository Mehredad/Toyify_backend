const Order = require("../models/Order");
const Profile = require("../models/Profile");
const nodemailer = require("nodemailer");
const Cart = require("../models/Cart");


const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST, // smtp.ionos.co.uk
  port: process.env.EMAIL_PORT, // 465
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.createOrder = async (req, res) => {
  try {
    const { customerEmail } = req.body;

    const userId = req.user._id;

    if (!customerEmail) {
      return res.status(400).json({ message: "Customer email is required" });
    }

    // 1️⃣ Get user + cart
    const user = await Profile.findById(userId);
    const cart = await Cart.findOne({ user: userId });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const createdOrders = [];

    // 2️⃣ Create orders + send emails PER ITEM
    for (const item of cart.items) {
      const {
        fileName,
        imageVersion,
        size,
        quantity,
        description,
        price,
      } = item;

      const order = await Order.create({
        user: userId,
        fileName,
        imageVersion,
        size,
        quantity,
        description,
        price,
        // customerEmail,
      });

      createdOrders.push(order);

      // -------------------------
      // 1️⃣ EMAIL TO LOGGED-IN USER
      // -------------------------
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Order Confirmation - BuzzyMuzzy",
        html: `
          <h2>Thank you for your order, ${user.username || user.email}!</h2>
          <p>Your order has been received and is being processed.</p>
          <hr/>
          <p><strong>File:</strong> ${fileName}</p>
          <p><strong>Version:</strong> ${imageVersion}</p>
          <p><strong>Size:</strong> ${size} cm</p>
          <p><strong>Quantity:</strong> ${quantity}</p>
          <p><strong>Price:</strong> $${price}</p>
        `,
      });

      // -------------------------------------
      // 2️⃣ EMAIL TO CUSTOMER EMAIL (the form)
      // -------------------------------------
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: customerEmail,
        subject: "Your BuzzyMuzzy Order Details",
        html: `
          <h2>Your BuzzyMuzzy Order</h2>
          <p>Thank you for placing an order!</p>
          <hr/>
          <p><strong>File:</strong> ${fileName}</p>
          <p><strong>Version:</strong> ${imageVersion}</p>
          <p><strong>Size:</strong> ${size} cm</p>
          <p><strong>Quantity:</strong> ${quantity}</p>
          <p><strong>Price:</strong> $${price}</p>
          <p>If you did not place this order, please contact support.</p>
        `,
      });

      // -------------------------
      // 3️⃣ EMAIL TO ADMIN
      // -------------------------
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.ADMIN_EMAIL,
        subject: `New Order Received - ${user.username || user.email}`,
        html: `
          <h2>New Order Notification</h2>
          <p><strong>Logged-in User:</strong> ${user.username || user.email}</p>
          <p><strong>Customer Email (form):</strong> ${customerEmail}</p>
          <hr/>
          <p><strong>File:</strong> ${fileName}</p>
          <p><strong>Version:</strong> ${imageVersion}</p>
          <p><strong>Size:</strong> ${size} cm</p>
          <p><strong>Quantity:</strong> ${quantity}</p>
          <p><strong>Price:</strong> $${price}</p>
        `,
      });
    }

    // 3️⃣ Clear cart AFTER everything succeeds
    cart.items = [];
    await cart.save();

    res.status(201).json({
      message: "Order created successfully",
      orders: createdOrders,
    });
  } catch (error) {
    console.error("Order error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

