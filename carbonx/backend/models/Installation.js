const mongoose = require("mongoose");

const installationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        installationName: {
            type: String,
            required: [true, "Installation name is required"],
            trim: true
        },

        capacityKw: {
            type: Number,
            required: [true, "Installation capacity in kW is required"],
            min: [0.01, "Capacity must be greater than zero"]
        },

        location: {
            address: {
                type: String,
                required: [true, "Installation address is required"],
                trim: true
            },
            city: String,
            state: String,
            country: {
                type: String,
                default: "India"
            },
            latitude: Number,
            longitude: Number
        },

        meterIdentifier: {
            type: String,
            trim: true,
            default: ""
        },

        commissioningDate: {
            type: Date
        },

        gridConfiguration: {
            type: String,
            enum: ["grid_connected", "off_grid", "hybrid"],
            default: "grid_connected"
        },

        inverterDetails: {
            type: String,
            trim: true,
            default: ""
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Installation", installationSchema);
