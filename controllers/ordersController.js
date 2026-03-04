const Order = require("../models/Order");
const Profile = require("../models/Profile");
const Cart = require("../models/Cart");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const EMAIL_FROM = process.env.EMAIL_FROM; // set to: onboarding@resend.dev (for now)

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

// ✅ IMPORTANT: make Resend failures throw + log id
async function sendEmail({ to, subject, html }) {
  const result = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  // Resend SDK returns { data, error }
  if (result?.error) {
    console.error("❌ Resend send error:", result.error);
    throw new Error(result.error.message || "Resend send failed");
  }

  console.log("✅ Resend sent:", { to, id: result?.data?.id });
  return result;
}

exports.createOrder = async (req, res) => {
  try {
    // Auth check
    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { customerEmail } = req.body;
    const userId = req.user._id;

    if (!customerEmail) {
      return res.status(400).json({ message: "Customer email is required" });
    }

    // Env sanity
    const missing = [];
    if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
    if (!EMAIL_FROM) missing.push("EMAIL_FROM");
    if (!ADMIN_EMAIL) missing.push("ADMIN_EMAIL");

    if (missing.length) {
      console.error("Missing email env vars:", missing);
      return res.status(500).json({ message: "Email config missing", missing });
    }

    // Load profile + cart
    const user = await Profile.findById(userId);
    const cart = await Cart.findOne({ user: userId });

    if (!user) return res.status(404).json({ message: "User profile not found" });

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Debug recipients (shows in Render logs)
    console.log("📧 Email debug:", {
      from: EMAIL_FROM,
      userEmail: user.email,
      customerEmail,
      adminEmail: ADMIN_EMAIL,
    });

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
      });
      createdOrders.push(order);
    }

    // Build email summary
    const username = user.username || user.email;
    const itemsHtml = buildItemsHtml(cart.items);

    // Send emails (if any fails, it will throw and you'll see why in logs)
    await sendEmail({
      to: user.email,
      subject: "Order Confirmation - BuzzyMuzzy",
      html: `
        <h2>Thank you for your order, ${escapeHtml(username)}!</h2>
        <p>Your order has been received and is being processed.</p>
        <hr/>
        ${itemsHtml}
      `,
    });

    await sendEmail({
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

    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `New Order Received - ${escapeHtml(username)}`,
      html: `
        <h2>New Order Notification</h2>
        <p><strong>Logged-in User:</strong> ${escapeHtml(username)}</p>
        <p><strong>Customer Email:</strong> ${escapeHtml(customerEmail)}</p>
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
    console.error("Order error full:", error);
    console.error("Order error message:", error?.message);

    return res.status(500).json({
      message: "Server error",
      details: error?.message,
    });
  }
};