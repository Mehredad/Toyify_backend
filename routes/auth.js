const express = require("express");
const router = express.Router();
const { signup, login, googleLogin  } = require("../controllers/authController");
const authMiddleware = require("../middleware/auth");

router.post("/signup", signup);
router.post("/login", login);
router.post("/google-login", googleLogin);

router.get("/me", authMiddleware, (req, res) => {
  res.json({ user: req.user }); // now req.user is populated
});

module.exports = router;
