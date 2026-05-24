import express from "express";
import {
    registerUser,
    getUser,
    loginUser,
    getProfile
} from "../controllers/userController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.route("/register").post(registerUser);
router.route("/login").post(loginUser);
router.route("/").get(requireAuth, getUser);
router.route("/profile").get(requireAuth, getProfile);

export default router;