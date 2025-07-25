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
    // origin: ["https://microjob-website.netlify.app"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// Verify Token
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};
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
  const notificationsCollection = db.collection("notifications");

  // server.js (run function এর ভেতরে বা বাইরে যেখানে আপনার অন্যান্য ইউটিলিটি ফাংশন আছে)

  // for admin verification
  const verifyAdmin = async (req, res, next) => {
    const userEmail = req.user?.email;
    const user = await usersCollection.findOne({ email: userEmail });

    if (!user || user.role !== "admin") {
      return res.status(403).send({ message: "forbidden access" });
    }
    next();
  };

  // for Buyer Verification
  const verifyBuyer = async (req, res, next) => {
    const userEmail = req.user?.email;
    const user = await usersCollection.findOne({ email: userEmail });
    if (!user || user.role !== "buyer") {
      return res.status(403).send({ message: "forbidden access" });
    }
    next();
  };

  // for worker verification
  const verifyWorker = async (req, res, next) => {
    const userEmail = req.user?.email;
    const user = await usersCollection.findOne({ email: userEmail });

    if (!user || user.role !== "worker") {
      return res.status(403).send({ message: "forbidden access" });
    }
    next();
  };

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

  app.get("/top-workers", async (req, res) => {
    try {
      // Query workers, sort by 'coin' in descending order, and limit to 6
      const topWorkers = await usersCollection
        .find({ role: "worker" }) // Filter by role "worker"
        .sort({ coin: -1 }) // Sort by coin in descending order
        .limit(6) // Limit to top 6
        .project({ name: 1, image: 1, coin: 1, email: 1 }) // Only project necessary fields
        .toArray();
      res.send(topWorkers);
    } catch (error) {
      console.error("Error fetching top workers:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // ১. নির্দিষ্ট worker এর সমস্ত submissions পাওয়ার জন্য এন্ডপয়েন্ট
  // GET /api/worker/submissions?workerEmail=<worker_email>
  app.get(
    "/api/worker/submissions",
    verifyToken,
    verifyWorker,
    async (req, res) => {
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
            taskTitle: task ? task.taskTitle : "Unknown Task Title", // টাস্ক টাইটেল যোগ করা
            buyer_name: task ? task.buyer.name : "Unknown Buyer", // বায়ারের নাম যোগ করা
          };
        });
        res.send(enrichedSubmissions);
      } catch (error) {
        console.error("Error fetching worker submissions:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    }
  );

  // ২. নির্দিষ্ট worker এর জন্য metrics (মোট সাবমিশন, পেন্ডিং সাবমিশন, মোট আয়) পাওয়ার জন্য এন্ডপয়েন্ট
  // GET /api/worker/stats?workerEmail=<worker_email>
  app.get("/api/worker/stats", verifyToken, verifyWorker, async (req, res) => {
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
  app.get("/users-management", verifyToken, verifyAdmin, async (req, res) => {
    try {
      const loggedInEmail = req?.query?.email;
      const query = { email: { $ne: loggedInEmail } };
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    } catch (error) {
      console.error("Error fetching users for management:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  app.delete(
    "/users-management/:id",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
      const id = req?.params?.id;
      const filter = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(filter);
      res.send(result);
    }
  );

  app.patch(
    "/users-management/update-role/:id",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
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
    }
  );

  app.get("/user/role/:email", async (req, res) => {
    const user = await usersCollection.findOne({ email: req.params.email });
    res.send(user ? { role: user.role } : { message: "User not found" });
  });

  app.get("/worker/balance", verifyToken, verifyWorker, async (req, res) => {
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

  app.post("/worker/withdraw", verifyToken, verifyWorker, async (req, res) => {
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
  app.get(
    "/admin/total-available-coins",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
      try {
        const result = await usersCollection
          .aggregate([
            {
              $match: {
                coin: { $gt: 0 }, // only include users with coin > 0
              },
            },
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
    }
  );

  // মোট পেন্ডিং উইথড্রয়াল সংখ্যা আনার জন্য
  app.get(
    "/admin/total-pending-withdrawals",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
      try {
        const count = await withdrawalsCollection.countDocuments({
          status: "pending",
        });
        res.send({ count });
      } catch (error) {
        console.error("Error fetching total pending withdrawals:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    }
  );

  // মোট পেন্ডিং সাবমিশন সংখ্যা আনার জন্য
  app.get(
    "/admin/total-pending-submissions",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
      try {
        const count = await submissionCollection.countDocuments({
          status: "pending",
        });
        res.send({ count });
      } catch (error) {
        console.error("Error fetching total pending submissions:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    }
  );

  // সমস্ত পেন্ডিং উইথড্রয়াল রিকোয়েস্ট আনার জন্য
  app.get(
    "/admin/withdrawal-requests",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
      try {
        const requests = await withdrawalsCollection
          .find({ status: "pending" })
          .toArray();
        res.send(requests);
      } catch (error) {
        console.error("Error fetching withdrawal requests:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    }
  );

  // উইথড্রয়াল রিকোয়েস্ট অ্যাপ্রুভ করার জন্য
  app.patch(
    "/admin/approve-withdrawal/:id",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
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

        // --- Notification: Withdrawal Approved for Worker ---
        await notificationsCollection.insertOne({
          userEmail: withdrawal.worker_email,
          message: `Your ${withdrawal.withdrawal_amount} USD withdrawal has been successfully approved!`,
          type: "withdrawal_approved",
          read: false,
          timestamp: new Date(),
          relatedEntityId: id, // withdrawal ID
          link: `/dashboard/worker-withdrawals`, // Link to worker's withdrawal history
        });

        // নোট: কয়েন worker/withdraw এন্ডপয়েন্টেই কাটা হয়েছে, তাই এখানে আর কাটার প্রয়োজন নেই।

        res
          .status(200)
          .send({ message: "Withdrawal approved successfully!", result });
      } catch (error) {
        console.error("Error approving withdrawal request:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    }
  );

  // উইথড্রয়াল রিকোয়েস্ট রিজেক্ট করার জন্য (এবং কয়েন ফেরত দেওয়ার জন্য)
  app.patch(
    "/admin/reject-withdrawal/:id",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
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

        // --- Notification: Withdrawal Rejected for Worker ---
        await notificationsCollection.insertOne({
          userEmail: withdrawal.worker_email,
          message: `Your ${withdrawal.withdrawal_amount} USD withdrawal request was rejected. Your coins have been refunded.`,
          type: "withdrawal_rejected",
          read: false,
          timestamp: new Date(),
          relatedEntityId: id, // withdrawal ID
          link: `/dashboard/worker-withdrawals`, // Link to worker's withdrawal history
        });

        res.send({
          message: "Withdrawal request rejected and coins refunded.",
          workerEmail: withdrawal.worker_email,
        });
      } catch (error) {
        console.error("Error rejecting withdrawal request:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    }
  );

  // সমস্ত পেন্ডিং সাবমিশন আনার জন্য (অ্যাডমিনের সমস্ত সাবমিশন দেখার জন্য)
  app.get(
    "/admin/all-pending-submissions",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
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
    }
  );

  app.get("/my-coins", async (req, res) => {
    const email = req.query.email;
    const user = await usersCollection.findOne({ email });
    res.send({ currentCoin: user?.coin || 0 });
  });
  app.get("/worker-coins", verifyToken, async (req, res) => {
    const email = req.query.email;
    const user = await usersCollection.findOne({ email });
    res.send({ currentCoin: user?.coin || 0 });
  });

  app.patch("/update-coin", verifyToken, async (req, res) => {
    const { email, addedCoin } = req.body;
    const result = await usersCollection.updateOne(
      { email },
      { $inc: { coin: parseFloat(addedCoin) || 0 } }
    );
    res.send(result);
  });

  app.patch("/decrease-coin/:email", verifyToken, async (req, res) => {
    const { coinToUpdate, status } = req.body;
    const result = await usersCollection.updateOne(
      { email: req.params.email },
      { $inc: { coin: status === "decrease" ? -coinToUpdate : coinToUpdate } }
    );
    res.send(result);
  });

  // --- Tasks ---
  app.post("/add-task", verifyToken, verifyBuyer, async (req, res) => {
    const result = await taskCollection.insertOne(req.body);
    res.send(result);
  });

  app.get("/my-tasks/:email", verifyToken, verifyBuyer, async (req, res) => {
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
  app.post("/submit-task", verifyToken, verifyWorker, async (req, res) => {
    const submission = req?.body;
    const result = await submissionCollection.insertOne(req.body);

    // Fetch task details to get buyer's email and task title
    const task = await taskCollection.findOne({
      _id: new ObjectId(submission.task_id),
    });

    // --- Notification: New Task Submission for Buyer ---
    if (task && task.buyer && task.buyer.email) {
      await notificationsCollection.insertOne({
        userEmail: task.buyer.email, // Buyer's email
        message: `A new submission has been received for your task: "${task.taskTitle}".`,
        type: "new_submission",
        read: false,
        timestamp: new Date(),
        relatedEntityId: result.insertedId, // submission ID
        link: `/dashboard/pending-submissions`, // Link to buyer's pending submissions page
      });
    }

    res.send(result);
  });

  app.get("/submissionData", async (req, res) => {
    const worker_email = req?.query?.worker_email;
    const result = await submissionCollection
      .find({ worker_email: worker_email })
      .toArray();
    res.send(result);
  });

  // নতুন এন্ডপয়েন্ট: নির্দিষ্ট বায়ারেApproved করা সাবমিশনগুলো পাওয়ার জন্য
  app.get(
    "/buyer-approved-submissions",
    verifyToken,
    verifyBuyer,
    async (req, res) => {
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
    }
  );

  app.get(
    "/pending-submissions",
    verifyToken,
    verifyBuyer,
    async (req, res) => {
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
    }
  );

  app.patch(
    "/approve-submission/:id",
    verifyToken,
    verifyBuyer,
    async (req, res) => {
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

      // --- Notification: Task Approved for Worker ---
      const task = await taskCollection.findOne({
        _id: new ObjectId(sub.task_id),
      });
      await notificationsCollection.insertOne({
        userEmail: sub.worker_email,
        message: `Your task "${
          task?.task_title || "a task"
        }" has been approved! You received ${sub.payable_amount} coins.`,
        type: "task_approved",
        read: false,
        timestamp: new Date(),
        relatedEntityId: new ObjectId(sub.task_id),
        link: `/dashboard/my-submissions`, // Link to worker's submissions page
      });

      res.send({ message: "Approved", worker_email: sub.worker_email });
    }
  );

  app.patch(
    "/reject-submission/:id",
    verifyToken,
    verifyBuyer,
    async (req, res) => {
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

      // --- Notification: Task Rejected for Worker ---
      const task = await taskCollection.findOne({
        _id: new ObjectId(sub.task_id),
      });
      await notificationsCollection.insertOne({
        userEmail: sub.worker_email,
        message: `Your task "${
          task?.task_title || "a task"
        }" has been rejected.`,
        type: "task_rejected",
        read: false,
        timestamp: new Date(),
        relatedEntityId: new ObjectId(sub.task_id),
        link: `/dashboard/my-submissions`, // Link to worker's submissions page
      });

      res.send({ message: "Rejected", task_id: sub.task_id });
    }
  );

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

  app.post("/save-purchase", verifyToken, async (req, res) => {
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
  app.get("/transactions-admin", verifyToken, verifyAdmin, async (req, res) => {
    const result = await purchasedCoinCollection.find().toArray();
    res.send(result);
  });

  app.get("/transactions", verifyToken, verifyBuyer, async (req, res) => {
    const result = await purchasedCoinCollection.find().toArray();
    res.send(result);
  });

  // --- Backend Notification Endpoints & Logic ---

  // --- Notifications Endpoints ---
  // Get all notifications for a specific user
  app.get("/notifications", verifyToken, async (req, res) => {
    try {
      const userEmail = req.query.email;
      if (!userEmail || userEmail !== req.user.email) {
        return res
          .status(403)
          .send({
            message:
              "Forbidden access: Cannot view other users' notifications.",
          });
      }

      const notifications = await notificationsCollection
        .find({ userEmail: userEmail })
        .sort({ timestamp: -1 })
        .toArray();

      res.send(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // Mark a specific notification as 'read'
  app.patch("/notifications/mark-read/:id", verifyToken, async (req, res) => {
    try {
      const id = new ObjectId(req.params.id);
      const userEmail = req.user.email;

      const result = await notificationsCollection.updateOne(
        { _id: id, userEmail: userEmail },
        { $set: { read: true } }
      );

      if (result.modifiedCount > 0) {
        res.send({ message: "Notification marked as read." });
      } else {
        res
          .status(404)
          .send({ message: "Notification not found or not authorized." });
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // Mark all notifications for a user as 'read'
  app.patch("/notifications/mark-all-read", verifyToken, async (req, res) => {
    try {
      const userEmail = req.user.email;

      const result = await notificationsCollection.updateMany(
        { userEmail: userEmail, read: false },
        { $set: { read: true } }
      );

      res.send({
        message: `${result.modifiedCount} notifications marked as read.`,
      });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
  });

  // Delete a specific notification (optional)
  app.delete("/notifications/:id", verifyToken, async (req, res) => {
    try {
      const id = new ObjectId(req.params.id);
      const userEmail = req.user.email;

      const result = await notificationsCollection.deleteOne({
        _id: id,
        userEmail: userEmail,
      });

      if (result.deletedCount > 0) {
        res.send({ message: "Notification deleted successfully." });
      } else {
        res
          .status(404)
          .send({ message: "Notification not found or not authorized." });
      }
    } catch (error) {
      console.error("Error deleting notification:", error);
      res.status(500).send({ message: "Internal Server Error" });
    }
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
