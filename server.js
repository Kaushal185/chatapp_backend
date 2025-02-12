require("dotenv").config(); // Load environment variables

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const http = require("http");
const socketIo = require("socket.io");

const User = require("./models/user.model");
const Message = require("./models/message.model");
const Group = require("./models/group.model");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  },
});

// **MongoDB Connection**
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// **Middleware**
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json());

// **Session Configuration**
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URL }),
    cookie: { secure: false, httpOnly: true },
  })
);

// **User Registration**
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: "Username already taken" });
    }

    const newUser = new User({ username, password });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully", user: newUser });
  } catch (err) {
    res.status(500).json({ error: "Server error during registration" });
  }
});

// **User Login**
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || password !== user.password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.session.userId = user._id;
    res.json({ message: "Login successful", user });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// **User Logout**
app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ message: "Logged out" });
});

// **Get Messages (Individual Chat)**
app.get("/api/messages/:userId", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const messages = await Message.find({
      $or: [
        { sender: req.session.userId, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.session.userId },
      ],
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// **Send Message (Individual Chat)**
app.post("/api/messages", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { receiver, message } = req.body;
    const newMessage = new Message({
      sender: req.session.userId,
      receiver,
      message,
    });

    await newMessage.save();
    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: "Message sending failed" });
  }
});

// **Create a Group**
app.post("/api/groups", async (req, res) => {
  try {
    const { name, members } = req.body;
    const group = new Group({ name, members });

    await group.save();
    res.status(201).json(group);
  } catch (err) {
    res.status(500).json({ error: "Failed to create group" });
  }
});

// **Get Group Messages**
app.get("/api/groups/:groupId/messages", async (req, res) => {
  try {
    const messages = await Message.find({ group: req.params.groupId }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch group messages" });
  }
});

// **Send Group Message**
app.post("/api/groups/:groupId/messages", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { message } = req.body;
    const newMessage = new Message({
      sender: req.session.userId,
      group: req.params.groupId,
      message,
    });

    await newMessage.save();
    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ error: "Failed to send group message" });
  }
});

// **Socket.io for Real-time Chat**
io.on("connection", (socket) => {
  console.log("⚡ User connected");

  socket.on("sendMessage", async (data) => {
    try {
      const { sender, receiver, message, group } = data;
      const newMessage = new Message({ sender, receiver, message, group });

      await newMessage.save();
      io.emit("receiveMessage", newMessage);
    } catch (err) {
      console.error("❌ Error in sendMessage:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("⚡ User disconnected");
  });
});

// **Start Server**
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
