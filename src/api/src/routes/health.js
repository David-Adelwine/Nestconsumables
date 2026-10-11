const express = require("express");

const router = express.Router();

router.get("/", (_request, response) => {
  response.json({
    status: "ok",
    service: "consumables-api",
  });
});

module.exports = router;