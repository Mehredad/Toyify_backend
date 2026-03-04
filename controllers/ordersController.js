const Order = require("../models/Order");
const Profile = require("../models/Profile");
const Cart = require("../models/Cart");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const EMAIL_FROM = process.env.EMAIL_FROM; // example: BuzzyMuzzy <onboarding@resend.dev>

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

async function sendEmail({ to, subject, html }) {
  return resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });
}

exports.createOrder = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { customerEmail } = req.body;
    const userId = req.user._id;

    if (!customerEmail) {
      return res.status(400).json({ message: "Customer email is required" });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(500).json({ message: "RESEND_API_KEY missing" });
    }

    if (!ADMIN_EMAIL) {
      return res.status(500).json({ message: "ADMIN_EMAIL missing" });
    }

    if (!EMAIL_FROM) {
      return res.status(500).json({ message: "EMAIL_FROM missing" });
    }

    const user = await Profile.findById(userId);
    const cart = await Cart.findOne({ user: userId });

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

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

    const username = user.username || user.email;
    const itemsHtml = buildItemsHtml(cart.items);

    // Email to logged-in user
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

    // Email to customer email
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

    // Email to admin
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

    cart.items = [];
    await cart.save();

    return res.status(201).json({
      message: "Order created successfully",
      orders: createdOrders,
    });

  } catch (error) {
    console.error("Order error full:", error);

    return res.status(500).json({
      message: "Server error",
      details: error?.message,
    });
  }
};