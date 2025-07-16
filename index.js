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
  const purchasedCoinCollection = client.db("MicroJob").collection("purchasedCoin");
  const usersCollection = client.db("MicroJob").collection("users")

  try {
    // Generate jwt token
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });
    // Logout
    app.get("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // save or update user info in Db
    app.post("/users", async(req, res) => {
      const userData = req.body;
      userData.created_at = Date.now()
      userData.last_login = Date.now()
      userData.role = req?.body?.role || "worker"

      const filter = {email: userData?.email}
      const updateDoc = {
        $set: {
          last_login: Date.now()
        }
      }
      const userAlreadyExists = await usersCollection.findOne(filter)

      if(!!userAlreadyExists) {
        const result = await usersCollection.updateOne(filter, updateDoc)
        return res.send(result);
      }

      const result = await usersCollection.insertOne(userData)
      res.send(result);
    })



    // add a tasks in DB
    app.post("/add-task", async (req, res) => {
      const task = req.body;
      const result = await taskCollection.insertOne(task);
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
      const price = purchaseCoin?.price * 100;

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

    // post data who purchase coin
    app.post("/save-purchase", async (req, res) => {
      const purchasedCoin = req?.body;
      const result = await purchasedCoinCollection.insertOne(purchasedCoin);
      res.send(result);
    });

    // get all transaction from Db
    app.get("/transactions", async(req, res) => {
      const result = await purchasedCoinCollection.find().toArray()
      res.send(result)
    })


    // get puchased coin data by login user
    app.get("/my-coins", async (req, res) => {
      const email = req?.query?.email;

      if (!email) {
        return res.status(400).send({ error: "Email is required" });
      }

      const purchases = await purchasedCoinCollection.find({ userEmail: email }).toArray();
      const totalCoins = purchases.reduce((sum, item) => sum + (item.coinsPurchased || 0), 0);
      res.send(totalCoins)
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Micro job Server..");
});

app.listen(port, () => {
  console.log(`Micro Job is running on port ${port}`);
});
