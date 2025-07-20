# 🛡️ Micro-Task & Earning Platform - Server Side 🌐

## GitHub Repository (Server-Side):
[[Server Repo Link](https://github.com/Programming-Hero-Web-Course4/b11a12-server-side-mdtanvirislamrakib)]

---

## 🌟 Project Overview
This repository contains the robust and secure backend for the **Micro-Task & Earning Platform**, built with the MERN stack. It serves as the central hub for all business logic, data persistence, and API services, managing user roles (Worker, Buyer, Admin), task lifecycles, and financial transactions. This backend is engineered for scalability, security, and efficient data handling, making it the backbone of the entire platform.

## ✨ Key Features & API Design

This backend demonstrates a strong command of server-side development principles, including:

* **RESTful API Architecture:** A well-structured set of RESTful APIs provides clear, efficient, and scalable interaction with the client-side.
* **Advanced User Authentication & Authorization:** Implemented with `jsonwebtoken` and `cookie-parser` for secure, stateless authentication. Custom middleware enforces **Role-Based Access Control (RBAC)** for Worker, Buyer, and Admin, ensuring that only authenticated and authorized users can access specific routes. Provides detailed error responses (401 Unauthorized, 400 Bad Request for invalid tokens, 403 Forbidden for insufficient permissions) for robust security.
* **Comprehensive User Management:** Manages user registration, login, profile data, and dynamic role assignments. Handles default coin allocation upon registration (10 for Workers, 50 for Buyers) and updates user coin balances across various transactions.
* **Dynamic Task Lifecycle Management:**
    * **Task Creation:** API for buyers to create tasks with specified `required_workers` and `payable_amount`. Incorporates server-side validation and atomic coin deduction from the buyer's balance.
    * **Task Retrieval & Filtering:** Endpoints to fetch tasks, allowing workers to discover available opportunities efficiently.
    * **Task Updates & Deletion:** APIs for buyers to modify their tasks and for admins to manage all tasks, including automated coin refunds for deleted/uncompleted tasks.
* **Robust Submission Workflow:** Manages worker submissions for tasks. Buyers can retrieve and manage pending submissions, with backend logic for approving (crediting worker coins) or rejecting (re-opening task slots) submissions.
* **Secure Payment Integration:** Seamless integration with **Stripe (`stripe` npm package)** for processing coin purchases, ensuring secure and reliable financial transactions. Handles webhook events for payment confirmations.
* **Worker Withdrawal System:** Manages worker withdrawal requests based on a defined business logic (20 coins = $1, with a minimum withdrawal threshold of 200 coins). Admin APIs are provided to process and approve these requests, accurately adjusting worker coin balances.
* **Centralized Notification Service:** Implements backend logic to trigger and persist notifications in a dedicated MongoDB collection. Notifications are generated for key events such as submission approvals/rejections (to workers), new task submissions (to buyers), and withdrawal request approvals (to workers), ready for consumption by the client.
* **Efficient Data Storage:** Utilizes `mongodb` (via `mongoose` ODM) for flexible and scalable document storage, optimized for performance.
* **Environment Configuration:** Securely manages sensitive data (database URIs, API keys, JWT secrets) using `dotenv`, ensuring that credentials are not hardcoded.
* **CORS Management:** Configured with `cors` middleware to enable secure communication between the client and server.

## 🛠️ Technologies Used (Server-Side)

* **Node.js (LTS):** The JavaScript runtime environment.
* **Express.js (v5.1.0):** Fast, minimalist web framework for building RESTful APIs.
* **MongoDB (v6.17.0):** NoSQL database for data persistence.
* **Mongoose (implicitly used with mongodb v6.17.0):** Elegant MongoDB object modeling for Node.js.
* **JSON Web Tokens (jsonwebtoken v9.0.2):** For secure, stateless authentication.
* **Stripe (v18.3.0):** Official Node.js library for Stripe payment processing.
* **Cookie Parser (v1.4.7):** Middleware to parse HTTP cookies.
* **CORS (v2.8.5):** Node.js middleware for enabling Cross-Origin Resource Sharing.
* **Dotenv (v17.2.0):** Loads environment variables from a `.env` file.
* **@tanstack/react-query (v5.83.0):** (Note: Primarily a client-side library, its inclusion in server-side dependencies suggests potential isomorphic data fetching patterns or specific build configurations.)

## 🚀 Getting Started

To get the server-side application running locally:

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/Programming-Hero-Web-Course4/b11a12-server-side-mdtanvirislamrakib]
    cd [b11a12-server-side-mdtanvirislamrakib]
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
    * **DATABASE_URI:** Your MongoDB connection string (e.g., `mongodb+srv://user:password@cluster.mongodb.net/microtaskdb?retryWrites=true&w=majority`).
    * **JWT_SECRET:** A strong, random string used to sign your JWTs.
    * **STRIPE_SECRET_KEY:** Your secret key from Stripe.
4.  **Start the MongoDB Server:** Ensure your local MongoDB instance is running, or that your cloud MongoDB (e.g., MongoDB Atlas) is accessible.
5.  **Run the development server:**
    ```bash
    npm start
    # or
    node index.js
    ```
    The server will typically listen on `http://localhost:3000`.

## 🤝 Contributing
We welcome contributions to enhance this platform! Please fork the repository, make your changes, and submit a pull request for review. Ensure your code adheres to best practices and includes relevant tests.

## 🔮 Future Enhancements
* **WebSocket Integration:** Implement WebSockets (e.g., Socket.IO) for real-time notification delivery and live updates across the platform.
* **Email Service Integration:** Integrate with email APIs (e.g., SendGrid, AWS SES) for automated transactional emails (e.g., payment confirmations, task status updates).
* **Advanced Querying:** Leverage MongoDB's aggregation framework for more complex data analytics and reporting for admin and user dashboards.
* **Comprehensive Logging:** Implement a robust logging system for monitoring server health and debugging.

## 📧 Contact
For any professional inquiries or collaboration opportunities, please open an issue on this GitHub repository.