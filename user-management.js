
import fs from "fs/promises";
import path from "path";
import bcrypt from "bcrypt";
import crypto from "crypto";

const usersFilePath = path.resolve(process.cwd(), "users.json");
const saltRounds = 10;

async function readUsers() {
  try {
    const data = await fs.readFile(usersFilePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return []; // Return empty array if file doesn't exist
    }
    throw error;
  }
}

async function writeUsers(users) {
  await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2));
}

export async function getAllUsers() {
  const users = await readUsers();
  return users.map(({ hashedPassword, ...user }) => user); // Exclude hashed passwords
}

export async function findUserByEmail(email) {
  const users = await readUsers();
  return users.find(user => user.email === email);
}

export async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

export async function addUser(userData) {
  const { email, password, firstName, lastName } = userData;
  if (!email || !password || !firstName || !lastName) {
    throw new Error("Missing user data. All fields are required.");
  }

  const users = await readUsers();
  const existingUser = users.find(user => user.email === email);
  if (existingUser) {
    throw new Error("User with this email already exists.");
  }

  const hashedPassword = await bcrypt.hash(password, saltRounds);
  const newUser = {
    id: `user_${Date.now()}`,
    email,
    hashedPassword,
    firstName,
    lastName,
  };

  users.push(newUser);
  await writeUsers(users);

  const { hashedPassword: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword;
}

export async function findUserById(id) {
  const users = await readUsers();
  const user = users.find(user => user.id === id);
  if (!user) {
    return null;
  }
  const { hashedPassword, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

export async function updateUser(id, userData) {
  const { email, firstName, lastName } = userData;
  const users = await readUsers();
  const userIndex = users.findIndex(user => user.id === id);

  if (userIndex === -1) {
    throw new Error("User not found.");
  }

  // Ensure the new email isn't already taken by another user
  if (email) {
    const existingUser = users.find(user => user.email === email && user.id !== id);
    if (existingUser) {
      throw new Error("Email is already in use by another account.");
    }
  }

  const updatedUser = {
    ...users[userIndex],
    email: email || users[userIndex].email,
    firstName: firstName || users[userIndex].firstName,
    lastName: lastName || users[userIndex].lastName,
  };

  users[userIndex] = updatedUser;
  await writeUsers(users);

  const { hashedPassword, ...userWithoutPassword } = updatedUser;
  return userWithoutPassword;
}

export async function deleteUser(id) {
  const users = await readUsers();
  const filteredUsers = users.filter(user => user.id !== id);

  if (users.length === filteredUsers.length) {
    throw new Error("User not found.");
  }

  await writeUsers(filteredUsers);
  return { message: "User deleted successfully." };
}

export async function requestPasswordReset(email) {
  const users = await readUsers();
  const userIndex = users.findIndex(user => user.email === email);

  if (userIndex === -1) {
    // To prevent email enumeration, we don't throw an error here.
    // In a real app, you'd log this, but to the client, it looks the same.
    return null;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenExpiry = Date.now() + 3600000; // 1 hour from now

  users[userIndex].passwordResetToken = resetToken;
  users[userIndex].passwordResetExpires = resetTokenExpiry;

  await writeUsers(users);

  // In a real app, you would email this token to the user.
  // For this example, we return it for simulation purposes.
  return resetToken;
}

export async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    throw new Error("Token and new password are required.");
  }

  const users = await readUsers();
  const userIndex = users.findIndex(
    user => user.passwordResetToken === token && user.passwordResetExpires > Date.now()
  );

  if (userIndex === -1) {
    throw new Error("Invalid or expired password reset token.");
  }

  const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
  users[userIndex].hashedPassword = hashedPassword;

  // Invalidate the token
  users[userIndex].passwordResetToken = undefined;
  users[userIndex].passwordResetExpires = undefined;

  await writeUsers(users);

  return { message: "Password has been reset successfully." };
}
