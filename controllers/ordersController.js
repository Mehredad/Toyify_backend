const Order = require("../models/Order");
const Profile = require("../models/Profile");
const Cart = require("../models/Cart");
const nodemailer = require("nodemailer");

// ---- SMTP transporter (safe config) ----
const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 465);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

const transporter = nodemailer.createTransport({
  host: EMAIL_HOST,
  port: EMAIL_PORT,
  secure: EMAIL_PORT === 465, // 465=true (SSL), 587=false (STARTTLS)
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  connectionTimeout: 20_000,
  greetingTimeout: 20_000,
  socketTimeout: 20_000,
});

// Verify SMTP at startup (you'll see this in Render logs)
transporter.verify((err) => {
  if (err) console.error("SMTP verify failed:", err);
  else console.log("SMTP transporter is ready");
});

function escapeHtml(str = "") {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildItemsHtml(items = []) {
  return `
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr>
          <th align="left">File</th>
          <th align="left">Version</th>
          <th align="left">Size</th>
          <th align="left">Qty</th>
          <th align="left">Price</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map((item) => {
            const fileName = escapeHtml(item.fileName);
            const imageVersion = escapeHtml(item.imageVersion);
            const size = escapeHtml(item.size);
            const quantity = escapeHtml(item.quantity);
            const price = escapeHtml(item.price);
            return `
              <tr>
                <td>${fileName}</td>
                <td>${imageVersion}</td>
                <td>${size} cm</td>
                <td>${quantity}</td>
                <td>£${price}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

exports.createOrder = async (req, res) => {
  try {
    // Auth check (prevents req.user crash)
    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { customerEmail } = req.body;
    const userId = req.user._id;

    if (!customerEmail) {
      return res.status(400).json({ message: "Customer email is required" });
    }

    // Env sanity (helps catch prod misconfig fast)
    const missing = [];
    if (!EMAIL_HOST) missing.push("EMAIL_HOST");
    if (!process.env.EMAIL_PORT) missing.push("EMAIL_PORT");
    if (!EMAIL_USER) missing.push("EMAIL_USER");
    if (!EMAIL_PASS) missing.push("EMAIL_PASS");
    if (!ADMIN_EMAIL) missing.push("ADMIN_EMAIL");

    if (missing.length) {
      console.error("Missing email env vars:", missing);
      return res.status(500).json({ message: "Email config missing", missing });
    }

    // Load user profile + cart
    const user = await Profile.findById(userId);
    const cart = await Cart.findOne({ user: userId });

    if (!user) return res.status(404).json({ message: "User profile not found" });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Create orders for all items
    const createdOrders = [];
    for (const item of cart.items) {
      const order = await Order.create({
        user: userId,
        fileName: item.fileName,
        imageVersion: item.imageVersion,
        size: item.size,
        quantity: item.quantity,
        description: item.description || "",
        price: item.price ?? 0,
        // customerEmail, // optional: save if you want
      });
      createdOrders.push(order);
    }

    // Build one email summary
    const username = user.username || user.email;
    const itemsHtml = buildItemsHtml(cart.items);

    // Send 1 email to logged-in user
    await transporter.sendMail({
      from: EMAIL_USER,
      to: user.email,
      subject: "Order Confirmation - BuzzyMuzzy",
      html: `
        <h2>Thank you for your order, ${escapeHtml(username)}!</h2>
        <p>Your order has been received and is being processed.</p>
        <hr/>
        ${itemsHtml}
      `,
    });

    // Send 1 email to customer email (form)
    await transporter.sendMail({
      from: EMAIL_USER,
      to: customerEmail,
      subject: "Your BuzzyMuzzy Order Details",
      html: `
        <h2>Your BuzzyMuzzy Order</h2>
        <p>Thank you for placing an order!</p>
        <hr/>
        ${itemsHtml}
        <p>If you did not place this order, please contact support.</p>
      `,
    });

    // Send 1 email to admin
    await transporter.sendMail({
      from: EMAIL_USER,
      to: ADMIN_EMAIL,
      subject: `New Order Received - ${escapeHtml(username)}`,
      html: `
        <h2>New Order Notification</h2>
        <p><strong>Logged-in User:</strong> ${escapeHtml(username)}</p>
        <p><strong>Customer Email (form):</strong> ${escapeHtml(customerEmail)}</p>
        <hr/>
        ${itemsHtml}
      `,
    });

    // Clear cart after success
    cart.items = [];
    await cart.save();

    return res.status(201).json({
      message: "Order created successfully",
      orders: createdOrders,
    });
  } catch (error) {
    // Render logs will show these
    console.error("Order error full:", error);
    console.error("Order error message:", error?.message);
    console.error("Order error code:", error?.code);

    // TEMP debug response — once fixed, remove details/code
    return res.status(500).json({
      message: "Server error",
      details: error?.message,
      code: error?.code,
    });
  }
};