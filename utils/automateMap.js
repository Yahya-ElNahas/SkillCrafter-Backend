const fs = require('fs');
const path = require('path');
const { DOMParser } = require('xmldom');

// Paths
const svgPath = path.join(__dirname, '../../frontend/src/assets/map.svg');
const provincesPath = path.join(__dirname, '../models/provinces.json');

const allProvinces = JSON.parse(fs.readFileSync(provincesPath, 'utf-8'));

function setProvinces(svgContent) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgContent, 'image/svg+xml');

  const circles = doc.getElementsByTagName('circle');
  for (let i = 0; i < circles.length; i++) {
    const circle = circles[i];
    const label = circle.getAttribute('inkscape:label');
    if (label && label.startsWith('center_')) {
        const name = label.substring(7);
        if (!allProvinces.find(p => p.id === name)) {
            allProvinces.push({ id: name, type: 'province' });
            console.log('Added province:', name);
        }
    }
  }

  // Save updated provinces back to file
  fs.writeFileSync(provincesPath, JSON.stringify(allProvinces, null, 2), 'utf-8');
  console.log('Provinces updated and saved.');
}

setProvinces(fs.readFileSync(svgPath, 'utf-8'));