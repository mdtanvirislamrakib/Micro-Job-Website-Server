require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken"); // যদিও JWT ব্যবহার হচ্ছে না, মডিউলটি রাখা হয়েছে
const stripe = require("stripe")(process.env.STRIPE_SK_KEY);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(
  cors({
    // origin: ["http://localhost:5173", "http://localhost:5174"],
    origin: ["https://microjob-website.netlify.app"],
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
  const withdrawalsCollection = db.collection("withdrawals");

  app.post("/jwt", (req, res) => {
    const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "365d",
    });
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "Lax",
        maxAge: 365 * 24 * 60 * 60 * 1000,
      })
      .send({ success: true });
  });

  app.get("/logout", (req, res) => {
    res
      .clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "Lax",
      })
      .send({ success: true });
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

  // ১. নির্দিষ্ট worker এর সমস্ত submissions পাওয়ার জন্য এন্ডপয়েন্ট
  // GET /api/worker/submissions?workerEmail=<worker_email>
  app.get("/api/worker/submissions", async (req, res) => {
    try {
      const workerEmail = req.query.workerEmail;

      if (!workerEmail) {
        return res.status(400).send({ message: "Worker email is required." });
      }

      const workerSubmissions = await submissionCollection
        .find({ worker_email: workerEmail })
        .toArray();

      // প্রতিটি সাবমিশনের সাথে সম্পর্কিত টাস্কের title যোগ করুন
      const taskIds = [
        ...new Set(workerSubmissions.map((sub) => new ObjectId(sub.task_id))),
      ];
      const tasks = await taskCollection
        .find({ _id: { $in: taskIds } })
        .toArray();

      const enrichedSubmissions = workerSubmissions.map((sub) => {
        const task = tasks.find(
          (t) => t._id.toString() === sub.task_id.toString()
        );
        return {
          ...sub,
          task_title: task ? task.task_title : "Unknown Task Title", // টাস্ক টাইটেল যোগ করা
          buyer_name: task ? task.buyer.name : "Unknown Buyer", // বায়ারের নাম যোগ করা
        };
      });
      res.send(enrichedSubmissions);
    } catch (error) {
      console.error("Error fetching worker submissions:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // ২. নির্দিষ্ট worker এর জন্য metrics (মোট সাবমিশন, পেন্ডিং সাবমিশন, মোট আয়) পাওয়ার জন্য এন্ডপয়েন্ট
  // GET /api/worker/stats?workerEmail=<worker_email>
  app.get("/api/worker/stats", async (req, res) => {
    try {
      const workerEmail = req.query.workerEmail; // ফ্রন্টএন্ড থেকে workerEmail পাঠানো হবে

      if (!workerEmail) {
        return res.status(400).send({ message: "Worker email is required." });
      }

      const submissions = await submissionCollection
        .find({ worker_email: workerEmail })
        .toArray();

      const totalSubmissions = submissions.length;
      const totalPendingSubmissions = submissions.filter(
        (sub) => sub.status === "pending"
      ).length;
      const totalEarning = submissions
        .filter((sub) => sub.status === "Approved")
        .reduce((sum, sub) => sum + sub.payable_amount, 0);

      res.send({
        totalSubmissions,
        totalPendingSubmissions,
        totalEarning: parseFloat(totalEarning.toFixed(2)),
      });
    } catch (error) {
      console.error("Error fetching worker stats:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // এই এন্ডপয়েন্টটি AdminHome কম্পোনেন্টের "মোট কর্মী" এবং "মোট ক্রেতা" ডেটা আনার জন্য ব্যবহৃত হবে।
  // এখানে `loginUserEmail` ফিল্টারটি সরিয়ে দেওয়া হয়েছে কারণ এটি AdminHome-এর জন্য অপ্রয়োজনীয়।
  app.get("/users-management", async (req, res) => {
    try {
      const users = await usersCollection.find({}).toArray();
      res.send(users);
    } catch (error) {
      console.error("Error fetching users for management:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.delete("/users-management/:id", async (req, res) => {
    const id = req?.params?.id;
    const filter = { _id: new ObjectId(id) };
    const result = await usersCollection.deleteOne(filter);
    res.send(result);
  });

  app.patch("/users-management/update-role/:id", async (req, res) => {
    const id = req?.params?.id;
    const { role } = req?.body;

    const validRoles = ["admin", "buyer", "worker"];
    if (!validRoles.includes(role)) {
      return res.status(400).send({ message: "Invalid role specified." });
    }

    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: {
        role: role,
      },
    };

    const result = await usersCollection.updateOne(filter, updateDoc);
    res.send(result);
  });

  app.get("/user/role/:email", async (req, res) => {
    const user = await usersCollection.findOne({ email: req.params.email });
    res.send(user ? { role: user.role } : { message: "User not found" });
  });

  app.get("/worker/balance", async (req, res) => {
    try {
      const workerEmail = req.query?.email;

      if (!workerEmail) {
        return res.status(400).send({ message: "Worker email is required." });
      }

      const worker = await usersCollection.findOne({ email: workerEmail });

      if (!worker) {
        return res.status(404).send({ message: "Worker not found." });
      }

      res.send({ currentCoins: worker.coin || 0 });
    } catch (error) {
      console.error("Error fetching worker balance:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.post("/worker/withdraw", async (req, res) => {
    try {
      const {
        worker_email,
        worker_name,
        withdrawal_coin,
        withdrawal_amount,
        payment_system,
        accountNumber,
      } = req.body;

      if (!worker_email || !worker_name) {
        return res
          .status(400)
          .send({ message: "Worker email and name are required." });
      }

      const numWithdrawalCoin = Number(withdrawal_coin);
      const numWithdrawalAmount = Number(withdrawal_amount);

      if (
        isNaN(numWithdrawalCoin) ||
        numWithdrawalCoin <= 0 ||
        isNaN(numWithdrawalAmount) ||
        numWithdrawalAmount <= 0 ||
        !payment_system ||
        !accountNumber
      ) {
        return res.status(400).send({
          message:
            "Invalid withdrawal data provided. Please ensure all fields are correct.",
        });
      }

      let workerDataFromDb = await usersCollection.findOne({
        email: worker_email,
      });
      if (!workerDataFromDb) {
        return res
          .status(404)
          .send({ message: "Worker not found in database." });
      }
      const actualWorkerId = workerDataFromDb._id;

      const MIN_WITHDRAW_COINS = 200;
      if (numWithdrawalCoin < MIN_WITHDRAW_COINS) {
        return res.status(400).send({
          message: `Minimum withdrawal is ${MIN_WITHDRAW_COINS} coins.`,
        });
      }

      if (workerDataFromDb.coin < numWithdrawalCoin) {
        return res.status(400).send({
          message:
            "Insufficient coins: You do not have enough coins to withdraw.",
        });
      }

      const withdrawalData = {
        worker_email: worker_email,
        worker_name: worker_name,
        worker_id: actualWorkerId,
        withdrawal_coin: numWithdrawalCoin,
        withdrawal_amount: numWithdrawalAmount,
        payment_system: payment_system,
        account_number: accountNumber,
        withdraw_date: new Date(),
        status: "pending",
      };

      const result = await withdrawalsCollection.insertOne(withdrawalData);

      await usersCollection.updateOne(
        { _id: new ObjectId(actualWorkerId) },
        { $inc: { coin: -numWithdrawalCoin } }
      );

      res.status(200).send({
        message: "Withdrawal request submitted successfully!",
        withdrawalId: result.insertedId,
      });
    } catch (error) {
      console.error("Error processing withdrawal request:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // --- AdminHome Dashboard Metrics (কোনো মিডলওয়্যার ছাড়া) ---

  // মোট উপলব্ধ কয়েন আনার জন্য
  app.get("/admin/total-available-coins", async (req, res) => {
    try {
      const result = await usersCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalCoins: { $sum: "$coin" },
            },
          },
        ])
        .toArray();
      res.send({ totalCoins: result.length > 0 ? result[0].totalCoins : 0 });
    } catch (error) {
      console.error("Error fetching total available coins:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // মোট পেন্ডিং উইথড্রয়াল সংখ্যা আনার জন্য
  app.get("/admin/total-pending-withdrawals", async (req, res) => {
    try {
      const count = await withdrawalsCollection.countDocuments({
        status: "pending",
      });
      res.send({ count });
    } catch (error) {
      console.error("Error fetching total pending withdrawals:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // মোট পেন্ডিং সাবমিশন সংখ্যা আনার জন্য
  app.get("/admin/total-pending-submissions", async (req, res) => {
    try {
      const count = await submissionCollection.countDocuments({
        status: "pending",
      });
      res.send({ count });
    } catch (error) {
      console.error("Error fetching total pending submissions:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // সমস্ত পেন্ডিং উইথড্রয়াল রিকোয়েস্ট আনার জন্য
  app.get("/admin/withdrawal-requests", async (req, res) => {
    try {
      const requests = await withdrawalsCollection
        .find({ status: "pending" })
        .toArray();
      res.send(requests);
    } catch (error) {
      console.error("Error fetching withdrawal requests:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // উইথড্রয়াল রিকোয়েস্ট অ্যাপ্রুভ করার জন্য
  app.patch("/admin/approve-withdrawal/:id", async (req, res) => {
    try {
      const id = new ObjectId(req.params.id);
      const withdrawal = await withdrawalsCollection.findOne({ _id: id });

      if (!withdrawal || withdrawal.status !== "pending") {
        return res.status(400).send({
          message: "Invalid or already processed withdrawal request.",
        });
      }

      const result = await withdrawalsCollection.updateOne(
        { _id: id },
        { $set: { status: "Approved" } }
      );
      // নোট: কয়েন worker/withdraw এন্ডপয়েন্টেই কাটা হয়েছে, তাই এখানে আর কাটার প্রয়োজন নেই।

      res
        .status(200)
        .send({ message: "Withdrawal approved successfully!", result });
    } catch (error) {
      console.error("Error approving withdrawal request:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // উইথড্রয়াল রিকোয়েস্ট রিজেক্ট করার জন্য (এবং কয়েন ফেরত দেওয়ার জন্য)
  app.patch("/admin/reject-withdrawal/:id", async (req, res) => {
    try {
      const id = new ObjectId(req.params.id);
      const withdrawal = await withdrawalsCollection.findOne({ _id: id });

      if (!withdrawal || withdrawal.status !== "pending") {
        return res.status(400).send({
          message: "Invalid or already processed withdrawal request.",
        });
      }

      await withdrawalsCollection.updateOne(
        { _id: id },
        { $set: { status: "Rejected" } }
      );

      // কর্মীর ব্যালেন্সে কয়েন ফেরত দিন
      await usersCollection.updateOne(
        { email: withdrawal.worker_email },
        { $inc: { coin: withdrawal.withdrawal_coin } }
      );

      res.send({
        message: "Withdrawal request rejected and coins refunded.",
        workerEmail: withdrawal.worker_email,
      });
    } catch (error) {
      console.error("Error rejecting withdrawal request:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // সমস্ত পেন্ডিং সাবমিশন আনার জন্য (অ্যাডমিনের সমস্ত সাবমিশন দেখার জন্য)
  app.get("/admin/all-pending-submissions", async (req, res) => {
    try {
      const pending = await submissionCollection
        .find({ status: "pending" })
        .toArray();
      const taskIds = pending.map((sub) => new ObjectId(sub.task_id));
      const tasks = await taskCollection
        .find({ _id: { $in: taskIds } })
        .toArray();

      const enriched = pending.map((sub) => {
        const task = tasks.find((t) => t._id.toString() === sub.task_id);
        return { ...sub, task_title: task?.task_title || "Unknown Task" };
      });
      res.send(enriched);
    } catch (error) {
      console.error("Error fetching all pending submissions:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
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

  // নতুন এন্ডপয়েন্ট: নির্দিষ্ট বায়ারেApproved করা সাবমিশনগুলো পাওয়ার জন্য
  app.get("/buyer-approved-submissions", async (req, res) => {
    try {
      const buyerEmail = req.query.buyer_email;
      if (!buyerEmail) {
        return res.status(400).send({ message: "Buyer email is required." });
      }

      // প্রথমে বায়ারের তৈরি করা টাস্কগুলো খুঁজে বের করুন
      const buyersTasks = await taskCollection
        .find({ "buyer.email": buyerEmail })
        .toArray();
      const buyerTaskIds = buyersTasks.map((task) => task._id.toString());

      // এরপর সেই টাস্কগুলোর মধ্যে থেকে Approved সাবমিশনগুলো আনুন
      const approvedSubmissions = await submissionCollection
        .find({
          task_id: { $in: buyerTaskIds },
          status: "Approved",
        })
        .toArray();

      res.send(approvedSubmissions);
    } catch (error) {
      console.error("Error fetching buyer's approved submissions:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
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
      return { ...sub, task_title: task?.taskTitle || "Unknown Task" };
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

  // এই এন্ডপয়েন্টটি AdminHome কম্পোনেন্টের "মোট লেনদেন" ডেটা আনার জন্য ব্যবহৃত হবে।
  app.get("/transactions", async (req, res) => {
    const result = await purchasedCoinCollection.find().toArray();
    res.send(result);
  });

  // DB ping
  // await client.db("admin").command({ ping: 1 });
  // console.log("Connected to MongoDB.");
}
run().catch(console.dir);

// Base Route
app.get("/", (req, res) => {
  res.send("Hello from Micro Job Server!");
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
