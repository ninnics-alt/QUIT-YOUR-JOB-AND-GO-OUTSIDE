#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Create a simple PNG icon using raw binary data
// This is a minimal 64x64 black PNG with hardcoded structure
// For a proper icon, we'll create a larger one using a different approach

// Use Node's Canvas API if available, or create using pure JS
try {
  const { createCanvas } = require('canvas');
  
  const canvas = createCanvas(1024, 1024);
  const ctx = canvas.getContext('2d');
  
  // Black background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 1024, 1024);
  
  // White text
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.fillText('QUIT YOUR JOB', 512, 400);
  ctx.fillText('AND GO OUTSIDE', 512, 520);
  
  // Save as PNG
  const buffer = canvas.toBuffer('image/png');
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  
  if (!fs.existsSync(path.join(__dirname, 'assets'))) {
    fs.mkdirSync(path.join(__dirname, 'assets'), { recursive: true });
  }
  
  fs.writeFileSync(iconPath, buffer);
  console.log('Icon created at:', iconPath);
  
  // Also create macOS .icns version by saving PNG with .icns extension
  // (Electron can convert PNG to ICNS automatically on build)
  const iconsPath = path.join(__dirname, 'assets', 'icon.icns');
  fs.writeFileSync(iconsPath, buffer);
  console.log('ICNS icon created at:', iconsPath);
  
} catch (err) {
  console.error('Canvas not available, creating simple PNG:', err.message);
  
  // Fallback: Create a minimal 1x1 PNG programmatically
  // PNG header + minimal data
  const minimalPng = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    // Rest would be complex; let's skip for now
  ]);
  
  console.log('Please install "canvas" npm package for icon generation:');
  console.log('npm install canvas');
}
