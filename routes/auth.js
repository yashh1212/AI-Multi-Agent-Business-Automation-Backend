import express from "express";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const router = express.Router();
router.post("/login", async(req, res) => {
  const { email, password } = req.body;
  try{

      if(email === "" || password === "") {
          return res.status(400).json({ success: false, message: "Email and password are required" });
        }
        if(!User.findOne(email)){
            return res.status(400).json({ success: false, message: "Invalid Credentials" });
        }
        const user = await User.findOne({ email});
        const pass= user.password;
        if(!bcrypt.compareSync(password, pass)){
            return res.status(400).json({ success: false, message: "Invalid Credentials" });
        }
        const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
        return res.json({ success: true, token });
        
    }catch(err){
        console.error("Login error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
})
router.post("/register", async(req, res) => {
    const { email, password, name, role } = req.body;
    try{
        if(email === "" || password === "" || name === "") {
          return res.status(400).json({ success: false, message: "Email, password and name are required" });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          return res.status(400).json({ success: false, message: "Email already in use" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ email, password: hashedPassword, name, role });
        await newUser.save();
        return res.status(201).json({ success: true, message: "User registered successfully" });
    }catch(err){
        console.error("Registration error:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

export default router;