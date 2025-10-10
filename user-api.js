import express from "express";
import {
  addUser,
  getAllUsers,
  findUserById,
  updateUser,
  deleteUser,
  requestPasswordReset,
  resetPassword,
} from "./user-management.js";

const router = express.Router();

// GET /api/users - Get all users
router.get("/users", async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users", error: error.message });
  }
});

// POST /api/users - Create a new user
router.post("/users", async (req, res) => {
  try {
    const newUser = await addUser(req.body);
    res.status(201).json(newUser);
  } catch (error) {
    res.status(400).json({ message: "Error creating user", error: error.message });
  }
});

// GET /api/users/:id - Get a single user by ID
router.get("/users/:id", async (req, res) => {
  try {
    const user = await findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Error fetching user", error: error.message });
  }
});
router.get("/users" ,async(req, res) => {
  res.json(getAllUsers());
})

// PUT /api/users/:id - Update a user
router.put("/users/:id", async (req, res) => {
  try {
    const updatedUser = await updateUser(req.params.id, req.body);
    res.json(updatedUser);
  } catch (error) {
    if (error.message === "User not found.") {
      return res.status(404).json({ message: "User not found" });
    }
    if (error.message === "Email is already in use by another account.") {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: "Error updating user", error: error.message });
  }
});

// DELETE /api/users/:id - Delete a user
router.delete("/users/:id", async (req, res) => {
  try {
    const result = await deleteUser(req.params.id);
    res.json(result);
  } catch (error) {
    if (error.message === "User not found.") {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(500).json({ message: "Error deleting user", error: error.message });
  }
});

// POST /api/password-reset/request - Request a password reset token
router.post("/password-reset/request", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const resetToken = await requestPasswordReset(email);

    // In a real app, you'd email the token. Here, we return it for simulation.
    if (resetToken) {
      res.json({ 
        message: "Password reset token generated. In a real app, this would be emailed to you.",
        resetToken: resetToken 
      });
    } else {
      // Even if the user is not found, we send a generic success message 
      // to prevent attackers from guessing which emails are registered.
      res.json({ message: "If a user with that email exists, a password reset token has been generated." });
    }
  } catch (error) {
    res.status(500).json({ message: "Error requesting password reset", error: error.message });
  }
});

// POST /api/password-reset/confirm - Confirm a password reset
router.post("/password-reset/confirm", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required." });
    }

    const result = await resetPassword(token, newPassword);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message }); // e.g., "Invalid or expired token"
  }
});

export default router;
