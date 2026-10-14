const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Wallet = require("../models/Wallet");

const generateCarbonXId = () => {
    const a = Math.floor(1000 + Math.random() * 9000);
    const b = Math.floor(1000 + Math.random() * 9000);
    return `CX-${a}-${b}`;
};

const normalizeParticipantType = (value) => {
    const v = String(value || "").trim().toLowerCase();

    const map = {
        "individual contributor": "individual",
        "individual": "individual",
        "institution / corporate": "institution",
        "institution": "institution",
        "mrv verifier node": "verifier",
        "verifier": "verifier",
        "project developer": "project_developer",
        "project_developer": "project_developer"
    };

    return map[v] || "individual";
};

const publicUser = (user) => ({
    id: user._id,
    userId: user.carbonxId,
    carbonxId: user.carbonxId,
    name: user.name,
    email: user.email,
    walletAddress: user.walletAddress,
    participantType: user.participantType,
    primaryActivity: user.primaryActivity,
    role: user.role
});

const signToken = (user) =>
    jwt.sign(
        {
            userId: user._id.toString(),
            carbonxId: user.carbonxId,
            role: user.role
        },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

exports.register = async (req, res) => {
    try {
        const {
            name,
            email,
            password,
            participantType,
            primaryActivity,
            walletAddress,
            wallet
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(400).json({
                message: "Email already registered"
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        let carbonxId = generateCarbonXId();

        // Avoid the extremely unlikely chance of an ID collision.
        while (await User.exists({ carbonxId })) {
            carbonxId = generateCarbonXId();
        }

        const resolvedWallet =
            String(walletAddress || wallet || "").trim() || null;

        const user = await User.create({
            carbonxId,
            name: String(name).trim(),
            email: normalizedEmail,
            passwordHash,
            walletAddress: resolvedWallet,
            participantType: normalizeParticipantType(participantType),
            primaryActivity: primaryActivity
                ? String(primaryActivity).trim()
                : (req.body.activityFocus
                    ? String(req.body.activityFocus).trim()
                    : null)
        });

        // Every CarbonX account gets a wallet automatically.
        await Wallet.create({
            userId: user._id,
            walletAddress: resolvedWallet
        });

        const token = signToken(user);

        return res.status(201).json({
            success: true,
            message: "Registration successful",
            token,
            user: publicUser(user)
        });

    } catch (error) {
        console.error("Registration error:", error);

        if (error.code === 11000) {
            return res.status(400).json({
                message: "An account with those details already exists"
            });
        }

        return res.status(500).json({
            message: "Registration failed",
            error: error.message
        });
    }
};

exports.login = async (req, res) => {
    try {
        const {
            userId,
            email,
            password,
            walletAddress,
            wallet
        } = req.body;

        const identifier =
            String(userId || email || "").trim();

        if (!identifier || !password) {
            return res.status(400).json({
                message: "CarbonX User ID/email and password are required"
            });
        }

        const query = identifier.toLowerCase().startsWith("cx-")
            ? { carbonxId: identifier.toUpperCase() }
            : { email: identifier.toLowerCase() };

        const user = await User.findOne(query);

        if (!user) {
            return res.status(401).json({
                message: "Invalid CarbonX User ID/email or password"
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid CarbonX User ID/email or password"
            });
        }

        const providedWallet =
            String(walletAddress || wallet || "").trim();

        if (
            providedWallet &&
            user.walletAddress &&
            providedWallet.toLowerCase() !==
            user.walletAddress.toLowerCase()
        ) {
            return res.status(401).json({
                message: "Wallet address does not match this account"
            });
        }

        // Repair/create the wallet for older accounts that were created
        // before wallet creation was added to registration.
        await Wallet.findOneAndUpdate(
            { userId: user._id },
            {
                $setOnInsert: {
                    userId: user._id,
                    walletAddress: user.walletAddress || providedWallet || null
                }
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        const token = signToken(user);

        return res.json({
            success: true,
            message: "Login successful",
            token,
            user: publicUser(user)
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            message: "Login failed",
            error: error.message
        });
    }
};

exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select("-passwordHash");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        res.json({
            success: true,
            user: publicUser(user)
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch user"
        });
    }
};
