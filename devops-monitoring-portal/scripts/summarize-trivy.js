#!/usr/bin/env node
/**
 * Summarize Trivy JSON reports into vulnerability counts by severity.
 * Usage: node scripts/summarize-trivy.js [trivyfs.json] [trivyimage.json]
 * Prints JSON to stdout: { "critical": 0, "high": 0, "medium": 0 }
 */
const fs = require('fs');
const path = require('path');

function countFromFile(filePath) {
  const counts = { critical: 0, high: 0, medium: 0 };
  if (!filePath || !fs.existsSync(filePath)) {
    return counts;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return counts;
  }

  for (const result of data.Results || []) {
    for (const vuln of result.Vulnerabilities || []) {
      const severity = (vuln.Severity || '').toUpperCase();
      if (severity === 'CRITICAL') counts.critical += 1;
      else if (severity === 'HIGH') counts.high += 1;
      else if (severity === 'MEDIUM') counts.medium += 1;
    }
  }

  return counts;
}

function mergeCounts(a, b) {
  return {
    critical: a.critical + b.critical,
    high: a.high + b.high,
    medium: a.medium + b.medium,
  };
}

const fsPath = process.argv[2];
const imagePath = process.argv[3];
const merged = mergeCounts(countFromFile(fsPath), countFromFile(imagePath));

process.stdout.write(`${JSON.stringify(merged)}\n`);
