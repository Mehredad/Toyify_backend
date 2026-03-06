// controllers/orderController.js (or whatever your file name is)

const Order = require("../models/Order");
const Profile = require("../models/Profile");
const Cart = require("../models/Cart");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const EMAIL_FROM = process.env.EMAIL_FROM; // e.g. "BuzzyMuzzy <onboarding@resend.dev>"

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

// Resend helper (throws on failure)
async function sendEmail({ to, subject, html }) {
  const result = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject,
    html,
  });

  // Resend SDK returns { data, error }
  if (result?.error) {
    // Log full error so you can see EXACT reason in server logs
    console.error("❌ Resend send error FULL:", JSON.stringify(result.error, null, 2));
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
    // IMPORTANT: some apps have Profile._id != User._id
    // So we try BOTH ways to avoid breaking your setup.
    let userProfile = await Profile.findById(userId);
    if (!userProfile) {
      userProfile = await Profile.findOne({ user: userId });
    }

    const cart = await Cart.findOne({ user: userId });

    if (!userProfile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    // Try to pick an email field safely
    const profileEmail =
      userProfile.email ||
      userProfile.userEmail ||
      userProfile.customerEmail ||
      userProfile?.contactEmail;

    if (!profileEmail) {
      // Don't let Resend fail mysteriously
      return res.status(400).json({
        message: "User profile email missing",
        hint: "Add `email` to Profile OR send user email from your User model.",
      });
    }

    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // Debug recipients (shows in Render logs)
    console.log("📧 Email debug:", {
      from: EMAIL_FROM,
      profileEmail,
      customerEmail,
      adminEmail: ADMIN_EMAIL,
      cartItemsCount: cart.items.length,
    });

    // Create orders for all items (keeps your current behavior)
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
    const username = userProfile.username || profileEmail;
    const itemsHtml = buildItemsHtml(cart.items);

    // Send emails BUT: do NOT fail the whole checkout if Resend fails.
    // We'll collect errors and still return 201 so frontend isn't blocked.
    const emailErrors = [];

    try {
      await sendEmail({
        to: profileEmail,
        subject: "Order Confirmation - Toyify",
        html: `
          <h2>Thank you for your order, ${escapeHtml(username)}!</h2>
          <p>Your order has been received and is being processed.</p>
          <hr/>
          ${itemsHtml}
        `,
      });
    } catch (e) {
      console.error("Email failed (profile user):", e?.message);
      emailErrors.push({ to: profileEmail, error: e?.message });
    }

    try {
      await sendEmail({
        to: customerEmail,
        subject: "Your Toyify Order Details",
        html: `
          <h2>Your Toyify Order</h2>
          <p>Thank you for placing an order!</p>
          <hr/>
          ${itemsHtml}
          <p>If you did not place this order, please contact support.</p>
        `,
      });
    } catch (e) {
      console.error("Email failed (customer):", e?.message);
      emailErrors.push({ to: customerEmail, error: e?.message });
    }

    try {
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
    } catch (e) {
      console.error("Email failed (admin):", e?.message);
      emailErrors.push({ to: ADMIN_EMAIL, error: e?.message });
    }

    // Clear cart after order creation (even if email failed)
    cart.items = [];
    await cart.save();

    return res.status(201).json({
      message:
        emailErrors.length === 0
          ? "Order created successfully"
          : "Order created successfully (email sending had issues)",
      orders: createdOrders,
      emailErrors, // helps you debug without breaking checkout
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