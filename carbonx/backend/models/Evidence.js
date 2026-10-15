const mongoose = require("mongoose");

const evidenceSchema =
    new mongoose.Schema(
        {
            activityId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "Activity",

                required: false,
                default: null
            },

            userId: {
                type:
                    mongoose.Schema.Types.ObjectId,

                ref: "User",

                required: true
            },

            fileName: String,

            originalName: String,

            fileType: String,

            fileSize: Number,

            fileUrl: String,

            storagePath: String,

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