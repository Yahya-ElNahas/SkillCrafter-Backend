import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load adjacency graph
const adjacencyPath = path.join(__dirname, "./models/adjacency.json");
const adjacency = JSON.parse(fs.readFileSync(adjacencyPath, "utf8"));

// Generate provinces list
const provinces = Object.keys(adjacency).map((provinceId) => ({
  id: provinceId,
  controller: "enemy",
  type: "province",
}));

// Save to file (optional)
const outputPath = path.join(__dirname, "./models/provinces.json");
fs.writeFileSync(outputPath, JSON.stringify(provinces, null, 2));

// No module.exports in ES modules