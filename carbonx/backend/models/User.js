const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        carbonxId: {
            type: String,
            unique: true,
            required: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            unique: true,
            required: true,
            lowercase: true,
            trim: true
        },

        passwordHash: {
            type: String,
            required: true
        },

        walletAddress: {
            type: String,
            default: null
        },

        participantType: {
            type: String,
            enum: [
                "individual",
                "institution",
                "verifier",
                "project_developer"
            ],
            default: "individual"
        },

        primaryActivity: {
            type: String,
            default: null
        },

        role: {
            type: String,
            enum: [
                "citizen",
                "admin",
                "verifier"
            ],
            default: "citizen"
        },

        isVerified: {
            type: Boolean,
            default: false
        },

        profile: {
            location: String,
            avatar: String
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);
