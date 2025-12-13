const fs = require('fs');
const path = require('path');
const { DOMParser } = require('xmldom');
const turf = require('@turf/turf');
const parseSvgPath = require('svg-path-parser');

// Paths
const svgPath = path.join(__dirname, '../../frontend/src/assets/map.svg');
const adjacencyPath = path.join(__dirname, '../models/adjacency.json');
const provincesPath = path.join(__dirname, '../models/provinces.json');

const allProvinces = JSON.parse(fs.readFileSync(provincesPath, 'utf-8'));
const allAdjacency = JSON.parse(fs.readFileSync(adjacencyPath, 'utf-8'));

// Helper: Parse SVG and extract province paths
function parseSVG(svgContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');
  const provinces = {};

  const paths = doc.getElementsByTagName('path');
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const id = path.getAttribute('id');
    if (id && allProvinces.find(p => p.id === id)) {
      const d = path.getAttribute('d');
      provinces[id] = { d, center: null, building: null };
    }
  }

  return { doc, provinces };
}

// Helper: Sample points along a cubic Bezier curve
function sampleCubicBezier(x0, y0, x1, y1, x2, y2, x3, y3, numPoints = 50) {
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const u = 1 - t;
    const x = u*u*u * x0 + 3*u*u*t * x1 + 3*u*t*t * x2 + t*t*t * x3;
    const y = u*u*u * y0 + 3*u*u*t * y1 + 3*u*t*t * y2 + t*t*t * y3;
    points.push({x, y});
  }
  return points;
}

// Helper: Sample points along a line
function sampleLine(x0, y0, x1, y1, numPoints = 50) {
  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const x = x0 + t * (x1 - x0);
    const y = y0 + t * (y1 - y0);
    points.push({x, y});
  }
  return points;
}

// Helper: Get all points from SVG path d, including sampled curve points
function getAllPoints(d) {
  const commands = parseSvgPath(d);
  const points = [];
  let currentX = 0, currentY = 0;
  let startX = 0, startY = 0;

  commands.forEach(cmd => {
    switch (cmd.code) {
      case 'M':
        currentX = cmd.x;
        currentY = cmd.y;
        startX = cmd.x;
        startY = cmd.y;
        points.push({x: cmd.x, y: cmd.y});
        break;
      case 'L':
        const sampled = sampleLine(currentX, currentY, cmd.x, cmd.y);
        points.push(...sampled.slice(1)); // skip first as it's current
        currentX = cmd.x;
        currentY = cmd.y;
        break;
      case 'C':
        const sampledC = sampleCubicBezier(currentX, currentY, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
        points.push(...sampledC.slice(1)); // skip first as it's current
        currentX = cmd.x;
        currentY = cmd.y;
        break;
      case 'Z':
        // Close the path, add start point if not already
        if (points.length > 0 && (points[points.length - 1].x !== startX || points[points.length - 1].y !== startY)) {
          points.push({x: startX, y: startY});
        }
        break;
      // Add other commands if needed, like Q for quadratic
    }
  });

  return points;
}

// Helper: Compute adjacencies by checking if any points from two provinces are close
function computeAdjacencies(provinces, newProvinces) {
  const adjacency = {};
  const allNames = Object.keys(provinces);

  // Get all points for each province
  const allPoints = {};
  allNames.forEach(name => {
    allPoints[name] = getAllPoints(provinces[name].d);
  });

  // For each new province, check adjacency with all others
  const threshold = 2; // pixels
  newProvinces.forEach(newP => {
    adjacency[newP] = [];
    allNames.forEach(other => {
      if (newP === other) return;
      const points1 = allPoints[newP];
      const points2 = allPoints[other];
      let isAdjacent = false;

      for (const p1 of points1) {
        for (const p2 of points2) {
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < threshold) {
            isAdjacent = true;
            break;
          }
        }
        if (isAdjacent) break;
      }

      if (isAdjacent) {
        adjacency[newP].push(other);
        // If other is also new, add mutual
        if (newProvinces.includes(other)) {
          if (!adjacency[other]) adjacency[other] = [];
          adjacency[other].push(newP);
        }
      }
    });
  });

  return adjacency;
}

// Main function
function automateMap(svgPath, adjacencyPath, provincesPath) {
  const newProvinces = allProvinces.filter(p => !allAdjacency[p.id] || allAdjacency[p.id].length === 0).map(p => p.id);
  if (newProvinces.length === 0) {
    console.log('No new or empty provinces to compute adjacencies for.');
    return;
  }
  console.log('Computing adjacencies for:', newProvinces);

  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const { doc, provinces } = parseSVG(svgContent);

  // Compute adjacencies for new provinces
  const adjacency = computeAdjacencies(provinces, newProvinces);
  console.log('Computed adjacency for new provinces.');

  // Update allAdjacency with new ones
  newProvinces.forEach(newP => {
    allAdjacency[newP] = adjacency[newP] || [];
  });

  // Add new provinces to existing neighbors
  newProvinces.forEach(newP => {
    (adjacency[newP] || []).forEach(neigh => {
      if (!newProvinces.includes(neigh)) {
        if (!allAdjacency[neigh]) allAdjacency[neigh] = [];
        if (!allAdjacency[neigh].includes(newP)) {
          allAdjacency[neigh].push(newP);
        }
      }
    });
  });

  // Save updated adjacency
  fs.writeFileSync(adjacencyPath, JSON.stringify(allAdjacency, null, 2));
  console.log('Adjacency updated for new provinces. Check adjacency.json');
}

// Run
automateMap(svgPath, adjacencyPath, provincesPath);