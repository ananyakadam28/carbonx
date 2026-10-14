const mongoose = require("mongoose");

const evidenceSchema =
    new mongoose.Schema(
        {
            activityId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "Activity",

                required: true
            },

            userId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "User",

                required: true
            },

            fileName: String,

            fileType: String,

            fileSize: Number,

            fileUrl: String,

            documentType: String,

            hash: String,

            verificationStatus: {
                type: String,

                enum: [
                    "pending",
                    "verified",
                    "rejected"
                ],

                default: "pending"
            }
        },

        {
            timestamps: true
        }
    );

module.exports =
    mongoose.model(
        "Evidence",
        evidenceSchema
    );