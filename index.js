require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.STRIPE_SK_KEY);

const port = process.env.PORT || 3000;
const app = express();
// middleware
const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(cookieParser());

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

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  const taskCollection = client.db("MicroJob").collection("tasks");
  const coinCollection = client.db("MicroJob").collection("coin");
  const purchasedCoinCollection = client
    .db("MicroJob")
    .collection("purchasedCoin");
  const usersCollection = client.db("MicroJob").collection("users");

  try {
    // Generate jwt token
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });

      const isProduction = process.env.NODE_ENV === "production";

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "Lax", // Changed to Lax for better local dev compatibility
        })
        .send({ success: true });
    });
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        const isProduction = process.env.NODE_ENV === "production";
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: isProduction,
            httpOnly: true, // It's good practice to include httpOnly here too
            sameSite: isProduction ? "none" : "Lax", // Changed to Lax
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // --- Start of /users endpoint changes ---
    // app.post("/users", async (req, res) => {
    //   const userData = req.body;
    //   console.log("Received userData (original):", userData); // Debugging original data

    //   userData.created_at = new Date().toISOString();
    //   userData.last_login = new Date().toISOString();

    //   // Determine the role. If client sends a role, use it. Otherwise, default to "worker".
    //   // You might want to add validation if only specific roles are allowed.
    //   userData.role = req?.body?.role || "worker";

    //   const filter = { email: userData?.email };
    //   const userAlreadyExists = await usersCollection.findOne(filter);

    //   if (userAlreadyExists) {
    //     // User already exists, only update last_login
    //     // We do NOT update 'coin' here, as it would reset the existing balance.
    //     // If you intend to increment coins on every login, you'd use $inc.
    //     const updateDoc = {
    //       $set: {
    //         last_login: new Date().toISOString(),
    //       },
    //     };
    //     console.log(
    //       "User exists, updating last_login:",
    //       userAlreadyExists.email
    //     );
    //     const result = await usersCollection.updateOne(filter, updateDoc);
    //     return res.send(result);
    //   } else {
    //     // New user registration, assign initial coins based on role
    //     let initialCoins = 0;
    //     if (userData.role === "worker") {
    //       initialCoins = 10;
    //     } else if (userData.role === "buyer") {
    //       // Assuming 'buyer' is the other possible role
    //       initialCoins = 50;
    //     }
    //     // If role is neither, or any other role, initialCoins remains 0.

    //     userData.coin = initialCoins; // Set the initial coin value for new users

    //     console.log(
    //       "New user registering with role:",
    //       userData.role,
    //       "and initial coins:",
    //       userData.coin
    //     );
    //     const result = await usersCollection.insertOne(userData);
    //     return res.send(result);
    //   }
    // });

    // আপনার server.js ফাইল থেকে
    app.post("/users", async (req, res) => {
      const userData = req.body;
      console.log("Received userData (original):", userData);

      userData.created_at = new Date().toISOString();
      userData.last_login = new Date().toISOString();

      // Determine the role. If client sends a role, use it. Otherwise, default to "worker".
      userData.role = req?.body?.role || "worker"; // এখানে ক্লায়েন্ট থেকে আসা role ব্যবহৃত হবে

      const filter = { email: userData?.email };
      const userAlreadyExists = await usersCollection.findOne(filter);

      if (userAlreadyExists) {
        // ইউজার আগে থেকেই থাকলে, শুধু last_login আপডেট হবে। কয়েন রিসেট হবে না।
        const updateDoc = {
          $set: {
            last_login: new Date().toISOString(),
          },
        };
        console.log(
          "User exists, updating last_login:",
          userAlreadyExists.email
        );
        const result = await usersCollection.updateOne(filter, updateDoc);
        return res.send(result);
      } else {
        // নতুন ইউজার রেজিস্ট্রেশন, রোল অনুযায়ী ইনিশিয়াল কয়েন সেট হবে
        let initialCoins = 0;
        if (userData.role === "worker") {
          initialCoins = 10;
        } else if (userData.role === "buyer") {
          initialCoins = 50;
        }
        userData.coin = initialCoins; // নতুন ইউজারের জন্য কয়েন সেট হচ্ছে

        console.log(
          "New user registering with role:",
          userData.role,
          "and initial coins:",
          userData.coin
        );
        const result = await usersCollection.insertOne(userData);
        return res.send(result);
      }
    });
    // --- End of /users endpoint changes ---

    app.patch("/update-coin", async (req, res) => {
      const { email, addedCoin } = req.body;

      // Ensure addedCoin is a number, default to 0 if NaN or invalid
      const parsedAddedCoin = parseFloat(addedCoin) || 0;

      if (!email || isNaN(parsedAddedCoin)) {
        return res.status(400).send({
          error: "Invalid request: Email or addedCoin missing/invalid",
        });
      }

      const filter = { email: email };
      const update = {
        $inc: { coin: parsedAddedCoin },
      };

      console.log(`Updating coin for ${email} by ${parsedAddedCoin}`); // Debugging
      const result = await usersCollection.updateOne(filter, update);
      res.send(result);
    });

    // get users role
    app.get("/user/role/:email", async (req, res) => {
      const email = req?.params?.email;
      const result = await usersCollection.findOne({ email });
      if (!result) return res.status(404).send({ message: "User not found" });
      res.send({ role: result?.role });
    });

    // add a tasks in DB
    app.post("/add-task", async (req, res) => {
      const task = req.body;
      const result = await taskCollection.insertOne(task);
      res.send(result);
    });

    // decrease coin amount when buyer add a task
    app.patch("/decrease-coin/:email", async (req, res) => {
      const { coinToUpdate, status } = req?.body;
      const email = req?.params?.email;

      // Ensure coinToUpdate is a number, default to 0 if NaN or invalid
      const parsedCoinToUpdate = parseFloat(coinToUpdate) || 0;

      if (!email || isNaN(parsedCoinToUpdate)) {
        return res.status(400).send({
          error: "Invalid request: Email or coin amount missing/invalid",
        });
      }

      const filter = { email };
      const updateDoc = {
        $inc: {
          coin:
            status === "decrease" ? -parsedCoinToUpdate : parsedCoinToUpdate,
        },
      };
      console.log(
        `Processing decrease/increase coin for ${email}. Status: ${status}, Amount: ${parsedCoinToUpdate}`
      ); // Debugging
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // my added tasks in DB
    app.get("/my-tasks/:email", async (req, res) => {
      const email = req?.params?.email;
      const filter = { "buyer.email": email };
      const result = await taskCollection.find(filter).toArray();
      res.send(result);
    });

    // Update an existing task (using email from header for authorization)
    app.patch("/tasks/:id", async (req, res) => {
      const taskId = req.params.id;
      const updateTasks = req?.body;
      delete updateTasks._id;

      // Ensure the user is the owner of the task
      const query = { _id: new ObjectId(taskId) };
      const updateDoc = {
        $set: updateTasks,
      };

      const result = await taskCollection.updateOne(query, updateDoc);

      res.send(result);
    });

    // DELETE endpoint for deleting a task by ID
    app.delete("/tasks/:id", async (req, res) => {
      const taskId = req.params.id;

      const query = { _id: new ObjectId(taskId) };
      const result = await taskCollection.deleteOne(query);
      res.send(result);
    });

    // show all tasks
    app.get("/tasks", async (req, res) => {
      const filter = {
        requiredWorkers: {
          $gt: 0,
        },
      };
      const result = await taskCollection.find(filter).toArray();
      res.send(result);
    });

    app.get("/task/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const task = await taskCollection.findOne(query);
      res.send(task);
    });

    // get all coins
    app.get("/coins", async (req, res) => {
      const result = await coinCollection.find().toArray();
      res.send(result);
    });

    // create create-payment-intent for purchase coin
    app.post("/create-payment-intent", async (req, res) => {
      const { packageId } = req?.body;

      const filter = { id: packageId };
      const purchaseCoin = await coinCollection.findOne(filter);
      // Ensure price is a number, default to 0 if NaN or invalid
      const price = parseFloat(purchaseCoin?.price) * 100 || 0;

      if (price <= 0) {
        return res
          .status(400)
          .send({ error: "Invalid price for payment intent" });
      }

      // Stripe......
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({ clientSecret: paymentIntent?.client_secret });
    });

    // Save purchase info and update user coin balance
    app.post("/save-purchase", async (req, res) => {
      try {
        const purchasedCoin = req?.body;

        // Ensure coinsPurchased is a number, default to 0 if NaN or invalid
        purchasedCoin.coinsPurchased =
          parseFloat(purchasedCoin.coinsPurchased) || 0;

        if (!purchasedCoin?.userEmail || purchasedCoin?.coinsPurchased < 0) {
          return res.status(400).send({ error: "Invalid purchase data" });
        }

        const result = await purchasedCoinCollection.insertOne(purchasedCoin);

        // Increment user's coin in users collection
        const updateCoin = await usersCollection.updateOne(
          { email: purchasedCoin.userEmail },
          { $inc: { coin: purchasedCoin.coinsPurchased } }
        );

        res.send({
          success: true,
          purchaseSaved: result,
          userCoinUpdated: updateCoin,
        });
      } catch (error) {
        console.error("Save Purchase Error:", error);
        res
          .status(500)
          .send({ error: "Failed to save purchase or update coin." });
      }
    });

    // get all transaction from Db
    app.get("/transactions", async (req, res) => {
      const result = await purchasedCoinCollection.find().toArray();
      res.send(result);
    });

    // get purchased coin data by login user (from user's current coin balance)
    app.get("/my-coins", async (req, res) => {
      const email = req?.query?.email;

      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }

      const user = await usersCollection.findOne({ email });

      if (!user) {
        // If user not found, return 0 coins
        return res.status(200).send({
          currentCoin: 0,
          message: "User not found, returning 0 coins",
        });
      }

      // Ensure that user.coin is a number, default to 0 if NaN or invalid
      const currentCoinValue = parseFloat(user.coin) || 0;
      res.send({ currentCoin: currentCoinValue });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // In a serverless environment or for long-running apps, you might manage this differently.
    // await client.close(); // Only close if exiting application.
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Micro job Server..");
});

app.listen(port, () => {
  console.log(`Micro Job is running on port ${port}`);
});
