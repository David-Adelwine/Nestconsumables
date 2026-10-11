const express = require("express");
const cors = require("cors");
const healthRouter = require("./routes/health");

const app = express();
const port = Number(process.env.API_PORT) || 4000;

app.use(
  cors({
    origin: process.env.WEB_ORIGIN || "http://localhost:3000",
  }),
);
app.use(express.json());

app.get("/", (_request, response) => {
  response.json({ message: "Consumables API is running." });
});

app.use("/api/health", healthRouter);

app.listen(port, () => {
  console.log(`Consumables API listening at http://localhost:${port}`);
});