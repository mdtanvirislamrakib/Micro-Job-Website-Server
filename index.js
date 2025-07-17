require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SK_KEY);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// MongoDB setup
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  const db = client.db("MicroJob");
  const taskCollection = db.collection("tasks");
  const usersCollection = db.collection("users");
  const coinCollection = db.collection("coin");
  const purchasedCoinCollection = db.collection("purchasedCoin");
  const submissionCollection = db.collection("submittedTask");

  // --- Auth ---
  app.post("/jwt", (req, res) => {
    const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "365d",
    });
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "Lax",
      })
      .send({ success: true });
  });

  app.get("/logout", (req, res) => {
    res.clearCookie("token").send({ success: true });
  });

  // --- Users ---
  app.post("/users", async (req, res) => {
    const user = req.body;
    const existing = await usersCollection.findOne({ email: user.email });

    if (existing) {
      const result = await usersCollection.updateOne(
        { email: user.email },
        {
          $set: { last_login: new Date().toISOString() },
        }
      );
      return res.send(result);
    }

    const role = user.role || "worker";
    user.role = role;
    user.coin = role === "buyer" ? 50 : 10;
    user.created_at = user.last_login = new Date().toISOString();

    const result = await usersCollection.insertOne(user);
    res.send(result);
  });

  // 1. সকল ইউজার ডেটা আনার জন্য API এন্ডপয়েন্ট
  app.get("/users-management", async (req, res) => {
    const loginUserEmail = req?.query?.email
    const filter = {
      email: { $ne: loginUserEmail }
    }
    const users = await usersCollection.find(filter).toArray();
    res.send(users);
  });

  // 2. ইউজার ডিলিট করার জন্য API এন্ডপয়েন্ট
  app.delete("/users-management/:id", async (req, res) => {
    const id = req?.params?.id;
    const filter = { _id: new ObjectId(id) };
    const result = await usersCollection.deleteOne(filter);
    res.send(result);
  });

  // 3. ইউজারের রোল আপডেট করার জন্য API এন্ডপয়েন্ট
  app.patch("/users-management/update-role/:id", async (req, res) => {
    const id = req?.params?.id;
    const { role } = req?.body;

    // ভ্যালিড রোল কিনা চেক করুন
    const validRoles = ["admin", "buyer", "worker"];
    if (!validRoles.includes(role)) {
      return res.status(400).send({ message: "Invalid role specified." });
    }

    const filter = {_id: new ObjectId(id)};
    const updateDoc = {
      $set: {
        role: role
      }
    }

    const result = await usersCollection.updateOne(filter, updateDoc)
    res.send(result)

  });

  app.get("/user/role/:email", async (req, res) => {
    const user = await usersCollection.findOne({ email: req.params.email });
    res.send(user ? { role: user.role } : { message: "User not found" });
  });

  app.get("/my-coins", async (req, res) => {
    const email = req.query.email;
    const user = await usersCollection.findOne({ email });
    res.send({ currentCoin: user?.coin || 0 });
  });

  app.patch("/update-coin", async (req, res) => {
    const { email, addedCoin } = req.body;
    const result = await usersCollection.updateOne(
      { email },
      { $inc: { coin: parseFloat(addedCoin) || 0 } }
    );
    res.send(result);
  });

  app.patch("/decrease-coin/:email", async (req, res) => {
    const { coinToUpdate, status } = req.body;
    const result = await usersCollection.updateOne(
      { email: req.params.email },
      { $inc: { coin: status === "decrease" ? -coinToUpdate : coinToUpdate } }
    );
    res.send(result);
  });

  // --- Tasks ---
  app.post("/add-task", async (req, res) => {
    const result = await taskCollection.insertOne(req.body);
    res.send(result);
  });

  app.get("/my-tasks/:email", async (req, res) => {
    const result = await taskCollection
      .find({ "buyer.email": req.params.email })
      .toArray();
    res.send(result);
  });

  app.get("/tasks", async (req, res) => {
    const result = await taskCollection
      .find({ requiredWorkers: { $gt: 0 } })
      .toArray();
    res.send(result);
  });

  app.get("/task/:id", async (req, res) => {
    const task = await taskCollection.findOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(task);
  });

  app.patch("/tasks/:id", async (req, res) => {
    const update = { ...req.body };
    delete update._id;
    const result = await taskCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: update }
    );
    res.send(result);
  });

  app.delete("/tasks/:id", async (req, res) => {
    const result = await taskCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  });

  // --- Submissions ---
  app.post("/submit-task", async (req, res) => {
    const result = await submissionCollection.insertOne(req.body);
    res.send(result);
  });

  app.get("/submissionData", async (req, res) => {
    const result = await submissionCollection.find().toArray();
    res.send(result);
  });

  app.get("/pending-submissions", async (req, res) => {
    const buyerEmail = req.query.buyer_email;
    const tasks = await taskCollection
      .find({ "buyer.email": buyerEmail })
      .toArray();
    const taskIds = tasks.map((t) => t._id.toString());
    const pending = await submissionCollection
      .find({
        task_id: { $in: taskIds },
        status: "pending",
      })
      .toArray();
    const enriched = pending.map((sub) => {
      const task = tasks.find((t) => t._id.toString() === sub.task_id);
      return { ...sub, task_title: task?.task_title || "Unknown Task" };
    });
    res.send(enriched);
  });

  app.patch("/approve-submission/:id", async (req, res) => {
    const id = new ObjectId(req.params.id);
    const sub = await submissionCollection.findOne({ _id: id });

    if (!sub || sub.status !== "pending")
      return res.status(400).send({ message: "Invalid submission" });

    await submissionCollection.updateOne(
      { _id: id },
      { $set: { status: "Approved" } }
    );
    await usersCollection.updateOne(
      { email: sub.worker_email },
      { $inc: { coin: sub.payable_amount } }
    );

    res.send({ message: "Approved", worker_email: sub.worker_email });
  });

  app.patch("/reject-submission/:id", async (req, res) => {
    const id = new ObjectId(req.params.id);
    const sub = await submissionCollection.findOne({ _id: id });

    if (!sub || sub.status !== "pending")
      return res.status(400).send({ message: "Invalid submission" });

    await submissionCollection.updateOne(
      { _id: id },
      { $set: { status: "Rejected" } }
    );
    await taskCollection.updateOne(
      { _id: new ObjectId(sub.task_id) },
      { $inc: { requiredWorkers: 1 } }
    );

    res.send({ message: "Rejected", task_id: sub.task_id });
  });

  // --- Coins / Payment ---
  app.get("/coins", async (req, res) => {
    const result = await coinCollection.find().toArray();
    res.send(result);
  });

  app.post("/create-payment-intent", async (req, res) => {
    const pkg = await coinCollection.findOne({ id: req.body.packageId });
    const price = (parseFloat(pkg?.price) || 0) * 100;
    const intent = await stripe.paymentIntents.create({
      amount: price,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
    });
    res.send({ clientSecret: intent.client_secret });
  });

  app.post("/save-purchase", async (req, res) => {
    const data = req.body;
    data.coinsPurchased = parseFloat(data.coinsPurchased) || 0;

    const result = await purchasedCoinCollection.insertOne(data);
    await usersCollection.updateOne(
      { email: data.userEmail },
      { $inc: { coin: data.coinsPurchased } }
    );
    res.send({ success: true, purchaseSaved: result });
  });

  app.get("/transactions", async (req, res) => {
    const result = await purchasedCoinCollection.find().toArray();
    res.send(result);
  });

  // DB ping
  await client.db("admin").command({ ping: 1 });
  console.log("Connected to MongoDB.");
}
run().catch(console.dir);

// Base Route
app.get("/", (req, res) => {
  res.send("Hello from Micro Job Server!");
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
