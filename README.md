<<<<<<< HEAD
# 🚀 Micro-Task & Earning Platform - Server Side 🌐
=======
# 🛡️ Micro-Task & Earning Platform - Server Side 🌐
>>>>>>> 0f59a3685531eb6ed4b30c0eb3418dc810b9f1bb

## GitHub Repository (Server-Side):
[https://github.com/Programming-Hero-Web-Course4/b11a12-server-side-mdtanvirislamrakib](https://github.com/Programming-Hero-Web-Course4/b11a12-server-side-mdtanvirislamrakib)

## Backend API (Live Link):
[https://microjob-website-server.vercel.app](https://microjob-website-server.vercel.app)

## Admin & Test User Credentials:
* **Admin Email:** `tanvirislamrakib93@gmail.com`
* **Admin Password:** `A@a123456`
* **Sample Buyer Email:** `rakib7@gmail.com`
* **Sample Buyer Password:** `A@Aa123456`
* **Sample Worker Email:** `tahsin@gmail.com`
* **Sample Worker Password:** `A@a123456`

---

## 🌟 Project Overview
This repository contains the robust and secure backend for the **Micro-Task & Earning Platform**, built with the MERN stack. It serves as the central hub for all business logic, data persistence, and API services, efficiently managing user roles (Worker, Buyer, Admin), task lifecycles, and financial transactions. This backend is meticulously engineered for scalability, security, and efficient data handling, making it the foundational core of the entire platform.

## ✨ Key Features & API Design

This backend demonstrates a strong command of server-side development principles, including:

* **RESTful API Architecture:** A well-structured and intuitive set of RESTful APIs designed for clear, efficient, and scalable interaction with the client-side.
* **Advanced User Authentication & Authorization:** Implemented with `jsonwebtoken` and `cookie-parser` for secure, stateless authentication. Custom middleware rigorously enforces **Role-Based Access Control (RBAC)** for Worker, Buyer, and Admin roles, ensuring that only authenticated and authorized users can access specific resources and functionalities. It provides precise error responses (401 Unauthorized, 400 Bad Request for invalid tokens, 403 Forbidden for insufficient permissions) for enhanced security.
* **Comprehensive User Management:** Manages all aspects of user data, including secure registration, login, profile updates, and dynamic role assignments. It meticulously handles default coin allocation upon registration (10 for Workers, 50 for Buyers) and ensures accurate updates to user coin balances across all transactions.
* **Dynamic Task Lifecycle Management:**
    * **Task Creation:** Provides robust API endpoints for buyers to create detailed tasks, including specifications for `required_workers` and `payable_amount`. This process incorporates server-side validation and atomic coin deduction from the buyer's balance.
    * **Task Retrieval & Filtering:** Offers optimized endpoints to fetch task listings, enabling workers to efficiently discover and filter available opportunities.
    * **Task Updates & Deletion:** Includes APIs for buyers to modify their active tasks and for administrators to manage all tasks across the platform, with automated coin refunds for deleted or uncompleted tasks.
* **Robust Submission Workflow:** Manages the entire lifecycle of worker task submissions. Buyers can retrieve and manage pending submissions, with backend logic for approving (automatically crediting worker coins) or rejecting (re-opening task slots) submissions seamlessly.
* **Secure Payment Integration:** Features seamless integration with **Stripe (`stripe` npm package)** for secure and reliable processing of coin purchases. The backend is configured to handle Stripe webhook events for real-time payment confirmations and updates to user balances.
* **Worker Withdrawal System:** Manages worker withdrawal requests based on a clearly defined business logic (20 coins = $1, with a minimum withdrawal threshold of 200 coins). Dedicated Admin APIs facilitate the processing and approval of these requests, ensuring accurate adjustment of worker coin balances.
<<<<<<< HEAD
* **Centralized Notification Service:** Implements comprehensive backend logic to trigger and persist notifications in a dedicated MongoDB collection. Notifications are intelligently generated for key events such as submission approvals/rejections (for workers), new task submissions (for buyers), and withdrawal request approvals (for workers), designed for efficient consumption by the client.
* **Efficient Data Storage & Management:** Leverages `mongodb` (via `mongoose` ODM) for flexible and scalable document storage, optimized for performance and data integrity.
=======
>>>>>>> 0f59a3685531eb6ed4b30c0eb3418dc810b9f1bb
* **Environment Configuration:** Utilizes `dotenv` to securely manage sensitive data, including database URIs, API keys, and JWT secrets, ensuring that confidential credentials are never exposed in the codebase.
* **CORS Management:** Configured with `cors` middleware to enable secure and controlled Cross-Origin Resource Sharing, facilitating seamless communication between the client and server.

## 🛠️ Technologies Used (Server-Side)

* **Node.js (LTS):** The asynchronous, event-driven JavaScript runtime built on Chrome's V8 JavaScript engine.
* **Express.js (v5.1.0):** A fast, unopinionated, minimalist web framework for building RESTful APIs in Node.js.
* **MongoDB (v6.17.0):** A leading NoSQL, document-oriented database for high-volume data storage.
* **JSON Web Tokens (jsonwebtoken v9.0.2):** A compact, URL-safe means of representing claims to be transferred between two parties, used for secure, stateless authentication.
* **Stripe (v18.3.0):** The official Node.js library for integrating Stripe's powerful payment processing functionalities.
* **Cookie Parser (v1.4.7):** A middleware to parse HTTP cookies attached to client requests.
* **CORS (v2.8.5):** A Node.js package that provides a Connect/Express middleware to enable Cross-Origin Resource Sharing with various options.
* **Dotenv (v17.2.0):** A zero-dependency module that loads environment variables from a `.env` file into `process.env`.
* **@tanstack/react-query (v5.83.0):** *Note: While primarily a client-side data-fetching library, its inclusion in server-side dependencies may indicate specific full-stack integration patterns or server-side data hydration techniques.*

## 🚀 Getting Started

To get the server-side application running locally:

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/Programming-Hero-Web-Course4/b11a12-server-side-mdtanvirislamrakib](https://github.com/Programming-Hero-Web-Course4/b11a12-server-side-mdtanvirislamrakib)
    cd b11a12-server-side-mdtanvirislamrakib
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
3.  **Create a `.env` file:**
    In the root of the server-side directory, create a `.env` file and populate it with your environment variables.
    ```
    PORT=3000
    DATABASE_URI=your_mongodb_connection_string
    JWT_SECRET=a_very_strong_secret_key_for_jwt_signing
    STRIPE_SECRET_KEY=your_stripe_secret_key
    # Add other backend-specific environment variables (e.g., imgBB API key if used on backend)
    ```
    * **`DATABASE_URI`:** Your MongoDB connection string (e.g., `mongodb+srv://user:password@cluster.mongodb.net/microtaskdb?retryWrites=true&w=majority`).
    * **`JWT_SECRET`:** A strong, random string used to sign your JWTs.
    * **`STRIPE_SECRET_KEY`:** Your secret key obtained from Stripe.
4.  **Start the MongoDB Server:** Ensure your local MongoDB instance is running, or that your cloud MongoDB (e.g., MongoDB Atlas) is accessible.
5.  **Run the development server:**
    ```bash
    npm start
    # or
    node index.js
    ```
    The server will typically listen on `http://localhost:3000`.

## 🤝 Contributing
We welcome contributions to enhance this platform! Please fork the repository, make your changes on a new branch, and submit a pull request for review. Ensure your code adheres to best practices and includes relevant tests to maintain quality.

## 🔮 Future Enhancements
* **WebSocket Integration:** Implement WebSockets (e.g., Socket.IO) for instant, real-time notification delivery and live updates across the platform, significantly improving user experience.
* **Email Service Integration:** Integrate with robust email APIs (e.g., SendGrid, AWS SES) for automated transactional emails (e.g., payment confirmations, task status updates, password resets).
* **Advanced Querying:** Leverage MongoDB's powerful aggregation framework for more complex data analytics and reporting, providing deeper insights for admin and user dashboards.
* **Comprehensive Logging:** Implement a robust logging system using libraries like Winston or Morgan for better monitoring of server health, debugging, and audit trails.

## 📧 Contact
For any professional inquiries, collaboration opportunities, or technical discussions, please feel free to open an issue on this GitHub repository.

---
