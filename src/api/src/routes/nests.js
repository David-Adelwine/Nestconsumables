const express = require("express");
const supabase = require("../config/supabase");

const router = express.Router();

router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("nests")
    .select("id, code, name")
    .order("code", { ascending: true });

  if (error) {
    console.error("Failed to load nests:", error.message);

    return res.status(500).json({
      error: "Unable to load nests",
    });
  }

  return res.status(200).json({
    nests: data,
  });
});

module.exports = router;