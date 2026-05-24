import express from "express";
import { generateChallange, judgeSolution } from "../controllers/challengeController.js";
import { requireAuth } from "../middleware/auth.js";
const router = express.Router();

router.route("/generate").get(generateChallange);
router.route("/judge").post(requireAuth, judgeSolution);

export default router;