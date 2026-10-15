const Installation = require("../models/Installation");

/**
 * Retrieve all installations owned by the authenticated user
 */
exports.getMyInstallations = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        const installations = await Installation.find({
            userId,
            isActive: true
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            installations,
            count: installations.length
        });
    } catch (error) {
        console.error("Fetch installations error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to retrieve solar installations",
            error: error.message
        });
    }
};

/**
 * Get a single installation by ID (enforces ownership)
 */
exports.getInstallationById = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;

        const installation = await Installation.findById(id);
        if (!installation || !installation.isActive) {
            return res.status(404).json({
                success: false,
                message: "Solar installation not found"
            });
        }

        // Enforce ownership: only the owner or an authorized verifier/admin can access
        const isOwner = installation.userId.toString() === userId;
        const isStaff = req.user?.role === "verifier" || req.user?.role === "admin";

        if (!isOwner && !isStaff) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized: You do not have permission to view this installation"
            });
        }

        res.json({
            success: true,
            installation
        });
    } catch (error) {
        console.error("Get installation error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch installation details",
            error: error.message
        });
    }
};

/**
 * Create a new solar installation
 */
exports.createInstallation = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        const {
            installationName,
            capacityKw,
            location,
            meterIdentifier,
            commissioningDate,
            gridConfiguration,
            inverterDetails
        } = req.body;

        if (!installationName || !String(installationName).trim()) {
            return res.status(400).json({
                success: false,
                message: "Installation name or nickname is required"
            });
        }

        const capacity = Number(capacityKw);
        if (!Number.isFinite(capacity) || capacity <= 0) {
            return res.status(400).json({
                success: false,
                message: "Installation capacity must be a positive number in kW"
            });
        }

        const address = typeof location === "string" ? location : location?.address;
        if (!address || !String(address).trim()) {
            return res.status(400).json({
                success: false,
                message: "Installation location / address is required"
            });
        }

        const normalizedGridConfig = ["grid_connected", "off_grid", "hybrid"].includes(gridConfiguration)
            ? gridConfiguration
            : "grid_connected";

        const installation = await Installation.create({
            userId, // Strictly derived from authenticated session
            installationName: String(installationName).trim(),
            capacityKw: capacity,
            location: {
                address: String(address).trim(),
                city: location?.city ? String(location.city).trim() : undefined,
                state: location?.state ? String(location.state).trim() : undefined,
                country: location?.country ? String(location.country).trim() : "India",
                latitude: Number(location?.latitude) || undefined,
                longitude: Number(location?.longitude) || undefined
            },
            meterIdentifier: meterIdentifier ? String(meterIdentifier).trim() : "",
            commissioningDate: commissioningDate ? new Date(commissioningDate) : undefined,
            gridConfiguration: normalizedGridConfig,
            inverterDetails: inverterDetails ? String(inverterDetails).trim() : "",
            isActive: true
        });

        res.status(201).json({
            success: true,
            message: "Solar installation registered successfully",
            installation
        });
    } catch (error) {
        console.error("Create installation error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to create solar installation",
            error: error.message
        });
    }
};

/**
 * Update an existing solar installation (enforces ownership)
 */
exports.updateInstallation = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;

        const installation = await Installation.findById(id);
        if (!installation || !installation.isActive) {
            return res.status(404).json({
                success: false,
                message: "Solar installation not found"
            });
        }

        if (installation.userId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized: You do not own this installation"
            });
        }

        const {
            installationName,
            capacityKw,
            location,
            meterIdentifier,
            commissioningDate,
            gridConfiguration,
            inverterDetails
        } = req.body;

        if (installationName !== undefined) {
            if (!String(installationName).trim()) {
                return res.status(400).json({ success: false, message: "Installation name cannot be empty" });
            }
            installation.installationName = String(installationName).trim();
        }

        if (capacityKw !== undefined) {
            const cap = Number(capacityKw);
            if (!Number.isFinite(cap) || cap <= 0) {
                return res.status(400).json({ success: false, message: "Capacity must be a positive number in kW" });
            }
            installation.capacityKw = cap;
        }

        if (location !== undefined) {
            const address = typeof location === "string" ? location : location?.address;
            if (address && String(address).trim()) {
                installation.location.address = String(address).trim();
            }
            if (location?.city !== undefined) installation.location.city = String(location.city).trim();
            if (location?.state !== undefined) installation.location.state = String(location.state).trim();
            if (location?.country !== undefined) installation.location.country = String(location.country).trim();
            if (location?.latitude !== undefined) installation.location.latitude = Number(location.latitude) || undefined;
            if (location?.longitude !== undefined) installation.location.longitude = Number(location.longitude) || undefined;
        }

        if (meterIdentifier !== undefined) {
            installation.meterIdentifier = String(meterIdentifier).trim();
        }

        if (commissioningDate !== undefined) {
            installation.commissioningDate = commissioningDate ? new Date(commissioningDate) : undefined;
        }

        if (gridConfiguration !== undefined) {
            if (["grid_connected", "off_grid", "hybrid"].includes(gridConfiguration)) {
                installation.gridConfiguration = gridConfiguration;
            }
        }

        if (inverterDetails !== undefined) {
            installation.inverterDetails = String(inverterDetails).trim();
        }

        await installation.save();

        res.json({
            success: true,
            message: "Solar installation updated successfully",
            installation
        });
    } catch (error) {
        console.error("Update installation error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to update solar installation",
            error: error.message
        });
    }
};

/**
 * Delete / deactivate an installation
 */
exports.deleteInstallation = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;

        const installation = await Installation.findById(id);
        if (!installation || !installation.isActive) {
            return res.status(404).json({ success: false, message: "Solar installation not found" });
        }

        if (installation.userId.toString() !== userId) {
            return res.status(403).json({ success: false, message: "Unauthorized: You do not own this installation" });
        }

        installation.isActive = false;
        await installation.save();

        res.json({
            success: true,
            message: "Solar installation removed successfully"
        });
    } catch (error) {
        console.error("Delete installation error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete solar installation",
            error: error.message
        });
    }
};
