#!/usr/bin/env node
/**
 * Format a Trivy JSON report as plain text for Jenkins artifacts.
 * Usage: node scripts/format-trivy-report.js trivyfs.json > trivyfs.txt
 */
const fs = require('fs');

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  process.stdout.write('No Trivy report found.\n');
  process.exit(0);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch {
  process.stdout.write('Failed to parse Trivy JSON report.\n');
  process.exit(0);
}

const lines = [];
for (const result of data.Results || []) {
  lines.push(`Target: ${result.Target || 'unknown'}`);
  const vulns = result.Vulnerabilities || [];
  if (vulns.length === 0) {
    lines.push('  (no vulnerabilities)');
    continue;
  }
  for (const vuln of vulns) {
    lines.push(
      `  ${vuln.VulnerabilityID || 'unknown'} [${vuln.Severity || '?'}] ${vuln.Title || ''}`.trim(),
    );
  }
  lines.push('');
}

process.stdout.write(`${lines.join('\n')}\n`);
