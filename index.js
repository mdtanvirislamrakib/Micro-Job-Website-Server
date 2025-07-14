require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const e = require("express");

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
      res.send(result)
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
